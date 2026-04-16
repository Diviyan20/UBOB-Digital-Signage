from flask import Blueprint, jsonify, make_response, request
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