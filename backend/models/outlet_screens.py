import logging
import hashlib
from datetime import datetime, timezone
from models.active_outlets import get_db_connection
from utils.s3_helper import get_video_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

VALID_SCREEN_TYPES = ("Signage", "Media Player")
VALID_TIERS = ("Tier A", "Tier B")
VALID_ORIENTATIONS = ("Portrait", "Landscape")
VALID_FREQUENCIES = ("Evergreen", "Daily", "LTO")

ALLOWED_UPDATE_FIELDS = {"outlet_uid", "screen_type", "batch_num", "tier",
                         "orientation", "video_uuid", "start_datetime",
                         "end_datetime", "frequency"}

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

_SELECT_JOIN = """
    SELECT
        os.screen_id,
        os.outlet_uid,
        ao.outlet_name,
        os.screen_type,
        os.batch_num,
        os.tier,
        os.orientation,
        os.video_uuid,
        ml.file_name,
        ml.object_key,
        os.created_at,
        os.updated_at,
        os.start_datetime,
        os.end_datetime,
        os.frequency
    FROM outlet_screens os
    JOIN active_outlets ao
        ON os.outlet_uid = ao.uuid
    LEFT JOIN media_library ml
        ON os.video_uuid = ml.media_id
"""

def _row_to_dict(row) -> dict:
    return {
        "screen_id": str(row[0]),
        "outlet_uid": str(row[1]),
        "outlet_name": row[2],
        "screen_type": row[3],
        "batch_num": row[4],
        "tier": row[5],
        "orientation": row[6],
        "video_uuid": str(row[7]) if row[7] else None,
        "video_name": row[8],
        "object_key": row[9],
        "created_at": row[10].isoformat() if row[10] else None,
        "updated_at": row[11].isoformat() if row[11] else None,
        "start_datetime": row[12].isoformat() if row[12] else None,
        "end_datetime": row[13].isoformat() if row[13] else None,
        "frequency": row[14],
    }

def _normalize_outlet_datetime(value: str | None) -> datetime | None:
    """
    Convert an incoming Admin Form datetime into an aware UTC datetime.

    The Admin Form represents Malaysian outlet time (+08:00).

    Examples:

        1970-01-01T10:53:00
        -> 1970-01-01T02:53:00+00:00

        2026-08-21T15:15:00+08:00
        -> 2026-08-21T07:15:00+00:00
    """

    if not value:
        return None

    if isinstance(value, datetime):
        parsed = value
    
    else:
        parsed = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )

    # No timezone supplied.
    #
    # Treat it as Malaysia time because the outlet system
    # is operating on Asia/Kuala_Lumpur time.
    if parsed.tzinfo is None:
        from datetime import timedelta

        malaysia_offset = timezone(
            timedelta(hours=8)
        )

        parsed = parsed.replace(
            tzinfo=malaysia_offset
        )

    return parsed.astimezone(timezone.utc)

def get_all_outlet_screens() -> list:
    try:
        with get_db_connection() as (conn, cur):
            cur.execute(_SELECT_JOIN + " ORDER BY os.created_at DESC;")
            rows = cur.fetchall()
            
            return [_row_to_dict(row) for row in rows]
    
    except Exception as e:
        log.error(f"Error fetching outlet screens: {e}")
        raise ValueError(f"Error fetching outlet screens: {e}")


def get_outlet_screen(screen_id: str) -> dict:
    try:
        with get_db_connection() as (conn, cur):
            query = _SELECT_JOIN + " WHERE os.screen_id = %s;"
            cur.execute(query, [screen_id])
            row = cur.fetchone()
            
            return _row_to_dict(row) if row else None
    
    except Exception as e:
        log.error(f"Error fetching Outlet Screen {screen_id}: {e}")
        raise ValueError(f"Error fetching Outlet Screen {screen_id}: {e}")


