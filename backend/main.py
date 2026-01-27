import logging
import os

# Controllers
from controllers.device_controller import (
    parse_order_tracking_url,
    register_device,
    update_device_credentials,
    update_heartbeat,
    validate_device_for_media,
    validate_outlet,
)
from controllers.media_controller import get_media_json, stream_image
from controllers.outlet_controller import (
    fetch_outlet_images,
    get_outlet_images_with_names,
    stream_outlet_image,
)

# Environment and Flask server
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Background Jobs
from jobs.scheduler import start_scheduler
from werkzeug.middleware.proxy_fix import ProxyFix

# LOAD ENVIRONMENT + APP SETUP
load_dotenv()

app = Flask(__name__, static_folder="static")

start_scheduler()

CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    },
)

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)


# =======
# LOGGING
# =======
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
    device_id = data.get("device_id")

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

    device_id = str(data.get("device_id"))
    full_url = data.get("order_tracking_url")

    if not device_id or not full_url:
        return jsonify({"error": "Missing parameters"}), 400

    # Parse the URL to extract base URl and access token
    base_url, access_token = parse_order_tracking_url(full_url)

    if not base_url or not access_token:
        return jsonify({"error": "Missing Parameters"}), 400

    result = update_device_credentials(device_id, base_url, access_token)

    status = 200 if "error" not in result else 500
    return jsonify(result), status


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
    safe_media = [{k:v for k, v in item.items() if k != "raw_img"}for item in image_data]
    
    return jsonify({"media":safe_media})

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
    media = get_media_json()

    if not media:
        return jsonify({"error": "Failed to fetch media from Odoo"}), 500

    safe = [{k: v for k, v in item.items() if k != "raw_img"} for item in media]
    return jsonify({"media": safe})


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
    return send_from_directory(static_dir, filename)


# ===================
# HEARTBEAT ENDPOINTS
# ==================
@app.route("/heartbeat", methods=["POST"])
def heartbeat():
    data = request.get_json(force=True)
    device_id = data.get("device_id")
    status = data.get("status")

    if not device_id:
        return jsonify({"error": "Missing device_id"}), 400

    return update_heartbeat(device_id, status)

# =======================
# GLOBAL RESPONSE LOGGING
# =======================
@app.after_request
def log_response_info(response):
    log.info(f"{request.method} {request.path} → {response.status}")
    return response

# ==============
# 🚀 RUN SERVER
# ==============
if __name__ == "__main__":
    log.info("🚀 Starting Flask backend for Digital Signage System...")
    log.info("🚀 Flask backend running on port 5000")
    app.run(debug=True, host="0.0.0.0", port=5000)
