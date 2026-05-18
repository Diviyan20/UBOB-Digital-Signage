from functools import wraps

from flask import jsonify, request
from utils.auth import verify_admin_token


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401

        token = auth_header.split(" ")[1]
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        
        payload = verify_admin_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        return f(*args, **kwargs)
    return decorated