def create_outlet_screen(
    outlet_uid: str,
    screen_type: str,
    orientation: str,
    batch_num: int = None,
    tier: str = None,
    video_uuid: str = None,
    start_datetime: str = None,
    end_datetime: str = None,
    frequency: str = "Evergreen") -> dict:
    
    # Ensuring valid screen types
    if screen_type not in VALID_SCREEN_TYPES:
        return {"success": False, "error": f"Screen Type must be of valid {VALID_SCREEN_TYPES}"}

    if orientation not in VALID_ORIENTATIONS:
        return {"success": False, "error": f"orientation must be one of {VALID_ORIENTATIONS}"}

    if tier and tier not in VALID_TIERS:
        return {"success": False, "error": f"tier must be one of {VALID_TIERS}"}

    if frequency not in VALID_FREQUENCIES:
        return {"success": False, "error": f"frequency must be one of {VALID_FREQUENCIES}"}

    if screen_type != "Media Player":
        batch_num = None

    try:
        with get_db_connection() as (conn, cur):
            query = """
                INSERT INTO outlet_screens
                    (outlet_uid, screen_type, batch_num, tier, orientation,
                     video_uuid, start_datetime, end_datetime, frequency)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING screen_id;
            """
            start_datetime = _normalize_outlet_datetime(start_datetime)
            end_datetime = _normalize_outlet_datetime(end_datetime)
            
            cur.execute(query, (outlet_uid, screen_type, batch_num, tier, orientation,
                                 video_uuid, start_datetime, end_datetime, frequency))
            screen_id = cur.fetchone()[0]
            conn.commit()

        return {"success": True, **get_outlet_screen(str(screen_id))}

    except Exception as e:
        log.error(f"Failed to create outlet screen: {e}")
        return {"success": False, "error": str(e)}


def update_outlet_screen(screen_id: str, fields: dict) -> dict:
    if not fields:
        return {"success": False, "error": "No fields provided to update"}

    unknown = set(fields.keys()) - ALLOWED_UPDATE_FIELDS
    
    if unknown:
        return {"success": False, "error": f"Invalid fields: {sorted(unknown)}"}

    if "screen_type" in fields and fields["screen_type"] not in VALID_SCREEN_TYPES:
        return {"success": False, "error": f"screen_type must be one of {VALID_SCREEN_TYPES}"}

    if "orientation" in fields and fields["orientation"] not in VALID_ORIENTATIONS:
        return {"success": False, "error": f"orientation must be one of {VALID_ORIENTATIONS}"}

    if fields.get("tier") and fields["tier"] not in VALID_TIERS:
        return {"success": False, "error": f"tier must be one of {VALID_TIERS}"}

    if "frequency" in fields and fields["frequency"] not in VALID_FREQUENCIES:
        return {"success": False, "error": f"frequency must be one of {VALID_FREQUENCIES}"}
    
    if "start_datetime" in fields:
        fields["start_datetime"] = _normalize_outlet_datetime(fields["start_datetime"])

    if "end_datetime" in fields:
        fields["end_datetime"] = _normalize_outlet_datetime(fields["end_datetime"])

    set_clauses = [f"{col} = %s" for col in fields.keys()]
    set_clauses.append("updated_at = %s")
    
    values = list(fields.values()) + [datetime.now(timezone.utc), screen_id]

    try:
        with get_db_connection() as (conn, cur):
            query = f"""
                UPDATE outlet_screens
                SET {', '.join(set_clauses)}
                WHERE screen_id = %s
                RETURNING screen_id;
            """
            
            cur.execute(query, values)
            result = cur.fetchone()

            if not result:
                return {"success": False, "error": "Screen not found"}
            
            conn.commit()

        return {"success": True, **get_outlet_screen(screen_id)}

    except Exception as e:
        log.error(f"Failed to update outlet screen {screen_id}: {e}")
        return {"success": False, "error": str(e)}


def delete_outlet_screen(screen_id: str) -> dict:
    try:
        with get_db_connection() as (conn, cur):
            query = "DELETE FROM outlet_screens WHERE screen_id = %s RETURNING screen_id;"
            cur.execute(query, [screen_id])
            result = cur.fetchone()
            conn.commit()

            if not result:
                return {"success": False, "error": "Screen not found"}
            
            return {"success": True, "screen_id": str(result[0])}

    except Exception as e:
        log.error(f"Failed to delete outlet screen {screen_id}: {e}")
        return {"success": False, "error": str(e)}

# MEDIA PLAYER READ MODEL
"""
- The client must not receive screen_id / created_at / updated_at.
- The internal query keeps screen_id/created_at for deterministic ordering and
  version calculation, then strips them before returning the response.
"""
_MEDIA_PLAYER_SELECT = """
SELECT
    os.screen_id,
    ao.outlet_id,
    ao.outlet_name,
    ao.tier AS outlet_tier,
    os.outlet_uid,
    os.screen_type,
    os.batch_num,
    os.tier,
    os.orientation,
    os.video_uuid,
    ml.file_name,
    ml.object_key,
    os.created_at,
    os.start_datetime,
    os.end_datetime,
    os.frequency
FROM outlet_screens os
JOIN active_outlets ao
    ON os.outlet_uid = ao.uuid
JOIN media_library ml
    ON os.video_uuid = ml.media_id
WHERE ao.outlet_id = %s
  AND os.screen_type = 'Media Player'
  AND os.batch_num = %s
  AND os.tier = %s
  AND os.orientation = %s
ORDER BY os.created_at ASC;
"""

