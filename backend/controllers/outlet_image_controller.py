import logging
import os

from controllers.outlet_service import get_outlet_images_with_names, stream_outlet_image
from flask import Blueprint
from PIL import Image

Image.MAX_IMAGE_PIXELS = 20_000_000

outlet_image_bp = Blueprint("outlet_image", __name__)

# ----------------------------
# ENVIRONMENT CONFIGURATION
# ----------------------------
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL")

# HEADERS
def odoo_headers():
    return{
        "Authorization":f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }

# ---------
# LOGGING
# ---------
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@outlet_image_bp.route("/outlet_image_combined", methods=["POST"])
def outlet_image_combined():
    return get_outlet_images_with_names()

@outlet_image_bp.route("/outlet_image/<image_id>", methods=["GET"])
def outlet_image(image_id):
    return stream_outlet_image(image_id)