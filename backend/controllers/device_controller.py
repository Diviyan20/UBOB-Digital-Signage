import logging
import os
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import find_dotenv, load_dotenv
from flask import jsonify
from models.db_connection import get_db_connection

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
    """
        Validate an outlet that exists in the Odoo Database.
        This function ONLY checks if the outlet is valid and doest NOT register devices.
        Returns outlet info if valid, error if not.
    """
    try:
        log.info(f"📡 Validating outlet {outlet_id} from Odoo...")
        
         # Fetch all the Outlets from Odoo
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids": []},
            headers=odoo_headers(),
            timeout=15
        )
        response.raise_for_status()

        data = response.json()
        if not data.get("status"):
            return {"is_valid": False ,"error": "Odoo API error", "details": data.get("message", "Unknown error")}


        # Find the matching outlet
        for region in data.get("data", []):
            for outlet in region.get("pos_shops", []):
                if str(outlet.get("id")) == str(outlet_id):
                    return{
                        "is_valid": True,
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": outlet.get("name"),
                        "region_name": region.get("outlet_region_name")
                    }
        
        return {"is_valid": False, "error": "Outlet not found"}
    
    except Exception as e:
        log.error(f"Failed to validate outlet {outlet_id}: {e}")
        return {"error": "Connection failed", "details": str(e)}


# =====================
# GET DEVICE INFO
# =====================

def get_device_info(device_id: str) -> dict:
    """
    Get device information from Database.
    Returns device data, or None if not found.
    """
    try:
        with get_db_connection() as (conn,cur):
            query = """
                SELECT * FROM outlet_devices WHERE device_id = %s
            """
            cur.execute(query, [device_id])
            
            device = cur.fetchone()

            if not device:
                return None
            
            return{
                "device_id": device[0],
                "device_name": device[1],
                "device_status": device[2],
                "device_location": device[3],
                "active": device[4],
                "last_seen": device[5],
                "order_api_url": device[6],
                "order_api_key": device[7]
            }
    
    except Exception as e:
        log.error(f"Failed to get device info for {device_id}: {e}")
        return None


# ===================
# REGISTER DEVICE
# ===================

def register_device(outlet_id:str, outlet_name:str, region_name:str, 
                    order_api_url:str, order_api_key:str) -> dict:
    """
    Register device with all info in one step.
    Creates a new device, or updates existing one.
    """
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)
            
            # Check if devices exists
            existing= get_device_info(outlet_id)

            if existing:
                log.info(f"Device already registered: {outlet_id}")

                # Update Existing device
                update_query = """
                    UPDATE outlet_devices 
                    SET device_name = %s,
                        device_location = %s,
                        device_status = 'online',
                        last_seen = %s,
                        order_api_url = %s,
                        order_api_key = %s
                    WHERE device_id = %s
                    RETURNING *
                """
                cur.execute(update_query, (outlet_name, region_name, now, order_api_url, order_api_key, outlet_id))
            
            else:
                # Insert new device
                query = """
                    INSERT INTO outlet_devices 
                    (device_id, device_name, device_status, device_location, 
                     active, last_seen, order_api_url, order_api_key)
                    VALUES (%s, %s, 'online', %s, %s, %s, %s, %s)
                    RETURNING *
                """
                cur.execute(query, (outlet_id, outlet_name, region_name, now, now, order_api_url, order_api_key))

                device = cur.fetchone()
                conn.commit()
                
            return{
                "success": True,
                "device_id": device[0],
                "device_name": device[1],
                "device_status": device[2],
                "device_location": device[3],
                "order_api_url": device[6],
                "order_api_key": device[7]
            }
                 
    except Exception as e:
        log.error(f"Failed to registed device {outlet_id}: {e}")
        return {"success": False, "error": str(e)}

# ============================
# PARSE ORDER TRACKING URL
# ============================
def parse_order_tracking_url(full_url: str) -> tuple:
    """
    Split the URL into Base and Access Token
    
    Example input: https://unclebob-mobile-app-integration-xxxxxxx.dev.odoo.com/pos-order-tracking/?access_token=xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    
    Returns: ("https://odoo.com/pos-order-tracking", "abc-123")
    """
    try:
        parsed = urlparse(full_url)

        # Get Base URl without query params
        base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"

        # Get Access Token from query sting
        query_params = parse_qs(parsed.query)
        access_token = query_params.get("access_token", [None])[0]

        if not access_token:
            log.error("No access token found in URL!")
            return None, None
        
        return base_url, access_token
    
    except Exception as e:
        log.error(f"Error Parsing URL: {e}")
        return None, None

# ==========================
# HEARTBEAT MONITORING
# ==========================

def update_heartbeat(device_id: str, status: str):
    """
    Update device heartbeat status.
    """
    if not device_id:
        return jsonify({"error": "Missing Device ID!"}), 400
    
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)

            # Make sure status is valid
            if status.lower() not in ("online", "offline"):
                status = "online"

            update_query = """
                UPDATE outlet_devices 
                SET device_status = %s, last_seen = %s
                WHERE device_id = %s
                RETURNING device_id
            """
            cur.execute(update_query, (status.lower(), now, device_id))
            result = cur.fetchone()
            conn.commit()

            if result:
                return jsonify({
                    "message": "Heartbeat updated",
                    "device_id": device_id,
                    "status": status
                }), 200
            else:
                return jsonify({"error": "Device not found"}), 404
    
    except Exception as e:
        log.error(f"Error Updating Heartbeat for Device {device_id}: {e}")
        return jsonify({"error": str(e)}), 500


# ========================
# VALIDATE FOR MEDIA
# ========================
def validate_device_for_media(device_id: str) -> dict:
    """
    Check if device can access media screen.
    Returns what to show: media, config form, or error
    """
    # 1. Validate outlet exists in Odoo
    outlet= validate_outlet(device_id)
    if not outlet.get("is_valid"):
        return{
            "can_access_media": False,
            "reason": "invalid_outlet",
            "error": outlet.get("error")
        }

    # 2. Check if device is registered
    device= get_device_info(device_id)

    if not device:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": outlet
        }
    
    # 3. Check device has credentials
    if not device["order_api_url"] or not device["order_api_key"]:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": outlet
        }
    
    # Everything Checks Out!
    return{
        "can_access_media": True,
        "outlet_info": outlet,
        "device_info": device
    }
