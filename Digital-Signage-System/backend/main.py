import os
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from controllers.media_controller import (
    get_media_json,
    start_image_carousel,
    get_current_media,
)
from controllers.outlet_controllers import get_outlets_json, get_outlet_images


load_dotenv()
app = Flask(__name__)
CORS(app)

# Odoo API Config
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")

HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


# Endpoint: Register Outlet
@app.route("/get_outlets", methods=["POST"])
def get_outlet():
    print("Received POST at /get_outlets")
    data = request.get_json(force=True)
    outlet_id = str(data.get("outlet_id")).strip() if data.get("outlet_id") else None

    outlet_data = get_outlets_json()
    if not outlet_data:
        return jsonify({"error": "Failed to fetch outlets from Odoo"}), 500

    if outlet_id:
        match = next((o for o in outlet_data if o["outlet_id"] == outlet_id), None)

        if match:
            signal = {
                "is_valid": True,
                "message": "Outlet Verified Succesfully!",
            }

        else:
            signal = {
                "is_valid": False,
                "message": "Invalid Outlet Code!",
            }

    return jsonify(signal), 200


@app.route("/get_media", methods=["GET"])
def get_media():
    print("Received GET at /get_media")
    media_data = get_media_json()

    if not media_data:
        return jsonify({"error": "Failed to fetch media from Odoo"}), 500

    return jsonify({"message": "Media fetched successfully!", "media": media_data}), 200


@app.route("/start_carousel", methods=["GET"])
def start_carousel():
    media_list = get_media_json()
    if not media_list:
        return jsonify({"error": "No media found"}), 500
    start_image_carousel(media_list, interval=5)
    return jsonify({"message": "Carousel started", "total": len(media_list)}), 200


@app.route("/current_media", methods=["GET"])
def current_media():
    item = get_current_media()
    if not item:
        print("Carousel empty — auto-starting...")
        media_list = get_media_json()
        if media_list:
            start_image_carousel(media_list, interval=5)
            item = get_current_media()
        else:
            return jsonify({"error": "No media found"}), 404
    return jsonify(item), 200


@app.route("/outlet_image", methods=["POST"])
def outlet_images():
    print("Received POST at /outlet_image")
    image_data = get_outlet_images()

    if not image_data:
        return jsonify({"error": "Failed to fetch outlet images from Odoo"}), 500

    return (
        jsonify({"message": "Images fetched successfully!", "images": image_data}),
        200,
    )


# Request/Response Logging
@app.after_request
def log_response_info(response):
    print(f"Response Status: {response.status}")
    try:
        print(f"Response JSON: {response.get_json()}")
    except Exception:
        print("Response not JSON (HTML or empty)")
    print("===========================================")
    return response


# 🚀 Run Server
if __name__ == "__main__":
    print("🚀 Starting Flask backend for Digital Signage System...")
    print("🌍 Listening on http://0.0.0.0:5000")
    app.run(debug=False, host="0.0.0.0", port=5000)
