import os, requests, logging
from datetime import datetime, timezone
from flask import jsonify
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

url = f"{SUPABASE_URL}/rest/v1/heartbeats"

# ------------------------
# Helper - request headers
#-------------------------

def supabase_headers():
    return{
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
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
# Register devices (By Outlet Code)
# -----------------

def register_device(outlet_code: int, outlet_name: str, region_name: str = None):
    # 1. Check if device already exists
    query_url = f"{url}?device_id=eq.{outlet_code}&select=*"

    res = requests.get(query_url, headers=supabase_headers())
   

    if res.ok and res.json():
        device = res.json()[0]
        log.info(f"Device already registered: {outlet_code}")
        return {**device, "is_new": False}

    # 2. Insert new device
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "device_id": outlet_code,
        "device_name": outlet_name,
        "device_status": "online",
        "device_location": region_name,
        "timestamp": now,
        "last_seen":now
    }

    insert_res = requests.post(
        url,
        headers={**supabase_headers(), "Prefer": "return=representation"},
        json=record
    )

    if not insert_res.ok:
        log.error(insert_res.text)
        return {"error": "Failed to insert device", "details": insert_res.text}
    
    log.info(f"Registered device to outlet code {outlet_code}!")
    return {**record, "is_new": True}


# -----------------
# Update Device Heartbeat
# -----------------

def update_heartbeat(device_id: int, status: str):
    if not device_id:
        return jsonify({"error": "Missing Device ID!"}), 400
    
    now = datetime.now(timezone.utc).isoformat()

    update_url = f"{url}?device_id=eq.{device_id}"
    
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
    query_url = f"{url}?select=*"

    res = requests.get(query_url, headers=supabase_headers())

    if not res.ok:
        return jsonify({"error": "Failed to fetch devices"}), 500

    return jsonify({"devices": res.json()}), 200