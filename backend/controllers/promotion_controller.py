from flask import Blueprint, jsonify
from services.promotion_service import PromotionService

promotion_bp = Blueprint("promotion", __name__)

promotion_service = PromotionService()


@promotion_bp.route("/get_media", methods=["GET"])
def get_promotions():
    """
    Fetch promotion images from Odoo
    """
    try:
        promotions = promotion_service.get_promotions()
        
        return jsonify({
            "success": True,
            "media": promotions
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@promotion_bp.route("/promotion_image/<image_id>", methods=["GET"])
def promotion_image(image_id):
    """
    Streams cached promotion image
    """
    return promotion_service.stream_promotion_image(image_id)