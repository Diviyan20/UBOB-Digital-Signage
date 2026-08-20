import os
import boto3
from pathlib import PurePosixPath
from models.active_outlets import get_db_connection

BUCKET_NAME = os.getenv("VIDEO_BUCKET_NAME")
S3_PREFIX = os.getenv("S3_MEDIA_PREFIX", "Global/")

s3_client = boto3.client("s3", region_name="ap-southeast-5", endpoint_url="https://s3.ap-southeast-5.amazonaws.com",)

def sync_media_library():
    """
    Synchronize the media_library table with the contents
    of the Global/ folder in the S3 bucket.

    S3 is the source of truth.

    - Adds new S3 objects to the database.
    - Updates existing records if the filename changes.
    - Removes database records whose S3 objects no longer exist.
    """
    if not BUCKET_NAME:
        raise ValueError("VIDEO_BUCKET_NAME environment variable is not configured")
        
    try:
        # ---------------------------------------------------------
        # 1. Get all media objects from S3
        # ---------------------------------------------------------
        s3_objects = []

        paginator = s3_client.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=S3_PREFIX):
            for obj in page.get("Contents", []):
                object_key = obj["Key"]

                # Ignore the "Global/" folder placeholder
                if object_key.endswith("/"):
                    continue

                file_name = PurePosixPath(object_key).name

                s3_objects.append({
                    "file_name": file_name,
                    "object_key": object_key
                })

        # ---------------------------------------------------------
        # 2. Synchronize database
        # ---------------------------------------------------------
        with get_db_connection() as (conn, cur):
            # -----------------------------------------------------
            # Add/update S3 objects
            # -----------------------------------------------------
            for media in s3_objects:
                query = """
                    INSERT INTO media_library (
                        file_name,
                        object_key
                    )
                    VALUES (%s, %s)

                    ON CONFLICT (object_key)
                    DO UPDATE SET
                        file_name = EXCLUDED.file_name;
                """
                cur.execute(
                    query, 
                    (media["file_name"], media["object_key"],)
                )
            # -----------------------------------------------------
            # Find database records that no longer exist in S3
            # -----------------------------------------------------
            cur.execute("""SELECT object_key FROM media_library;""")

            database_keys = {
                row[0]
                for row in cur.fetchall()
            }

            s3_keys = {
                media["object_key"]
                for media in s3_objects
            }

            stale_keys = database_keys - s3_keys
            
            # -----------------------------------------------------
            # Remove stale database records
            # -----------------------------------------------------
            for object_key in stale_keys:
                cur.execute("""DELETE FROM media_library WHERE object_key = %s;""",
                    (object_key,)
                )
            conn.commit()

        return s3_objects

    except Exception as e:
        raise ValueError(f"Error synchronizing media library: {e}")

def get_all_media():
    """
    Retrieve all media records from the database.
    This function is read-only.
    """
    try:
        with get_db_connection() as (conn, cur):
            query = """
                SELECT
                    media_id,
                    file_name,
                    object_key,
                    created_at
                FROM media_library
                ORDER BY file_name ASC;
            """
            cur.execute(query)
            media = cur.fetchall()

            return [
                {
                    "media_id": str(row[0]),
                    "file_name": row[1],
                    "object_key": row[2],
                    "created_at": (
                        row[3].isoformat()
                        if row[3]
                        else None
                    ),
                }
                for row in media
            ]

    except Exception as e:
        raise ValueError(f"Error fetching media library: {e}")

def get_media_by_id(media_id: str) -> dict:
    """
       Read-only lookup of a single media record.
       Returns None if not found
    """
    try:
        with get_db_connection() as (conn, cur):
            query = """
                SELECT media_id, file_name, object_key
                FROM media_library
                WHERE media_id = %s;
            """
            cur.execute(query, [media_id])
            row = cur.fetchone()
            
            if not row:
                return None
            
            return{
                "media_id": str(row[0]),
                "file_name": row[1],
                "object_key": row[2],
            }
            
    except Exception as e:
        raise ValueError(f"Error fetching media {media_id}: {e}")

def generate_preview_url(media_id: str, expires_in: int = 300) -> dict:
    """
    Returns a short-lived presigned S3 GET URL for the given media item.
    Default expiry is 5 minutes — long enough to load a preview, short
    enough that the URL isn't useful if it leaks (browser history, logs).
    """
    if not BUCKET_NAME:
        return {
            "success": False, 
            "error": "VIDEO_BUCKET_NAME environment variable is not configured"
            }

    media = get_media_by_id(media_id)
    
    if not media:
        return{
            "success": False, 
            "error": "Media not found"
        }
        
    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": media["object_key"]},
            ExpiresIn=expires_in,
        )
        return {
            "success": True, 
            "url": url, 
            "file_name": media["file_name"]
            }
    
    except Exception as e:
        return {
            "success": False, 
            "error": str(e)
            }