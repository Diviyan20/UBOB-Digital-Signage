from flask import Blueprint
from services.outlet_image_service import (
    get_outlet_images_response,
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