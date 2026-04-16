from controllers.media_controller import get_media_json, stream_image
from flask import Blueprint, jsonify

media_bp = Blueprint("media", __name__)

@media_bp.route("/get_media", methods=["GET"])
def get_media():
    media = get_media_json()
    return jsonify({"media": media}), 200

@media_bp.route("/image/<image_id>")
def image(image_id):
    return stream_image(image_id)