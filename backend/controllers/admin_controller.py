from flask import Blueprint, jsonify, make_response, request
from models.active_outlets import register_outlet
from models.admin_credentials import retrieve_credentials
from utils.auth import generate_admin_token

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

@admin_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    admin = retrieve_credentials(email, password)

    if not admin:
        return jsonify({"error": "Invalid Credentials"}), 401

    token = generate_admin_token(admin_id="1")

    response = make_response(jsonify({"message": "Login Successful"}))

    response.set_cookie(
        "admin_token",
        token,
        httponly=True,
        secure=True,
        samesite="None",
        max_age=1800
    )

    return response

@admin_bp.route("/register_outlet", methods=["POST"])
def admin_register_outlet():
    data = request.get_json()
    
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