import os
from datetime import datetime, timezone
from flask import jsonify
from pymongo import MongoClient
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


MONGO_URI = os.getenv("MONGODB_CONNECTION_STRING")
client = MongoClient(MONGO_URI)
db = client["UBOB-Digital-Signage"]
devices = db.heartbeats

# -----------------
# Register devices (By Outlet Code)
# -----------------

def register_device(outlet_code: str, outlet_name: str, region_name: str = None):
    existing_device = devices.find_one({"device_id": outlet_code})

    if existing_device:
        print(f"Device already registed to outlet code {outlet_code}")

        return{
            "device_id": existing_device["device_id"],
            "device_name": existing_device["device_name"],
            "timestamp": existing_device.get("timestamp"),
            "is_new": False
        }

    # Create new Record
    record = {
        "device_id": outlet_code,
        "device_name": outlet_name,
        "device_status": "online",
        "device_location": region_name,
        "timestamp": datetime.now()
    }

    devices.insert_one(record)
    print(f"Registered device to outlet code {outlet_code}!")
    return{**record, "is_new": True}


# -----------------
# Update Device Heartbeat
# -----------------

def update_heartbeat(device_id: str, status: str, timestamp:str):
    if not device_id:
        return jsonify({"error": "Missing Device ID!"}), 400
    
    now = datetime.now(timezone.utc)
    result = devices.update_one(
        {"device_id": device_id},
        {"$set": {
            "device_status": status, 
            "timestamp": now,
            "last_seen":now
            }}
    )

    if result.matched_count == 0:
        return jsonify({
            "message": "Device not found",
            "device_id": device_id,
            "status": "offline"}), 404
   
    return jsonify({
        "message": "Heartbeat updated successfully",
        "device_id": device_id,
        "status": status,
        "timestamp":now.isoformat(),
        }), 200


# --------------------------
# Get all devices (for testing)
# --------------------------
def get_all_devices():
    """
    Returns all registered devices in the system (for debugging).
    """
    data = list(devices.find({}, {"_id": 0}))
    return jsonify({"devices": data}), 200