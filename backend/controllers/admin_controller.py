from flask import Blueprint, jsonify, make_response, request
from models.active_outlets import register_outlet
from models.admin_credentials import retrieve_credentials
from utils.auth import generate_admin_token
from utils.decorators import admin_required
from services.admin_service import fetch_all_outlets

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

"""
LOGIN, AUTHENTICATION, AND LOGOUT
"""
@admin_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True, force=True)

    print("RAW BODY:", request.data)
    print("HEADERS:", dict(request.headers))

    if not data:
        return jsonify({"error": "Invalid or missing JSON"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    admin = retrieve_credentials(email, password)

    if not admin:
        return jsonify({"error": "Invalid Credentials"}), 401

    token = generate_admin_token(admin_id="1")

    return jsonify({"message": "Login Successful", "token": token}), 200

@admin_bp.route("/check-auth", methods=["GET"])
@admin_required
def check_auth():
    return jsonify({"authenticated": True})

@admin_bp.route("/logout", methods=["POST"])
def admin_logout():
    response = make_response(jsonify({"message": "Logged out"}))
    response.delete_cookie("admin_token")
    return response


"""
OUTLET COMMANDS
"""
@admin_bp.route("/register_outlet", methods=["POST"])
def admin_register_outlet():
    data = request.get_json(silent=True, force=True)

    print("RAW BODY:", request.data)
    print("HEADERS:", dict(request.headers))

    if not data:
        return jsonify({"error": "Invalid or missing JSON"}), 400

    outlet_id = data.get("outlet_id")
    outlet_name = data.get("outlet_name")
    region_name = data.get("region_name")
    order_api_url = data.get("order_api_url")
    order_api_key = data.get("order_api_key")
    tier = data.get("tier")

    if not all([outlet_id, outlet_name, region_name, order_api_url, order_api_key, tier]):
        return jsonify({"error": "All fields are required"}), 400

    result = register_outlet(
        outlet_id=outlet_id,
        outlet_name=outlet_name,
        region_name=region_name,
        order_api_url=order_api_url,
        order_api_key=order_api_key,
        tier = tier
    )

    if not result.get("success"):
        return jsonify({"error": result.get("error", "Registration failed")}), 409

    return jsonify(result), 201

@admin_bp.route("/outlets", methods=["GET"])
def get_all_outlets():
    try:
        data = fetch_all_outlets()

        if data:
            return jsonify({
                "success": True,
                "data": data
            }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500