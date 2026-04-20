import logging
import os

import boto3
from flask import Blueprint, jsonify

s3 = boto3.client("s3")
BUCKET = os.getenv("VIDEO_BUCKET_NAME")


# LOGGING SETUP
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

video_bp = Blueprint("video", __name__)

@video_bp.route("/videos", methods=["GET"])
def videos():
    log.info("Fetching videos from S3 Bucket....")

    videos = get_videos_for_outlet()

    return jsonify(videos or []), 200


def list_videos_for_outlet():
    log.info(f"Listing all S3 objects in bucket: {BUCKET}")
    
    response = s3.list_objects_v2(Bucket=BUCKET)
    
    if "Contents" not in response:
        log.warning("No objects found in S3 bucket")
        return []

    keys = [
        obj["Key"]
        for obj in response["Contents"]
        if obj["Key"].endswith(".mp4")
    ]
    
    log.info(f"Found {len(keys)} video(s):")
    for key in keys:
        log.info(f"  - {key}")
    
    return keys

def generate_signed_url(key: str):
    return s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET,
            "Key": key
        },
        ExpiresIn=3600
    )

def get_videos_for_outlet():
    keys = list_videos_for_outlet()

    videos = []
    for key in keys:
        url = generate_signed_url(key)
        log.info(f"Generated signed URL for {key}: {url[:80]}...") # Truncate so it doesn't flood the console
        videos.append({
            "videoURI": url,
            "rotate": False
        })
    log.info(f"Returning {len(videos)} video(s).")
    return videos