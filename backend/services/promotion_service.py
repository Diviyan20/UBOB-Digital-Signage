import base64
import hashlib
import io
import os
from pathlib import Path

from flask import abort, send_file
from PIL import Image
from utils.cache_helper import load_cache, save_cache
from utils.odoo_helper import fetch_odoo_promotions

# =======================
# ENVIRONMENT VARIABLES
# =======================
PUBLIC_HOST_URL = os.getenv("PUBLIC_HOST_URL")

# =====================
# LAMBDA CACHE DIRECTORY
CACHE_DIR = Path("/tmp/promotion_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class PromotionService:
    """
    Handles:
        - Promotion Fetching from Odoo
        - Converting base64 -> PNG
        - Caching Images Locally
        - Returning lightweight image URLs
    """
    
    CACHE_FILE = "promotion_cache.json"
    
    def get_promotions(self):
        """
        Main API used by controller.

        Flow:
        1. Check cache
        2. If cache exists -> return it
        3. Else fetch from Odoo
        4. Process images
        5. Save cache
        """
        # Step 1: Try cache first
        cached_data = load_cache(self.CACHE_FILE)
        
        if cached_data:
            return cached_data

        # Step 2: Fetch raw data from Odoo
        raw_promotions = fetch_odoo_promotions()
        
        processed_promotions = []
        
        for promo in raw_promotions:
            
            name = promo.get("name", "unknown")
            description = promo.get("description", "")
            raw_image = promo.get("image")
            
            if not raw_image:
                continue
            
            # Generate unique image ID
            image_id = self.generate_image_id(name, raw_image)
            
            # Save image only if not already cached
            image_path = self.get_image_path(image_id)
            
            if not image_path.exists():
                self.save_base64_as_png(raw_image, image_id)
            
            processed_promotions.append({
                "type": "image",
                "name": name,
                "description": description,
                "image": f"{PUBLIC_HOST_URL}/promotion_image/{image_id}"
            })
        
        # Save lightweight metadata cache
        save_cache(self.CACHE_FILE, processed_promotions)

        return processed_promotions

    def stream_promotion_image(self, image_id):
        """
        Streams cached files
        """
        path = self.get_image_path(image_id)
        
        if not path.exists():
            abort(404, "Image not found")
        
        return send_file(
            path,
            mimetype="image/png",
            as_attachment=False
        )
    
    # =================
    # HELPER FUNCTIONS
    # =================
    
    def generate_image_id(self, name, raw_image):
        """
        Generates a unique stable Image ID
        """
        seed = f"{name}:{raw_image[:50]}"
        
        return hashlib.md5(seed.encode()).hexdigest()[:12]
    
    def get_image_path(self, image_id):
        """
        Returns image path
        """
        return CACHE_DIR / f"{image_id}.png"
    
    def save_base64_as_png(self, base64_data, image_id):
        """
        Converts base64 image -> PNG file
        """
        # Remove base64 prefix if exists
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]
            
        image_bytes = base64.b64decode(base64_data)
        
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Convert unsupported modes
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            
            # Resize for performance
            img.thumbnail((1280,720))
            
            img.save(
                self.get_image_path(image_id),
                format="PNG",
                optimize=True
            )