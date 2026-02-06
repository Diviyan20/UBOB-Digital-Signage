import logging
import os

# CONTROLLERS
from controllers.device_controller import (
    parse_order_tracking_url,
    register_device,
    update_heartbeat,
    validate_device_for_media,
    validate_outlet,
)
from controllers.media_controller import (
    get_media_json,
    stream_image,
)
from controllers.outlet_controller import (
    fetch_outlet_images,
    fetch_outlet_names,
    get_outlet_images_with_names,
    stream_outlet_image,
)

# Environment and Flask server
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from jobs.media_refresh import start_media_scheduler

# Background Jobs
from jobs.scheduler import start_scheduler
from werkzeug.middleware.proxy_fix import ProxyFix

# LOAD ENVIRONMENT + APP SETUP
load_dotenv()

app = Flask(__name__, static_folder="static")

start_scheduler()
start_media_scheduler()

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
@app.route("/validate_outlet", methods=["POST"])
def validate_outlet_route():
    """
    Check if Outlet exists in Odoo Database
    Used by login forms to verify outlet code.
    """
    data = request.get_json(force=True)
    outlet_id = data.get("outlet_id")

    if not outlet_id:
        return jsonify({"error": "Missing device ID"}), 400

    result = validate_outlet(str(outlet_id).strip())
    
    if result.get("is_valid"):
        return jsonify(result), 200
    else:
        return jsonify(result), 404

@app.route("/validate_device", methods=["POST"])
def validate_device_route():
    """
    Check if device can access media screen.
    Returns what MediaScreen should display
    """
    data = request.get_json(force=True)
    device_id = data.get("device_id")
    
    if not device_id:
        return jsonify({"error": "Missing Device ID"}), 400

    result = validate_device_for_media(device_id)
    return jsonify(result), 200

@app.route("/configure_device", methods=["POST"])
def configure_device_route():
    """
    Register device with all credentials.
    Main registration point (ONLY done in Configuration Form)
    """
    data = request.get_json(force=True)
    device_id = data.get("device_id")
    full_url = data.get("order_tracking_url")
    
    if not device_id and not full_url:
        return jsonify({"error": "Missing device_id or order_tracking_url"}), 400
    
    # 1. Validate outlet exists
    outlet = validate_outlet(device_id)
    if not outlet.get("is_valid"):
        return jsonify({"error": "Invalid Outlet"}), 400
    
    # 2. Parse URL to get base URL and Access Token
    base_url, token = parse_order_tracking_url(full_url)
    if not base_url and not token:
        return jsonify({"error": "Invalid URL format"}), 400
    
    # 3. Register Device
    result = register_device(
        outlet_id=device_id,
        outlet_name=outlet["outlet_name"],
        region_name=outlet["region_name"],
        order_api_url=base_url,
        order_api_key=token
    )
    
    if result.get("success"):
        return jsonify(result), 200
    else:
        return jsonify({"error": "Registration failed."}), 500
        

# ================
# OUTLET ENDPOINTS
# ================
@app.route("/get_all_outlets", methods=["GET"])
def get_all_outlets():
    """ Get all outlet names from a dropdown search """""
    outlets = fetch_outlet_names()
    return jsonify({"outlets": outlets}), 200


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
    log.info("Starting Flask backend for Digital Signage System...")
    log.info("🚀 Flask backend running on port 5000")
    app.run(debug=True, host="0.0.0.0", port=5000)
