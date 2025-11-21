import os, requests, logging
from datetime import datetime, timezone
from flask import jsonify
from dotenv import load_dotenv, find_dotenv
from urllib.parse import urlparse, parse_qs
from models.db_connection import get_db_connection

load_dotenv(find_dotenv())

ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
ODOO_API_TOKEN = os.getenv("ODOO_API_TOKEN")


# ------------------------
# Helper - request headers
#-------------------------

def odoo_headers():
    return{
        "Authorization": f"Bearer {ODOO_API_TOKEN}",
        "Content-Type": "application/json"
    }

# -------------
# LOGGING SETUP
# -------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# -----------------
# Outlet Validation
# -----------------

def validate_outlet(outlet_id: str) -> dict:
    """
        Validate outlet against Odoo database.
        Returns outlet data if valid, error dict if invalid
    """
    try:
        # Fetch outlets from Odoo
        log.info("📡 Fetching outlets from Odoo...")
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids": []},
            headers=odoo_headers(),
            timeout=15
        )
        response.raise_for_status()

        data = response.json()
        if not data.get("status"):
            return {"error": "Odoo API error", "details": data.get("message", "Unknown error")}


        # Search for outlet
        for region in data.get("data", []):
            for outlet in region.get("pos_shops", []):
                if str(outlet.get("id")) == str(outlet_id):
                    return{
                        "is_valid": True,
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": outlet.get("name"),
                        "region_name": region.get("outlet_region_name"),
                        "is_open": outlet.get("is_open", False)
                    }
        
        return {"is_valid": False, "error": "Outlet not found"}
    
    except requests.RequestException as e:
        log.error(f"Failed to validate outlet {outlet_id}: {e}")
        return {"error": "Connection failed", "details": str(e)}
    
    except Exception as e:
        log.error(f"Unexpected error validating outlet {outlet_id}: {e}")
        return {"error": "Validation failed", "details": str(e)}


# -----------------
# Device Management
# -----------------

def get_device_info(device_id: str) -> dict:
    """
    Get device information from Supabase, including API credentials.
    """
    try:
        with get_db_connection() as (conn, cur):
            query = """
                SELECT device_id, device_name, device_status, device_location, 
                       active, last_seen, order_api_url, order_api_key
                FROM outlet_devices 
                WHERE device_id = %s
            """
            cur.execute(query, [device_id])
            device = cur.fetchone()

            if device:
                # Convert tuple/list to dict for consistency
                device_dict = {
                    "device_id": device[0],
                    "device_name": device[1],
                    "device_status": device[2],
                    "device_location": device[3],
                    "active": device[4],
                    "last_seen": device[5],
                    "order_api_url": device[6],
                    "order_api_key": device[7]
                }

                return{
                    "exists": True,
                    "device": device_dict,
                    "has_credentials": bool(device[6] and device[7])  # order_api_url and order_api_key
                }
            
            else:
                return {"exists": False, "has_credentials": False}
    
    except Exception as e:
        log.error(f"Failed to get device info for {device_id}: {e}")
        return {"exists": False, "has_credentials": False}

        

def register_device(outlet_id: str, outlet_name: str, region_name: str = None):
    """
    Register or update device in Supabase
    """
    
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)

            # Check if device already exists
            cur.execute("SELECT * FROM outlet_devices WHERE device_id = %s", (outlet_id,))
            existing_device = cur.fetchone()

            if existing_device:
                # Update existing device
                log.info(f"Device already registered: {outlet_id}")

                update_query = """
                    UPDATE outlet_devices 
                    SET device_status = 'online', last_seen = %s
                    WHERE device_id = %s
                    RETURNING *
                """
                cur.execute(update_query, (now, outlet_id))
                updated_device = cur.fetchone()
                conn.commit()

                # Convert to dict
                device_dict = {
                    "device_id": updated_device[0],
                    "device_name": updated_device[1],
                    "device_status": updated_device[2],
                    "device_location": updated_device[3],
                    "active": updated_device[4],
                    "last_seen": updated_device[5],
                    "order_api_url": updated_device[6],
                    "order_api_key": updated_device[7]
                }
                return {**device_dict, "is_new": False}
            
            # Insert new device if non-existent
            insert_query = """
                INSERT INTO outlet_devices 
                (device_id, device_name, device_status, device_location, active, last_seen, order_api_url, order_api_key)
                VALUES (%s, %s, 'online', %s, %s, %s, NULL, NULL)
                RETURNING *
            """

            cur.execute(insert_query, (outlet_id, outlet_name, region_name, now, now))
            new_device = cur.fetchone()
            conn.commit()
            
            log.info(f"Registered device to outlet code: {outlet_id}")

            # Convert to dict
            device_dict = {
                "device_id": new_device[0],
                "device_name": new_device[1],
                "device_status": new_device[2],
                "device_location": new_device[3],
                "active": new_device[4],
                "last_seen": new_device[5],
                "order_api_url": new_device[6],
                "order_api_key": new_device[7]
            }
            return {**device_dict, "is_new": True}
    
    except Exception as e:
        log.error(f"Failed to registed device {outlet_id}: {e}")
        return {"error": "Failed to register device", "details": str(e)}



