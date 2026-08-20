import logging
from datetime import datetime, timezone

from models.active_outlets import get_db_connection

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


def _row_to_dict(row) -> dict:
    """
    Maps a row from _SELECT_JOIN to a JSON-safe dict.
    outlet_name and video_name are NOT columns on outlet_screens — they come
    from the joins to active_outlets and media_library respectively.
    Column order from _SELECT_JOIN:
    screen_id, outlet_uid, outlet_name, screen_type, batch_num, tier,
    orientation, video_uuid, file_name, created_at, updated_at,
    start_datetime, end_datetime, frequency
    """
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
        "created_at": row[9].isoformat() if row[9] else None,
        "updated_at": row[10].isoformat() if row[10] else None,
        "start_datetime": row[11].isoformat() if row[11] else None,
        "end_datetime": row[12].isoformat() if row[12] else None,
        "frequency": row[13],
    }


_SELECT_JOIN = """
    SELECT os.screen_id, os.outlet_uid, ao.outlet_name, os.screen_type,
           os.batch_num, os.tier, os.orientation, os.video_uuid, ml.file_name,
           os.created_at, os.updated_at, os.start_datetime, os.end_datetime, os.frequency
    FROM outlet_screens os
    JOIN active_outlets ao ON os.outlet_uid = ao.uuid
    LEFT JOIN media_library ml ON os.video_uuid = ml.media_id
"""


def get_all_outlet_screens() -> list:
    try:
        with get_db_connection() as (conn, cur):
            query = _SELECT_JOIN + " ORDER BY os.created_at DESC;"
            cur.execute(query)
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
            conn.commit()

            if not result:
                return {"success": False, "error": "Screen not found"}

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