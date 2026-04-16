import os

import boto3

s3 = boto3.client("s3")
BUCKET = os.getenv("VIDEO_BUCKET_NAME")


def list_videos_for_outlet(outlet_id: str):
    prefix = f"outlets/{outlet_id}"
    
    response = s3.list_objects_v2(
        Bucket=BUCKET,
        Prefix=prefix
    )
    
    if "Contents" not in response:
        return []

    return [
        obj["Key"]
        for obj in response["Contents"]
        if obj["Key"].endswith(".mp4")
    ]

def generate_signed_url(key: str):
    return s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET,
            "Key": key
        },
        ExpiresIn=3600
    )

def get_videos_for_outlet(outlet_id: str):
    keys = list_videos_for_outlet(outlet_id)

    videos = []
    for key in keys:
        videos.append({
            "videoURI": generate_signed_url(key),
            "rotate": False
        })

    return videos