def update_device_credentials(device_id: str, order_api_url: str, order_api_token: str):
    """
    Update device with API credentials after admin login.
    """
    try:
        with get_db_connection() as (conn, cur):
            update_query = """
                UPDATE outlet_devices 
                SET order_api_url = %s, order_api_key = %s
                WHERE device_id = %s
            """
            
            cur.execute(update_query, (order_api_url, order_api_token, device_id))
            conn.commit()
            
            if cur.rowcount > 0:
                log.info(f"Updated credentials for device {device_id}")
                return {"success": True, "message": "Credentials updated successfully"}
            else:
                return {"error": "Device not found"}
    
    except Exception as e:
        log.error(f"Error updating device credentials: {e}")
        return {"error": "Update failed", "details": str(e)}

# ---------------
# Parse Admin URL
# ---------------
def parse_order_tracking_url(full_url: str) -> tuple:
    """
    Parse the full order tracking URL to extract base URL and access token.
    
    Example input: https://unclebob-mobile-app-integration-xxxxxxx.dev.odoo.com/pos-order-tracking/?access_token=xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    
    Returns: (base_url, access_token) or (None, None) if parsing fails
    """
    try:
        parsed = urlparse(full_url)

        # Extract the base URL (with path, wihtout query parameters)
        base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        # Extract access token from query parameters
        query_params = parse_qs(parsed.query)
        access_token = query_params.get("access_token", [None])[0]

        if not access_token:
            log.error("No access token found in URL!")
            return None, None
        
        return base_url, access_token
    
    except Exception as e:
        log.error(f"Failed to parse URL {full_url}: {e}")
        return None, None

# -----------------
# Heartbeat Monitoring
# -----------------

def update_heartbeat(device_id: str, status: str):
    """
    Update device heartbeat status.
    """
    if not device_id:
        return jsonify({"error": "Missing Device ID!"}), 400
    
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)

            update_query = """
                UPDATE outlet_devices 
                SET device_status = %s, last_seen = %s
                WHERE device_id = %s
                RETURNING device_id
            """
            
            cur.execute(update_query, (status, now, device_id))
            result = cur.fetchone()
            conn.commit()

            if result:
                return jsonify({
                    "message": "Heartbeat updated successfully",
                    "device_id": device_id,
                    "status": status,
                    "timestamp": now.isoformat()
                }), 200
            else:
                return jsonify({
                    "message": "Device not found",
                    "device_id": device_id,
                    "status": "offline"
                }), 404
    
    except Exception as e:
        log.error(f"Failed to update heartbeat for {device_id}: {e}")
        return jsonify({"error": "Failed to update device", "details": str(e)}), 500


# --------------------------
# Get all devices (for testing)
# --------------------------
def get_all_devices():
    """
    Returns all registered devices in the system (for debugging).
    """
    try:
        with get_db_connection() as (conn, cur):
            cur.execute("SELECT * FROM outlet_devices ORDER BY last_seen DESC")
            devices = cur.fetchall()
            
            # Convert to list of dicts
            device_list = []
            for device in devices:
                device_dict = {
                    "device_id": device[0],
                    "device_name": device[1],
                    "device_status": device[2],
                    "device_location": device[3],
                    "active": device[4],
                    "last_seen": device[5],
                    "order_api_url": device[6],
                    "order_api_key": device[7]
                }
                device_list.append(device_dict)
            
            return jsonify({"devices": device_list}), 200
    
    except Exception as e:
        log.error(f"Failed to fetch devices: {e}")
        return jsonify({"error": "Failed to fetch devices", "details": str(e)}), 500



# --------------------------------
# Validate Device for Media Screen
# --------------------------------
def validate_device_for_media(device_id: str) -> dict:
    """
     Comprehensive device validation for media screen access.
    Checks outlet validity, device registration, and API credentials.
    """
    # 1. Validate outlet exists in Odoo
    outlet_validation = validate_outlet(device_id)
    if not outlet_validation.get("is_valid"):
        return{
            "can_access_media": False,
            "reason": "invalid_outlet",
            "outlet_validation": outlet_validation
        }

    # 2. Check device registration and credentials
    device_info = get_device_info(device_id)
    register_result = None

    if not device_info["exists"]:
        # Register device
        register_result = register_device(
            outlet_validation["outlet_id"],
            outlet_validation["outlet_name"],
            outlet_validation["region_name"]
        )
    
        if register_result and "error" in register_result:
            return{
            "can_access_media": False,
            "reason": "registration_failed",
            "registration_error": register_result
         }

        # Re-fetch device info after registration
        device_info = get_device_info(device_id)

    elif "error" in device_info:
        # Handle case where get_device_info returned an error
        return{
            "can_access_media": False,
            "reason": "device_info_error",
            "device_error": device_info
        }

    # 3. Check if device has API credentials
    if not device_info["has_credentials"]:
        return{
            "can_access_media": False,
            "reason": "missing_credentials",
            "device_exists": True,
            "outlet_info": outlet_validation
        }
    
    # 4. All checks passed
    return{
        "can_access_media": True,
        "outlet_info": outlet_validation,
        "device_info": device_info["device"]
    }
