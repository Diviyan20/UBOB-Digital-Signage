from flask import Blueprint, jsonify, request
from services.outlet_screen_service import (
    add_outlet_screen,
    edit_outlet_screen,
    fetch_all_outlet_screens,
    fetch_media_player_screens,
    fetch_media_player_version,
    fetch_outlet_screen,
    remove_outlet_screen,
)

outlet_screen_bp = Blueprint("outlet_screens", __name__, url_prefix="/outlet-screens")


# ===============
# ADMIN CRUD
# ===============
@outlet_screen_bp.route("", methods=["GET"])
def get_all_outlet_screens_route():
    try:
        data = fetch_all_outlet_screens()
        return jsonify({"success": True, "data": data}), 200
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@outlet_screen_bp.route("/<screen_id>", methods=["GET"])
def get_outlet_screen_route(screen_id):
    try:
        data = fetch_outlet_screen(screen_id)
        
        if not data:
            return jsonify({"success": False, "error": "Screen not found"}), 404
        
        return jsonify({"success": True, "data": data}), 200
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@outlet_screen_bp.route("", methods=["POST"])
def create_outlet_screen_route():
    data = request.get_json(silent=True, force=True)
    
    if not data:
        return jsonify({"success": False, "error": "Invalid or missing JSON"}), 400

    outlet_uid = data.get("outlet_uid")
    screen_type = data.get("screen_type")
    orientation = data.get("orientation")

    if not all([outlet_uid, screen_type, orientation]):
        return jsonify({"success": False, "error": "outlet_uid, screen_type, and orientation are required"}), 400

    result = add_outlet_screen(
        outlet_uid=outlet_uid,
        screen_type=screen_type,
        orientation=orientation,
        batch_num=data.get("batch_num"),
        tier=data.get("tier"),
        video_uuid=data.get("video_uuid"),
        start_datetime=data.get("start_datetime"),
        end_datetime=data.get("end_datetime"),
        frequency=data.get("frequency") or "Evergreen",
    )

    if not result.get("success"):
        return jsonify(result), 400

    return jsonify(result), 201


@outlet_screen_bp.route("/<screen_id>", methods=["PUT"])
def update_outlet_screen_route(screen_id):
    data = request.get_json(silent=True, force=True)
    
    if not data:
        return jsonify({"success": False, "error": "Invalid or missing JSON"}), 400

    result = edit_outlet_screen(screen_id, data)

    if not result.get("success"):
        status = 404 if "not found" in result.get("error", "").lower() else 400
        return jsonify(result), status

    return jsonify(result), 200


@outlet_screen_bp.route("/<screen_id>", methods=["DELETE"])
def delete_outlet_screen_route(screen_id):
    result = remove_outlet_screen(screen_id)

    if not result.get("success"):
        status = 404 if "not found" in result.get("error", "").lower() else 400
        
        return jsonify(result), status

    return jsonify(result), 200

# ===========================
# MEDIA PLAYER RUNTIME API
# ===========================
def _parse_player_request():
    data = request.get_json(silent=True, force=True) or {}
    
    outlet_id = str(data.get("outlet_id", "")).strip()
    batch_number = data.get("batch_number")
    tier = str(data.get("tier", "")).strip()
    orientation = str(data.get("orientation", "")).strip()
    
    if not outlet_id:
        return None, (jsonify({"success": False, "error": "outlet_id is required"}), 400)

    if batch_number is None:
        return None, (jsonify({"success": False, "error": "batch_number is required"}), 400)

    try:
        batch_number = int(batch_number)
    
    except (TypeError, ValueError):
        return None, (jsonify({"success": False, "error": "batch_number must be an integer"}), 400)
    
    if batch_number not in (1, 2, 3):
        return None, (jsonify({"success": False, "error": "batch_number must be 1, 2, or 3"}), 400)

    if tier not in ("Tier A", "Tier B"):
        return None, (jsonify({"success": False, "error": "Invalid tier"}), 400)

    if orientation not in ("Landscape", "Portrait"):
        return None, (jsonify({"success": False, "error": "Invalid orientation"}), 400)
    
    return {
        "outlet_id": outlet_id,
        "batch_number": batch_number,
        "tier": tier,
        "orientation": orientation,
    }, None

@outlet_screen_bp.route("/media-player/config", methods=["POST"])
def get_media_player_config_route():
    payload, error_response = _parse_player_request()
    
    if error_response:
        return error_response

    try:
        print(f"[MEDIA PLAYER API] Config request:{payload}")
        result = fetch_media_player_screens(**payload)
        
        print(
            "[MEDIA PLAYER API] Config result:",
            {
                "outlet": result.get("outlet"),
                "screen_count": len(
                    result.get("screens", [])
                ),
                "etag": result.get("etag"),
            },
        )
        
        if not result["outlet"]:
            return jsonify({
                "success": False,
                "error": "Outlet or Media Player configuration not found",
            }), 404
        
        if not result["screens"]:
            return jsonify({
                "success": False,
                "error": "No Media Player configuration found for the selected Batch, Tier, and Orientation",
            }), 404
        
        return jsonify({
            "success": True,
            "outlet": result["outlet"],
            "etag": result["etag"],
            "screens": result["screens"],
        }), 200
    
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@outlet_screen_bp.route("/media-player/version", methods=["POST"])
def get_media_player_version_route():
    payload, error_response = _parse_player_request()

    if error_response:
        return error_response

    try:
        print(f"[MEDIA PLAYER API] Version request:{payload}")
        
        version = fetch_media_player_version(**payload)

        return jsonify({
            "success": True,
            **version,
        }), 200
    
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500