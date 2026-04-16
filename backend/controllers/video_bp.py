import logging

from controllers.video_controller import get_videos_for_outlet
from flask import Blueprint, jsonify

# LOGGING SETUP
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

video_bp = Blueprint("video", __name__)

@video_bp.route("/videos/<outlet_id>", methods=["GET"])
def videos(outlet_id):
    log.info(f"Fetching videos for {outlet_id}")

    videos = get_videos_for_outlet(outlet_id)

    return jsonify(videos or []), 200