"""
Outlet Controller

Handles:
- Outlet Validation
- Outlet Hearbeat Updates
- Fetching Outlet Information
"""

from flask import Blueprint, jsonify, request
from models.active_outlets import (
    get_outlet_information,
    update_heartbeat_status,
)
from services.outlet_service import fetch_all_outlet_data

# ===================
# CREATE BLUEPRINT
# ===================
outlet_bp = Blueprint("outlet", __name__)

# ===================
# VALIDATE OUTLET
# ===================
@outlet_bp.route("/validate_outlet", methods=["POST"])
def validate_outlet_route():
    """
    Checks whether outlet exists
    
    Frontend sends: (outlet_id": "59")
    
    Backend checks API/database
    """
    data = request.get_json()
    outlet_id = str(data.get("outlet_id")).strip() # Get outlet ID from request body
    
    if not outlet_id:
        return jsonify({"is_valid": False, "message": "outlet_id is required"}), 400
    
    outlet = get_outlet_information(outlet_id) # Fetch all outlets
    
    if not outlet:
        return jsonify({
            "is_valid": False,
            "message": "Outlet not Found"
        }), 404
    
    return jsonify({
        "is_valid": True,
        **outlet
    }), 200
    
# ==================
# GET ALL OUTLETS
# ==================
@outlet_bp.route("/api/outlets" ,methods=["GET"])
def get_all_outlets():
    """
    Returns all outlets
    """
    try:
        outlets = fetch_all_outlet_data()
        return jsonify({
            "outlets": outlets
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to fetch outlets: {e}"
        }), 500

# ========================
# GET SINGLE OUTLET INFO
# ========================
@outlet_bp.route("/outlet_info/<outlet_id>", methods=["GET"])
def outlet_info(outlet_id):
    """
    Returns information for one outlet
    """
    try:
        outlet = get_outlet_information(outlet_id)
        
        if not outlet:
            return jsonify({
                "success": False, 
                "error": "Outlet not found"
                }), 404
        
        return jsonify({
            "success": True,
            "outlet": outlet
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to fetch outlet information: {e}"
        })

# ===================
# HEARTBEAT UPDATE
# ===================
@outlet_bp.route("/heartbeat", methods=["POST"])
def heartbeat():
    """
    - Updates outlet online/offline status
    - Frontend sends hearbeat every X seconds
    """
    data = request.get_json()
    outlet_id = data.get("outlet_id")
    status = data.get("outlet_status")
    
    result = update_heartbeat_status(outlet_id, status)
    
    if not result:
        return jsonify({
            "error": "Outlet Not Found"
        }), 404
    
    return jsonify({
        "success": True,
    }), 200