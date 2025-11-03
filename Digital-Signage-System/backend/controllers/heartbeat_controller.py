import os
from datetime import datetime
from flask import jsonify
from pymongo import MongoClient
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


MONGO_URI = os.getenv("MONGODB_CONNECTION_STRING")
client = MongoClient(MONGO_URI)
db = client.heartbeats
devices = db["UBOB Digital Signage"]

# -----------------
# Register devices (By Outlet Code)
# -----------------

def register_device(outlet_code: str, outlet_name: str = "Unnamed Outlet"):
    if not outlet_code:
        return jsonify({"error": "Outlet code is required"}), 400
    
    existing_device = devices.find_one({"outlet_code": outlet_code})
    
    if existing_device:
        return jsonify({
            "message": "Device already registered",
            "device_id": outlet_code,
            "status": existing_device.get("device_status", "unknown")}), 200
    
    new_device = {
        "device_id": outlet_code,
        "outlet_name": outlet_name,
        "device_status": "online",
        "timestamp": datetime.now()
    }
    devices.insert_one(new_device)
    return jsonify({
        "message": "Device registered successfully",
        "device_id": outlet_code,
        }), 200


# -----------------
# Update Device Heartbeat
# -----------------

def update_heartbeat(device_id: str, status: str = "online"):
    if not device_id:
        return jsonify({"error": "Missing Device ID!"}), 400
    
    result = devices.update_one(
        {"device_id": device_id},
        {"$set": {"device_status": status, "timestamp": datetime.now()}}
    )

    if result.matched_count == 0:
        return jsonify({
            "message": "Device not found",
            "device_id": device_id,
            "status": "offline"}), 404
   
   
    return jsonify({
        "message": "Heartbeat updated successfully",
        "device_id": device_id,
        "status": status}), 200


# --------------------------
# Get all devices (for testing)
# --------------------------
def get_all_devices():
    """
    Returns all registered devices in the system (for debugging).
    """
    data = list(devices.find({}, {"_id": 0}))
    return jsonify({"devices": data}), 200