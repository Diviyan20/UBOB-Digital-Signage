from flask import Blueprint
from services.outlet_image_service import (
    get_outlet_images_response,
    stream_outlet_image,
)

# ===================
# GENERATE BLUEPRINT
# ===================
outlet_image_bp = Blueprint("outlet_image", __name__)

# ==================
# BLUEPRINT ROUTES
# ==================

@outlet_image_bp.route("/outlet_image_combined", methods=["POST"])
def outlet_image_combined():
    """
    Returns all outlet images together with their names.
    """
    return get_outlet_images_response()

@outlet_image_bp.route("/outlet_image/<image_id>", methods=["GET"])
def outlet_image(image_id):
    """
    Streams the cached outlet images
    """
    return stream_outlet_image(image_id)