def _media_type_from_key(object_key: str) -> str:
    lowered = object_key.lower()
    
    if any(lowered.endswith(ext) for ext in VIDEO_EXTENSIONS):
        return "video"
    
    if any(lowered.endswith(ext) for ext in IMAGE_EXTENSIONS):
        return "image"
    
    raise ValueError(f"Unsupported media type: {object_key}")

def _player_row_to_dict(row) -> dict:
    object_key = row[11]

    if not object_key:
        raise ValueError(
            f"Media library object_key is missing for video_uuid={row[9]}"
        )

    url = get_video_url(object_key)

    log.info(
        "[MEDIA PLAYER] Resolved media URL | key=%s | url=%s",
        object_key,
        url,
    )

    return {
        "outlet_id": str(row[1]),
        "outlet_name": row[2],
        "outlet_tier": row[3],
        "outlet_uid": str(row[4]),
        "screen_type": row[5],
        "batch_num": row[6],
        "tier": row[7],
        "orientation": row[8],
        "video_uuid": str(row[9]) if row[9] else None,
        "video_name": row[10],
        "object_key": object_key,
        "url": url,
        "created_at": row[12].isoformat() if row[12] else None,
        "start_datetime": row[13].isoformat() if row[13] else None,
        "end_datetime": row[14].isoformat() if row[14] else None,
        "frequency": row[15],
        "type": _media_type_from_key(object_key),
    }

def _fetch_media_player_rows(
    outlet_id: str,
    batch_number: int,
    tier: str,
    orientation: str,
) -> list:
    with get_db_connection() as (conn, cur):
        cur.execute(
            _MEDIA_PLAYER_SELECT,
            (
                outlet_id,
                batch_number,
                tier,
                orientation,
            ),
        )
        return cur.fetchall()
    
def get_media_player_screens(
    outlet_id: str,
    batch_number: int,
    tier: str,
    orientation: str,
) -> dict:
    """
    Resolve all Media Player configurations for the selected login values.

    Exact duplicate video_uuid entries are removed. The first configuration
    row wins, which preserves Admin-form creation order.
    """
    rows = _fetch_media_player_rows(
        outlet_id,
        batch_number,
        tier,
        orientation,
    )
    
    if not rows:
        return{
            "outlet": None,
            "screens": [],
            "etag": hashlib.sha256(b"").hexdigest()[:12]
        }
    
    outlet = {
        "outlet_id": str(rows[0][1]),
        "outlet_name": rows[0][2],
        "tier": rows[0][3],
    }

    screens = []
    seen_media = set()
    
    for row in rows:
        video_uuid = row[9]

        if video_uuid in seen_media:
            log.warning(
                "[MEDIA PLAYER] Duplicate media detected for outlet=%s video_uuid=%s; skipping duplicate row",
                outlet_id,
                video_uuid,
            )
            continue

        seen_media.add(video_uuid)

        item = _player_row_to_dict(row)
        item.pop("outlet_uid", None)
        item.pop("created_at", None)
        item.pop("outlet_id", None)
        item.pop("outlet_name", None)
        item.pop("outlet_tier", None)

        screens.append(item)
    
    return {
        "outlet": outlet,
        "screens": screens,
        "etag": compute_media_player_etag(rows),
    }

def compute_media_player_etag(rows: list) -> str:
    fingerprint_parts = []

    for row in rows:
        fingerprint_parts.append(
            "|".join(
                [
                    str(row[0]),  # screen_id
                    str(row[5]),  # screen_type
                    str(row[6]),  # batch_num
                    str(row[7]),  # tier
                    str(row[8]),  # orientation
                    str(row[9]),  # video_uuid
                    str(row[11]), # object_key
                    row[13].isoformat() if row[13] else "",
                    row[14].isoformat() if row[14] else "",
                    str(row[15] or ""),
                ]
            )
        )

    fingerprint = "\n".join(fingerprint_parts)

    return hashlib.sha256(
        fingerprint.encode("utf-8")
    ).hexdigest()[:12]

def get_media_player_version(
    outlet_id: str,
    batch_number: int,
    tier: str,
    orientation: str,
) -> dict:
    rows = _fetch_media_player_rows(
        outlet_id,
        batch_number,
        tier,
        orientation,
    )

    unique_rows = []
    seen_media = set()

    for row in rows:
        video_uuid = row[9]
        if video_uuid in seen_media:
            continue
        seen_media.add(video_uuid)
        unique_rows.append(row)

    return {
        "etag": compute_media_player_etag(unique_rows),
        "itemCount": len(unique_rows),
    }