from flask import Blueprint, jsonify, request
from services.playlist_service import PlaylistService

playlist_bp = Blueprint("playlist", __name__)

playlist_service = PlaylistService()

# ===================================
# MIXED MEDIA PLAYLIST ENDPOINT
# ===================================
# Used for:
# - Mixed media screen
# - Staff chooses batch manually
#
# Example:
# POST /playlist
# {
#   "outlet_id": "OUTLET_001",
#   "batch_number": 2
# }
# ===================================

@playlist_bp.route("/playlist", methods=["POST"])
def get_playlist():
    try:
        data = request.get_json()
        
        outlet_id = str(data.get("outlet_id", "")).strip()
        batch_number = data.get("batch_number")
        
        if not outlet_id and batch_number is None:
            return jsonify({
                "success": False,
                "message": "No Outlet ID or Batch Number Found"
            }), 400
        
        playlist = playlist_service.get_playlist(outlet_id, batch_number)
        
        return jsonify({
            "success": True,
            "playlist": playlist
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

# ================================
# SIGNAGE SCREEN VIDEOS ENDPOINT
# ================================
# Used for:
# - Standard videos for Digital Signage Screen
# - ALWAYS points to "Digital Signage/"" directory
# ================================
@playlist_bp.route("/signage_videos", methods=["GET"])
def get_videos():
    try:
        videos = playlist_service.get_signage_videos()
        
        return jsonify({
            "success": True,
            "videos": videos
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        