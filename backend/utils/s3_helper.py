import os

import boto3

BUCKET_NAME = os.getenv("VIDEO_BUCKET_NAME")

VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv"
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
}

s3 = boto3.client("s3", region_name="ap-southeast-5", endpoint_url="https://s3.ap-southeast-5.amazonaws.com")

def get_s3_playlist_media(prefix: str):
    """
    Fetch mixed media from S3 Bucket
    
    Example:
    Selangor/Batch 1/
    """
    playlist = []
    
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket = BUCKET_NAME,
        Prefix=prefix
    )
    
    for page in pages:
        
        for obj in page.get("Contents", []):
            
            key = obj.get("Key","")
            lower_key = key.lower()
            
            # Generate secure temporary URL
            url = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": BUCKET_NAME,
                    "Key": key
                },
                ExpiresIn = 86400 # 24 Hours
            )
            
            # VIDEO
            if lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                playlist.append({
                    "type": "video",
                    "url": url,
                    "rotate": False
                })
            
            # IMAGE
            if lower_key.endswith(tuple(IMAGE_EXTENSIONS)):
                playlist.append({
                    "type": "image",
                    "url": url
                })
    return playlist

def get_video_media(prefix: str):
    """
    Fetch only videos from S3 Bucket
    
    Example:
    Selangor/Batch 1/
    """
    videos = []
    
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket = BUCKET_NAME,
        Prefix=prefix
    )
    
    for page in pages:
        
        for obj in page.get("Contents", []):
            key = obj.get("Key","")
            lower_key = key.lower()
            
            # Generate secure temporary URL
            url = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": BUCKET_NAME,
                    "Key": key
                },
                ExpiresIn = 86400 # 24 Hours
            )

            if lower_key.endswith(tuple(VIDEO_EXTENSIONS)):
                videos.append({
                    "type": "video",
                    "videoURI": url,
                    "rotate": False
                })
    
    return videos