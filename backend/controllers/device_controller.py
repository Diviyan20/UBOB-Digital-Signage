import os, requests, logging
from datetime import datetime, timezone
from flask import jsonify
from dotenv import load_dotenv, find_dotenv
from urllib.parse import urlparse, parse_qs

load_dotenv(find_dotenv())

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
ODOO_API_TOKEN = os.getenv("ODOO_API_TOKEN")

outlet_devices_url = f"{SUPABASE_URL}/rest/v1/outlet_devices"

# ------------------------
# Helper - request headers
#-------------------------

def supabase_headers():
    return{
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

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
        query_url = f"{outlet_devices_url}?device_id=eq.{device_id}&select=*"
        response = requests.get(query_url, headers=supabase_headers())

        if response.ok and response.json():
            device = response.json()[0]
            return{
                "exists": True,
                "device": device,
                "has_credentials": bool(
                    device.get("order_api_url") and device.get("order_api_token")
                )
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
    
    # 1. Check if device already exists
    query_url = f"{outlet_devices_url}?device_id=eq.{outlet_id}&select=*"

    res = requests.get(query_url, headers=supabase_headers())
   
    now = datetime.now(timezone.utc).isoformat()

    if res.ok and res.json():
        # Update existing device
        device = res.json()[0]
        log.info(f"Device already registered: {outlet_id}")
        
        update_url = f"{outlet_devices_url}?device_id=eq.{outlet_id}"
        update_body = {
            "device_status": "online",
            "timestamp": now,
            "last_seen": now
        }

        update_res = requests.patch(update_url, headers=supabase_headers(), json=update_body)
        if update_res.status_code in (204, 200):
            return {**device, "is_new": False}
        else:
            return {"error": "Failed to update device", "details": update_res.text}

    # 2. Insert new device
    record = {
        "device_id": outlet_id,
        "device_name": outlet_name,
        "device_status": "online",
        "device_location": region_name,
        "timestamp": now,
        "last_seen": now,
        "order_api_url": None,  # Will be set by admin later
        "order_api_token": None  # Will be set by admin later
    }

    insert_res = requests.post(
        outlet_devices_url,
        headers={**supabase_headers(), "Prefer": "return=representation"},
        json=record
    )

    if not insert_res.ok:
        log.error(insert_res.text)
        return {"error": "Failed to insert device", "details": insert_res.text}
    
    log.info(f"Registered device to outlet code {outlet_id}!")
    return {**record, "is_new": True}



def update_device_credentials(device_id: str, order_api_url: str, order_api_token: str):
    """
    Update device with API credentials after admin login.
    """
    try:
        update_url = f"{outlet_devices_url}?device_id=eq.{device_id}"

        body = {
            "order_api_url": order_api_url,
            "order_api_token": order_api_token,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        res = requests.patch(update_url, headers=supabase_headers(), json=body)

        if res.status_code in (204, 200):
            log.info(f"Updated credentials for device {device_id}")
            return {"success": True, "message": "Credentials updated successfully"}
        
        else:
            log.error(f"Failed to update credentials for device {device_id}: {res.text}")
            return {"error": "Failed to update credentials", "details": res.text}

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

        # Extract the base URL (wihtout query parameters)
        base_url = f"{parsed.scheme}://{parsed.netloc}"

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
    
    now = datetime.now(timezone.utc).isoformat()
    update_url = f"{outlet_devices_url}?device_id=eq.{device_id}"
    
    body = {
        "device_status": status,
        "timestamp": now,
        "last_seen": now
    }

    res = requests.patch(update_url, headers=supabase_headers(), json=body)

    if res.status_code == 200 and res.text.strip() == "[]":
        return jsonify({
            "message": "Device not found",
            "device_id": device_id,
            "status": "offline"
        }), 404

    if res.status_code in (204, 200):
        return jsonify({
            "message": "Heartbeat updated successfully",
            "device_id": device_id,
            "status": status,
            "timestamp": now
        }), 200

    
    return jsonify({"error": "Failed to update device", "details": res.text}), 500


# --------------------------
# Get all devices (for testing)
# --------------------------
def get_all_devices():
    """
    Returns all registered devices in the system (for debugging).
    """
    query_url = f"{outlet_devices_url}?select=*"

    res = requests.get(query_url, headers=supabase_headers())

    if not res.ok:
        return jsonify({"error": "Failed to fetch devices"}), 500

    return jsonify({"devices": res.json()}), 200



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
