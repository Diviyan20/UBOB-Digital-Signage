import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from controllers.media_controller import get_media_json, stream_image
from controllers.outlet_controllers import get_outlets_json, get_outlet_images, stream_outlet_image
from controllers.heartbeat_controller import register_device, update_heartbeat, get_all_devices

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app, resources={r"/*": {"origins": "*"}})

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")

HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


# ================
# OUTLET ENDPOINTS
# ================
@app.route("/get_outlets", methods=["POST"])
def get_outlet():
    print("Received POST at /get_outlets")
    data = request.get_json(force=True)
    outlet_id = str(data.get("outlet_id")).strip() if data.get("outlet_id") else None

    outlet_data = get_outlets_json()
    if not outlet_data:
        return jsonify({"error": "Failed to fetch outlets from Odoo"}), 500

    if not outlet_id:
        return jsonify({"error": "Missing outlet ID"}), 400
    
    match = next((o for o in outlet_data if o["outlet_id"] == outlet_id), None)
    if not match:
        return jsonify({"is_valid": False, "message": "Invalid Outlet Code!"}), 404
    
    # If outlet is valid, register the device
    outlet_name = match["outlet_name"]
    region_name = match["region_name"]
    heartbeat_info = register_device(outlet_id, outlet_name, region_name)

    return jsonify({
        "is_valid": True,
        "message": "Outlet Verified and Device Registered Successfully!",
        "outlet_name": outlet_name,
        "region_name": region_name,
        "device_info": heartbeat_info
    }), 200


@app.route("/outlet_image", methods=["POST"])
def outlet_images():
    print("Received POST at /outlet_image")
    image_data = get_outlet_images()

    if not image_data:
        return jsonify({"error": "Failed to fetch outlet images from Odoo"}), 500

    safe_copy = [
        {k:v for k, v in item.items() if k != "raw_img"}
        for item in image_data
    ]
    
    return jsonify({"message":"Outlet Images fetched successfully!", "media":safe_copy})

@app.route("/outlet_image/<image_id>", methods=["GET"])
def serve_outlet_images(image_id):
    print(f"Received GET at /outelet_image/{image_id}")
    return stream_outlet_image(image_id)

# ===============
# MEDIA ENDPOINTS
# ===============
@app.route("/get_media", methods=["GET"])
def get_media_list():
    print("Received GET at /get_media")
    media_data = get_media_json()

    if not media_data:
        return jsonify({"error":"Failed to fetch media from Odoo"}), 500

    
    safe_copy = [
        {k: v for k, v in item.items() if k != "raw_img"}
        for item in media_data
    ]
    
    return jsonify({"message":"Media fetched successfully!", "media":safe_copy}) 


@app.route("/image/<image_id>", methods=["GET"])
def serve_image(image_id):
    print(f"Received GET at /image/{image_id}")
    return stream_image(image_id)

# ============
# STATIC FILES
# ============
@app.route("/static/<path:filename>")
def static_files(filename):
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if not os.path.exists(os.path.join(static_dir, filename)):
        print(f"⚠️ File not found: {os.path.join(static_dir, filename)}")
    return send_from_directory(static_dir, filename)



# ===================
# HEARTBEAT ENDPOINTS
# ==================
@app.route("/heartbeat", methods=["POST"])
def heartbeat():
    # Receive heartbeat pings from devices (Outlet codes)
    # JSON response: {"device_id": "42"}
    try:
        data = request.get_json(force=True)
        print("Incoming data: ", data)
    except Exception as e:
        print("JSON decode error: ", str(e))
        return jsonify({"error":"Invalid JSON payload"}), 400
    
    if not data:
        return jsonify({"error": "Empty request body"}), 400
    
    device_id = data.get("device_id")
    status = data.get("status")
    timestamp = data.get("timestamp")
    
    if not device_id:
        return jsonify({"error": "Missing device_id"}), 400

    print(f"Heatbeat Updated for outlet {device_id}, Status: {status}, Timestamp: {timestamp}")
    return update_heartbeat(device_id, status, timestamp)

# ====================
# RESPONSE LOGGING
# ====================
@app.after_request
def log_response_info(response):
    print(f"Response Status: {response.status}")
    try:
        print(f"Response JSON: {response.get_json()}")
    except Exception:
        print("Response not JSON (HTML or empty)")
    print("===========================================")
    return response


# ==============
# 🚀 RUN SERVER
# ==============
if __name__ == "__main__":
    print("🚀 Starting Flask backend for Digital Signage System...")
    print("🌍 Listening on http://0.0.0.0:5000")
    app.run(debug=True, threaded=True, host="0.0.0.0", port=5000)
