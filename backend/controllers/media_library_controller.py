from flask import Blueprint, jsonify

from services.media_library_service import refresh_media_library, fetch_media_preview_url

media_library_bp = Blueprint("media_library", __name__, url_prefix="/admin/media-library")

@media_library_bp.route("", methods=["GET"])
def refresh_media_library_route():
    try:
        media = refresh_media_library()
        return jsonify({
            "success": True,
            "data": media
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@media_library_bp.route("/<media_id>/preview" ,methods=["GET"])
def get_media_preview_url_route(media_id):
    result = fetch_media_preview_url(media_id)
    
    if not result.get("success"):
        status = 404 if "not found" in result.get("error", "").lower() else 500
        
        return jsonify(result), status

    return jsonify(result), 200