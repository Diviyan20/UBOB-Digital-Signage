import logging
import os

from controllers.outlet_service import fetch_all_outlet_data
from dotenv import find_dotenv, load_dotenv
from flask import jsonify
from models.active_outlets import get_outlet_information, update_heartbeat_status

load_dotenv(find_dotenv())

ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
ODOO_API_TOKEN = os.getenv("ODOO_API_TOKEN")


# ==========================
# HELPERS - ODOO HEADERS
# ==========================

def odoo_headers():
    """ Generate headers for Odoo API requests with authentication token. """
    return{
        "Authorization": f"Bearer {ODOO_API_TOKEN}",
        "Content-Type": "application/json"
    }

# ================
# LOGGING SETUP
# ================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# =====================
# OUTLET VALIDATION
# =====================

def validate_outlet(outlet_id: str) -> dict:
    outlets = fetch_all_outlet_data()
    
    for outlet in outlets:
        if outlet["outlet_id"] == outlet_id:
            return {
                "is_valid": True,
                **outlet
            }
    
    return{
        "is_valid": False,
        "error":"Outlet not found"
    }

# =====================
# GET OUTLET INFO
# =====================

def get_outlet_info(outlet_id: str) -> dict:
    """
    Get outlet information from Postgresql Database.
    """
    outlet = get_outlet_information(outlet_id)
    return outlet

# ==========================
# HEARTBEAT MONITORING
# ==========================

def update_heartbeat(outlet_id: str, outlet_status: str):
    """
    Update heartbeat status.
    """
    if not outlet_id:
        return jsonify({
            "error": "Missing Outlet ID"
        }), 400
    
    if outlet_status.lower() not in ("online", "offline"):
        outlet_status = "online"
    
    result = update_heartbeat_status(outlet_id, outlet_status)
    
    if result:
        return jsonify({
            "message":"Heartbeat Updates",
            "outlet_id": outlet_id,
            "status": outlet_status
        }), 200
    
    else:
        return jsonify({"error": "Outlet not found"}), 404

# ========================
# VALIDATE FOR MEDIA
# ========================
def validate_device_for_media(outlet_id: str) -> dict:
    """
    Check if outlet can access media screen.
    Returns what to show: media, config form, or error
    """
    # 1. Validate outlet exists in Odoo
    odoo_outlet= validate_outlet(outlet_id)
    if not odoo_outlet.get("is_valid"):
        return{
            "can_access_media": False,
            "reason": "invalid_outlet",
            "error": odoo_outlet.get("error")
        }

    # 2. Check if outlet is registered
    outlet= get_outlet_information(outlet_id)

    if not outlet:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": outlet
        }
    
    # 3. Check outlet has credentials
    if not outlet["order_api_url"] or not outlet["order_api_key"]:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": odoo_outlet
        }
    
    # Everything Checks Out!
    return{
        "can_access_media": True,
        "outlet_info": odoo_outlet,
        "device_info": outlet
    }
