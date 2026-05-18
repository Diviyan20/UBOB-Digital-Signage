from flask import Blueprint, jsonify
from models.system_config_model import get_system_config

system_config_bp = Blueprint(
    "system_config_bp",
    __name__
)

@system_config_bp.route("/config", methods=["GET"])
def fetch_system_config():
    try:
        config = get_system_config()
        
        if not config:
            return jsonify({
                "success": False,
                "message": "No credentials found"
            }), 404
    
        else:
            return jsonify({
                "success": True,
                "config": config
            }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500