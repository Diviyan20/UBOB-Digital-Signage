import os, logging, psutil, gc, requests
from sched import scheduler
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone 
from apscheduler.schedulers.background import BackgroundScheduler 
from werkzeug.middleware.proxy_fix import ProxyFix

# ==================
# CONTROLLER IMPORTS
# ==================
from controllers.media_controller import get_media_json, stream_image

from controllers.outlet_controller import (
    fetch_outlets, 
    fetch_outlet_images, 
    stream_outlet_image, 
    get_outlet_images_with_names)

from controllers.device_controller import (
    supabase_headers, 
    validate_outlet,
    register_device, 
    update_heartbeat,
    validate_device_for_media,
    update_device_credentials,
    parse_order_tracking_url,
    get_all_devices)

# LOAD ENVIRONMENT
load_dotenv()
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")

# FLASK SETUP
app = Flask(__name__, static_folder="static")
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "max_age": 86400
    }
})

# CONNECTION POOLING & TIMEOUT SETTINGS
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50 MB max file size
app.config['TIMEOUT'] = 300 # 5 minute timeout

# ADDING PROXY FIX
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

# LOGGING SETUP
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ================
# DEVICE ENDPOINTS
# ================
@app.route("/validate_device", methods=["POST"])
def validate_device():
    """
    Comprehensive device validation for media screen access.
    """
    data = request.get_json(force=True)
    device_id = str(data.get("device_id")).strip() if data.get("device_id") else None

    if not device_id:
        return jsonify({"error": "Missing device ID"}), 400
    
    result = validate_device_for_media(device_id)
    return jsonify(result), 200

@app.route("/update_credentials", methods=["POST"])
def update_credentials():
    """
    Update device with API credentials after admin login.
    """
    data = request.get_json(force=True)

    device_id = str(data.get("device_id")).strip()
    full_url = data.get("order_tracking_url")

    if not device_id or not full_url:
        return jsonify({"error": "Missing device_id or order_tracking_url"}), 400
    
    # Parse the URL to extract base URl and access token
    base_url, access_token = parse_order_tracking_url(full_url)

    if not base_url or not access_token:
        return jsonify({"error": "Invalid URL format or missing access token"}), 400

    result = update_device_credentials(device_id, base_url, access_token)

    if "error" in result:
        return jsonify(result), 500
    
    return jsonify(result), 200


# ================
# OUTLET ENDPOINTS
# ================

@app.route("/get_outlets", methods=["POST"])
def get_outlet():
    data = request.get_json(force=True)
    outlet_id = str(data.get("outlet_id")).strip() if data.get("outlet_id") else None

    if not outlet_id:
        return jsonify({"error": "Missing outlet ID"}), 400
    
    # Validate outlet
    outlet_result = validate_outlet(outlet_id)
    if not outlet_result.get("is_valid"):
        return jsonify({
            "is_valid": False, 
            "message": outlet_result.get("error", "Invalid Outlet Code!")
        }), 404
    
    # Register/update device
    device_result = register_device(
        outlet_result["outlet_id"], 
        outlet_result["outlet_name"], 
        outlet_result["region_name"]
    )
    
    if "error" in device_result:
        return jsonify({"error": "Device registration failed", "details": device_result}), 500

    return jsonify({
        "is_valid": True,
        "message": "Outlet Verified and Device Registered Successfully!",
        "outlet_name": outlet_result["outlet_name"],
        "region_name": outlet_result["region_name"],
        "device_info": device_result
    }), 200


@app.route("/outlet_image", methods=["POST"])
def outlet_images():
    image_data = fetch_outlet_images()

    if not image_data:
        return jsonify({"error": "Failed to fetch outlet images from Odoo"}), 500

    # Streamline: generator avoids building extra large list copies
    safe_media = [
        {k:v for k, v in item.items() if k != "raw_img"}
        for item in image_data
    ]
    
    return jsonify({"message":"Outlet Images fetched successfully!", "media":safe_media})


@app.route("/outlet_image/<image_id>", methods=["GET"])
def serve_outlet_images(image_id):
    return stream_outlet_image(image_id)


@app.route("/outlet_image_combined", methods=["POST"])
def outlet_images_combined():
    return get_outlet_images_with_names()

# ===============
# MEDIA ENDPOINTS
# ===============
@app.route("/get_media", methods=["GET"])
def get_media_list():
    log.info("Received GET at /get_media")
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
    log.debug(f"Received GET at /image/{image_id}")
    return stream_image(image_id)

