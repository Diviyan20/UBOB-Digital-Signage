from flask import Blueprint, jsonify, request
from services.outlet_screen_service import (
    add_outlet_screen,
    edit_outlet_screen,
    fetch_all_outlet_screens,
    fetch_outlet_screen,
    remove_outlet_screen,
)

outlet_screen_bp = Blueprint("outlet_screens", __name__, url_prefix="/outlet-screens")


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