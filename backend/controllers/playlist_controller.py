from flask import Blueprint, jsonify, request
from services.playlist_service import PlaylistService

playlist_bp = Blueprint("playlist", __name__)

playlist_service = PlaylistService()

# ===================================
# MIXED MEDIA PLAYLIST ENDPOINT
# ===================================
# Used for:
# - Mixed media screen
# - Staff chooses batch and tier manually
#
# Example:
# POST /playlist
# {
#   "outlet_id": "42",
#   "batch_number": 2,
#   "tier": "Tier A",
#   "orientation": "Landscape"
# }
# ===================================

@playlist_bp.route("/playlist", methods=["POST"])
def get_playlist():
    try:
        data = request.get_json()

        outlet_id = str(data.get("outlet_id", "")).strip()
        batch_number = data.get("batch_number")
        tier = data.get("tier").strip()
        orientation = data.get("orientation", "Landscape").strip()

        if not outlet_id or batch_number is None:
            return jsonify({
                "success": False,
                "message": "No Outlet ID or Batch Number Found"
            }), 400

        if tier not in ("Tier A", "Tier B"):
            return jsonify({
                "success": False,
                "message": "Invalid tier. Must be 'Tier A' or 'Tier B'"
            }), 400

        playlist = playlist_service.get_playlist(outlet_id, batch_number, tier, orientation)

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
# - ALWAYS points to "Digital Signage/" directory
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


@playlist_bp.route("/signage_status", methods=["GET"])
def signage_status():
    try:
        has_videos = playlist_service.has_signage_videos()

        return jsonify({
            "success": True,
            "hasVideos": has_videos
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# ================================
# PLAYLIST VERSION CHECK
# ================================
# Lightweight endpoint — no media URLs generated, just an etag.
# Frontend calls this periodically to detect new content.
#
# POST /playlist_version
# {
#   "outlet_id": "42",
#   "batch_number": 1,
#   "tier": "Tier A",
#   "orientation": "Landscape"
# }
# ================================
@playlist_bp.route("/playlist_version", methods=["POST"])
def get_playlist_version():
    try:
        data = request.get_json()

        outlet_id = str(data.get("outlet_id", "")).strip()
        batch_number = data.get("batch_number", 1)
        tier = data.get("tier", "Tier A").strip()
        orientation = data.get("orientation", "Landscape")

        print("\n========== PLAYLIST VERSION REQUEST ==========")
        print(f"OUTLET ID   : {outlet_id}")
        print(f"BATCH       : {batch_number}")
        print(f"TIER        : {tier}")
        print(f"ORIENTATION : {orientation}")

        if not outlet_id:
            return jsonify({
                "success": False,
                "message": "Outlet ID is required"
            }), 400

        if tier not in ("Tier A", "Tier B"):
            return jsonify({
                "success": False,
                "message": "Invalid tier. Must be 'Tier A' or 'Tier B'"
            }), 400

        version = playlist_service.get_playlist_version(
            outlet_id,
            batch_number,
            tier,
            orientation
        )

        print(f"RETURNING VERSION: {version}")

        return jsonify({
            "success": True,
            **version
        }), 200

    except Exception as e:
        print(f"[PLAYLIST VERSION ERROR] {e}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# ================================
# SIGNAGE VERSION CHECK
# ================================
# GET /signage_version
# ================================
@playlist_bp.route("/signage_version", methods=["GET"])
def get_signage_version():
    try:
        print("\n========== SIGNAGE VERSION REQUEST ==========")

        version = playlist_service.get_signage_version()
        print(f"RETURNING VERSION: {version}")

        return jsonify({
            "success": True,
            **version
        }), 200

    except Exception as e:
        print(f"[SIGNAGE VERSION ERROR] {e}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500