from flask import Blueprint, jsonify, make_response, request
from models.active_outlets import register_outlet
from models.admin_credentials import retrieve_credentials
from utils.auth import generate_admin_token
from utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

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
    
    if not all([outlet_id, outlet_name, region_name, order_api_url, order_api_key]):
        return jsonify({"error": "All fields are required"}), 400

    result = register_outlet(
        outlet_id=outlet_id,
        outlet_name=outlet_name,
        region_name=region_name,
        order_api_url=order_api_url,
        order_api_key=order_api_key
    )

    if not result.get("success"):
        return jsonify({"error": result.get("error", "Registration failed")}), 409

    return jsonify(result), 201