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
# VIDEO SIGNAGE ENDPOINT
# ================================
# Used for:
# - Standard signage screen
# - ALWAYS points to Batch 1
#
# Example:
# POST /videos
# {
#   "outlet_id": "42"
# }
# ================================
@playlist_bp.route("/videos", methods=["POST"])
def get_videos():
    try:
        data = request.get_json()
        
        outlet_id = str(data.get("outlet_id", "")).strip()
        
        if not outlet_id:
            return jsonify({
                "success": False,
                "message": "Outlet ID Not Found"
            }), 400
        
        videos = playlist_service.get_signage_videos(outlet_id)
        
        return jsonify({
            "success": True,
            "videos": videos
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        