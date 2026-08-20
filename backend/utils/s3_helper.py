import os
import boto3
from pathlib import PurePosixPath
from urllib.parse import quote
from warnings import warn


BUCKET_NAME = os.getenv("VIDEO_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_VIDEO_SIZE_MB = 60

s3 = boto3.client("s3", region_name="ap-southeast-5", endpoint_url="https://s3.ap-southeast-5.amazonaws.com")


def bytes_to_mb(size_bytes: int) -> float:
    return round(size_bytes / (1024 * 1024), 2)

def get_media_type(key: str) -> str:
    lowered = key.lower()

    if any(lowered.endswith(ext) for ext in VIDEO_EXTENSIONS):
        return "video"

    if any(lowered.endswith(ext) for ext in IMAGE_EXTENSIONS):
        return "image"

    raise ValueError(f"Unsupported media type: {key}")

def get_cloudfront_url(key: str) -> str:
    encoded_key = quote(key, safe="/")
    return f"https://{CLOUDFRONT_DOMAIN}/{encoded_key}"


def get_video_url(key: str) -> str:
    """
    Returns a CloudFront URL if the distribution is configured.
    Falls back to a pre-signed S3 URL if not.

    This lets you test before CloudFront is confirmed ready.
    """
    if not CLOUDFRONT_DOMAIN:
        raise ValueError(
            "CLOUDFRONT_DOMAIN is not configured"
        )

    if not key:
        raise ValueError(
            "S3 object key is required"
        )

    return get_cloudfront_url(key)

def get_s3_playlist_media(prefix: str):
    """
        Fetch mixed media from S3 Bucket
    """
    if not BUCKET_NAME:
        raise ValueError("VIDEO_BUCKET_NAME is not configured")
    
    playlist = []
    paginator = s3.get_paginator("list_objects_v2")
    
    for page in paginator.paginate(
        Bucket = BUCKET_NAME,
        Prefix= prefix
    ):
        for obj in page.get("Contents", []):
            key = obj.get("Key", "")
            lower_key = key.lower()
            
            if key.endswith("/"):
                continue
            
            url = get_video_url(key)
            
            if lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                file_size_mb = bytes_to_mb(obj.get("Size", 0))
                
                if file_size_mb > MAX_VIDEO_SIZE_MB:
                    warn(f"Large video: {key} ({file_size_mb} MB) — may buffer on weak TVs")
                
                playlist.append({
                    "key": key,
                    "type": "video",
                    "url": url,
                    "rotate": False,
                    "sizeMb": file_size_mb,
                })
            
            elif lower_key.endswith(tuple(IMAGE_EXTENSIONS)):
                playlist.append({
                    "key": key,
                    "type": "image",
                    "url": url,
                })
        
        return playlist
    

def list_s3_objects(prefix: str):
    """
    Returns media objects used for versioning.
    Version changes when files are:
    - added
    - removed
    - renamed
    - replaced
    """

    objects = []
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(
        Bucket=BUCKET_NAME,
        Prefix=prefix
    ):
        for obj in page.get("Contents", []):

            key = obj.get("Key", "")
            lower_key = key.lower()

            if not (
                lower_key.endswith(tuple(VIDEO_EXTENSIONS))
                or lower_key.endswith(tuple(IMAGE_EXTENSIONS))
            ):
                continue

            objects.append({
                "key": key,
                "size": obj.get("Size", 0),
                "modified": obj.get("LastModified").isoformat(),
            })

    return objects

def get_video_media(prefix: str):
    """
    - Fetch only videos from S3 Bucket
    - Returns CloudFront URLs if configured, pre-signed S3 URLs otherwise./
    """
    if not BUCKET_NAME:
        raise ValueError("VIDEO_BUCKET_NAME is not configured")
    
    videos = []    
    paginator = s3.get_paginator("list_objects_v2")
        
    for page in paginator.paginate(
        Bucket= BUCKET_NAME,
        Prefix= prefix,
    ):
        for obj in page.get("Contents", []):
            key = obj.get("Key","")
            lower_key = key.lower()
            
            if not lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                continue
            
            file_size_mb = bytes_to_mb(obj.get("Size", 0))
            
            if file_size_mb > MAX_VIDEO_SIZE_MB:
                warn(f"⚠ Large video: {key} ({file_size_mb} MB) — may buffer on weak TVs")
            
            videos.append({
                "type": "video",
                "videoURI": get_video_url(key),
                "rotate": False,
                "sizeMb": file_size_mb,
                "optimized": file_size_mb <= MAX_VIDEO_SIZE_MB,
                "key": key,
            })
            
    print("\n========== VIDEO FETCH COMPLETE ==========")
    print(f"VIDEOS: {len(videos)}")
    print(f"TOTAL SIZE: {round(file_size_mb,2)} MB")
    print(f"AVG SIZE: {round(file_size_mb/max(len(videos),1),2)} MB")
    
    return videos