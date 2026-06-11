import os
from urllib.parse import quote
from warnings import warn

import boto3

BUCKET_NAME = os.getenv("VIDEO_BUCKET_NAME")
CLOUDFRONT_DOMAIN = os.getenv("CLOUDFRONT_DOMAIN")

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_VIDEO_SIZE_MB = 60

s3 = boto3.client("s3", region_name="ap-southeast-5", endpoint_url="https://s3.ap-southeast-5.amazonaws.com")


def bytes_to_mb(size_bytes):
    return round(size_bytes / (1024 * 1024), 2)


def get_cloudfront_url(key: str) -> str:
    """
    Builds a CloudFront URL from an S3 key.
    Spaces and special characters in the key are encoded.

    Example:
        key: Selangor/Videos/My Video.mp4
        returns: https://d30au7cngoylsj.cloudfront.net/Selangor/Videos/My%20Video.mp4
    """
    encoded_key = quote(key, safe="/")
    return f"https://{CLOUDFRONT_DOMAIN}/{encoded_key}"


def get_video_url(key: str) -> str:
    """
    Returns a CloudFront URL if the distribution is configured.
    Falls back to a pre-signed S3 URL if not.

    This lets you test before CloudFront is confirmed ready.
    """
    if CLOUDFRONT_DOMAIN:
        print(f"[URL SOURCE] CloudFront → {CLOUDFRONT_DOMAIN}")
        return get_cloudfront_url(key)
    else:
        print("[URL SOURCE] S3 Pre-signed (CloudFront not configured)")
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": key},
            ExpiresIn=86400
        )

def get_s3_playlist_media(prefix: str):
    """
    - Fetch mixed media from S3 Bucket
    - Returns CloudFront URLs if configured, pre-signed S3 URLs otherwise.
    
    Example:
    Selangor/Batch 1/
    """
    playlist = []
    playlist_size = 0
    image_count = 0
    video_count = 0
    
    print(f"[S3 SEARCH PREFIX]: {prefix}")
    
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket = BUCKET_NAME,
        Prefix=prefix
    )
    
    for page in pages:
        
        for obj in page.get("Contents", []):
            
            key = obj.get("Key","")
            lower_key = key.lower()
            
            # Generate secure URL
            url = get_video_url(key)
            print(f"[VIDEO URL]: {url}")
            
            # VIDEO
            if lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                file_size_bytes = obj.get("Size", 0)
                file_size_mb = bytes_to_mb(file_size_bytes)
                video_count += 1
                playlist_size += file_size_mb
                
                print("VIDEO FOUND")
                print(f"KEY: {key}")
                print(f"SIZE: {file_size_mb} MB")
                
                if file_size_mb > MAX_VIDEO_SIZE_MB:
                    warn(f"⚠ Large video: {key} ({file_size_mb} MB) — may buffer on weak TVs")
                
                playlist.append({
                    "type": "video",
                    "url": url,
                    "rotate": False
                })
            
            # IMAGE
            if lower_key.endswith(tuple(IMAGE_EXTENSIONS)):
                image_count += 1
                playlist_size += bytes_to_mb(obj.get("Size",0))
                playlist.append({
                    "type": "image",
                    "url": url
                })
    return playlist

def list_s3_objects(prefix: str):
    """
    Returns media objects used for versioning.

    We include:
    - key
    - size
    - last modified

    so version changes when files are:
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

            is_media = (
                lower_key.endswith(tuple(VIDEO_EXTENSIONS))
                or
                lower_key.endswith(tuple(IMAGE_EXTENSIONS))
            )

            if not is_media:
                continue

            objects.append({
                "key": key,
                "size": obj.get("Size", 0),
                "modified": obj.get("LastModified").isoformat()
            })

    return objects

def get_video_media(prefix: str):
    """
    - Fetch only videos from S3 Bucket
    - Returns CloudFront URLs if configured, pre-signed S3 URLs otherwise.
    
    Example:
    Selangor/Batch 1/
    """
    videos = []
    total_size = 0
    print(f"\n[S3 SEARCH] Prefix: {prefix}")
    
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket = BUCKET_NAME,
        Prefix=prefix
    )
    
    for page in pages:
        
        for obj in page.get("Contents", []):
            key = obj.get("Key","")
            lower_key = key.lower()
            
            if not lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                continue
            file_size_bytes = obj.get("Size", 0)
            file_size_mb = bytes_to_mb(file_size_bytes)

            total_size += file_size_mb
            
            print("\n[VIDEO FOUND]")
            print(f"KEY: {key}")
            print(f"SIZE: {file_size_mb} MB")
            
            if file_size_mb > MAX_VIDEO_SIZE_MB:
                warn(f"⚠ Large video: {key} ({file_size_mb} MB) — may buffer on weak TVs")
            
            # Generate secure URL
            url = get_video_url(key)
            print(f"[MEDIA URL]: {url}")
            
            videos.append({
                "type": "video",
                "videoURI": url,
                "rotate": False,
                "sizeMb": file_size_mb,
                "optimized": file_size_mb <= MAX_VIDEO_SIZE_MB
            })
            
    print("\n========== VIDEO FETCH COMPLETE ==========")
    print(f"VIDEOS: {len(videos)}")
    print(f"TOTAL SIZE: {round(total_size,2)} MB")
    print(f"AVG SIZE: {round(total_size/max(len(videos),1),2)} MB")
    
    return videos