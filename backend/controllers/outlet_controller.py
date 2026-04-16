from controllers.outlet_service import fetch_all_outlet_data
from flask import Blueprint, jsonify, request
from models.active_outlets import get_outlet_information, update_heartbeat_status

outlet_bp = Blueprint("outlet", __name__)

@outlet_bp.route("/validate_outlet", methods=["POST"])
def validate_outlet_route():
    data = request.get_json()
    outlet_id = data.get("outlet_id")

    outlets = fetch_all_outlet_data()

    for outlet in outlets:
        if outlet["outlet_id"] == outlet_id:
            return jsonify({"is_valid": True, **outlet}), 200

    return jsonify({"is_valid": False}), 404


@outlet_bp.route("/outlet_info/<outlet_id>", methods=["GET"])
def outlet_info(outlet_id):
    outlet = get_outlet_information(outlet_id)

    if not outlet:
        return jsonify({"error": "Not found"}), 404

    return jsonify(outlet), 200

@outlet_bp.route("/heartbeat", methods=["POST"])
def heartbeat():
    data = request.get_json()

    outlet_id = data.get("outlet_id")
    status = data.get("outlet_status")

    result = update_heartbeat_status(outlet_id, status)

    if not result:
        return jsonify({"error": "Outlet not found"}), 404

    return jsonify({"success": True}), 200