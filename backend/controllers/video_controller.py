import logging
import os

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from flask import Blueprint, jsonify

load_dotenv()

BUCKET = os.getenv("VIDEO_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-5")

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com"
)

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
    if not BUCKET:
        log.error("VIDEO_BUCKET_NAME is not set")
        return jsonify({
            "error": "Server misconfiguration: VIDEO_BUCKET_NAME missing"
        }), 500
        
    log.info("Fetching videos from S3 Bucket....")

    try:
        payload = get_videos_for_outlet()
        return jsonify(payload), 200
    except (ClientError, BotoCoreError) as e:
        log.exception("Failed fetching videos from S3: %s", e)
        return jsonify({"error": "Failed to fetch videos from S3"}), 500


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
    return keys

def get_videos_for_outlet():
    keys = list_videos_for_outlet()

    videos = []
    for key in keys:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": key},
            ExpiresIn=3600,  # 1 hour
        )
        
        log.info(f"Generated signed URL for {key}: {url[:80]}...") # Truncate so it doesn't flood the console
        videos.append({
            "videoURI": url,
            "rotate": False
        })
    log.info(f"Returning {len(videos)} video(s).")
    return videos