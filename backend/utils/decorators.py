from functools import wraps
from flask import request, jsonify
from utils.auth import verify_admin_token

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("admin_token")
        
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        
        payload = verify_admin_token(token)
        
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        
        return f(*args, **kwargs)
    
    return decorated