# ============
# STATIC FILES
# ============
@app.route("/static/<path:filename>")
def static_files(filename):
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if not os.path.exists(os.path.join(static_dir, filename)):
        log.warning(f"⚠️ File not found: {os.path.join(static_dir, filename)}")
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
        log.debug(f"Incoming heartbeat data: {data}")
    except Exception as e:
        log.error(f"JSON decode error: {e}")
        return jsonify({"error":"Invalid JSON payload"}), 400
    
    if not data:
        return jsonify({"error": "Empty request body"}), 400
    
    device_id = data.get("device_id")
    status = data.get("status")
    client_timestamp = data.get("timestamp")
    
    if not device_id:
        return jsonify({"error": "Missing device_id"}), 400

    log.info(
        f"Heartbeat → Device: {device_id}, Status: {status}, "
        f"Client TS: {client_timestamp}"
    )
    return update_heartbeat(device_id, status)


# =====================
# INACTIVE DEVICE CHECK
# ====================
def check_for_inactive_devices():
    log.info("Checking for inactive devices...")

    now = datetime.now(timezone.utc)
    timeout_iso = (now - timedelta(minutes=5)).isoformat()

    # 1. Fetch online devices
    query_url = f"{SUPABASE_URL}/rest/v1/heartbeats?device_status=eq.online&select=*"

    res = requests.get(query_url, headers=supabase_headers())
    if not res.ok:
        log.error("Failed to query active devices: " + res.text)
        return

    devices = res.json()

    # 2. Filter devices inactive longer than 5 minutes
    for dev in devices:
        last_seen = dev.get("last_seen")
        if not last_seen:
            continue

        last_seen_dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))

        if last_seen_dt < (now - timedelta(minutes=5)):
            device_id = dev["device_id"]

            # mark device as offline
            patch_url = f"{SUPABASE_URL}/rest/v1/heartbeats?device_id=eq.{device_id}"
            body = {"device_status": "offline"}

            res2 = requests.patch(patch_url, headers=supabase_headers(), json=body)

            if res2.status_code in (204, 200):
                log.info(f"Marked device {device_id} as offline")
            else:
                log.error(f"Failed to update device {device_id}: {res2.text}")

# ==============
# MEMORY LOGGING
# ==============
def log_memory_usage():
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    memory_mb = memory_info.rss / 1024 / 1024 # Convert to mb

    # Get cache size from controllers
    from controllers.media_controller import _media_service
    from controllers.outlet_controller import _outlet_service

    media_cache_size = len(_media_service.memory_cache) if hasattr(_media_service, 'memory_cache') else 0
    outlet_cache_size = len(_outlet_service.memory_cache) if hasattr(_outlet_service, 'memory_cache') else 0

    log.info(f"🧠 Memory: {memory_mb:.1f}MB | Media Cache: {media_cache_size} | Outlet Cache: {outlet_cache_size}")


# Add memory endpoint
@app.route("/memory_stats", methods=["GET"])
def get_memory_stats():
    gc.collect()
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()

    from controllers.media_controller import _media_service
    from controllers.outlet_controller import _outlet_service

    stats = {
        "memory_mb": round(memory_info.rss / 1024 / 1024, 1),
        "memory_percent": round(process.memory_percent(), 1),
        "media_cache_items": len(_media_service.memory_cache),
        "outlet_cache_items": len(_outlet_service.memory_cache),
        "cache_files_media": len(_media_service.cache_manager._index) if hasattr(_media_service, 'cache_manager') else 0,
        "cache_files_outlet": len(_outlet_service.cache_manager._index) if hasattr(_outlet_service, 'cache_manager') else 0,
    }

    log_memory_usage() # Log to console
    return jsonify(stats)


# =======================
# GLOBAL RESPONSE LOGGING
# =======================
@app.after_request
def log_response_info(response):
    log.info(f"{request.method} {request.path} → {response.status}")
    return response


# ==============
# SCHEDULER INIT
# ==============
scheduler = BackgroundScheduler(daemon = True)
scheduler.add_job(check_for_inactive_devices, "interval", minutes=2) # Scheduled job to check for inactive devices
scheduler.add_job(func=log_memory_usage, trigger="interval", minutes=4, id="memory_monitor", name="Memory Usage Monitor") # Scheduled job to log memory usage
scheduler.start()

# ==============
# 🚀 RUN SERVER
# ==============
if __name__ == "__main__":
    log.info("🚀 Starting Flask backend for Digital Signage System...")
    log.info("🌍 Listening on http://0.0.0.0:5000")
    app.run(debug=True, threaded=True, host="0.0.0.0", port=5000)
