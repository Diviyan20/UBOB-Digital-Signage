import logging
import os

# CONTROLLERS
from controllers.media_controller import (
    get_media_json,
    stream_image,
)
from controllers.outlet_controller import (
    get_outlet_info,
    update_heartbeat,
    validate_outlet,
)
from controllers.outlet_image_controller import (
    fetch_outlet_images,
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

    result = validate_outlet(outlet_id)
    
    if result.get("is_valid"):
        return jsonify(result), 200
    else:
        return jsonify(result), 404

# ================
# OUTLET ENDPOINTS
# ================
@app.route("/outlet_info/<outlet_id>", methods=["GET"])
def outlet_info_route(outlet_id):
    result = get_outlet_info(outlet_id)

    if not result:
        return jsonify({"error": "Outlet not found"}), 404

    return jsonify(result), 200

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
    outlet_id = data.get("outlet_id")
    outlet_status = data.get("outlet_status")

    if not outlet_id:
        return jsonify({"error": "Missing device_id"}), 400

    return update_heartbeat(outlet_id, outlet_status)

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
    log.info("🚀 Flask backend running")
    app.run(debug=True, host="0.0.0.0", port=5000)
