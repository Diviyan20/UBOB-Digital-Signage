"""
OUTLET IMAGE SERVICE

- Fetches Outlet Images and their names from Odoo
- Handles Image Processing so that images are optimized for Android systems
"""
import base64
import hashlib
import io
import os
from pathlib import Path

import requests
from controllers.outlet_service import fetch_all_outlet_data
from flask import abort, jsonify, send_file
from PIL import Image

# Prevent extremely large image crashes
Image.MAX_IMAGE_PIXELS = 20_000_000

# =======================
# ENVIRONMENT VARIABLES
# =======================
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL")

# =================
# LAMBDA CACHE DIRECTORY
# =================
CACHE_DIR = Path("/tmp/outlet-images")

# Create folder automatically if missing
CACHE_DIR.mkdir(
    parents=True,
    exist_ok=True
)

# ================
# ODOO HEADERS
# ================
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

# =================
# IMAGE HELPERS
# =================

def normalize(text: str) -> str:
    """
    Normalize text for comparison
    
    Example:
    " Outlet A " -> "outlet a"
    """
    return text.strip().lower()


def image_path(image_id: str) -> str:
    """
    Returns image file path
    
    Example:
    /tmp/outlet-images/abc123.png
    """
    return CACHE_DIR / f"{image_id}.png"

def generate_image_id(name: str, raw_image:str) -> str:
    """
    Generate unique Image ID
    
    Uses:
    - outlet name
    - image content
    
    Helps to prevent duplicate images
    """
    seed = f"{name}:{raw_image[:50]}"
    
    return hashlib.md5(
        seed.encode()
    ).hexdigest()[:10]
    

def convert_base64_to_png(raw_image:str) -> bytes:
    """
    Convert Base64 images into PNG bytes.
    """
    # Only strip data URI prefix if actually present
    if raw_image.startswith("data:"):
        raw_image = raw_image.split(",", 1)[1]
    
    # Process Image
    image_bytes = base64.b64decode(raw_image)
    
    with Image.open(io.BytesIO(image_bytes)) as img:
        img.load()
        
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
            
        img = img.resize((120,120), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="PNG", optimize=True)

        return output.getvalue()
# =================
# ODOO API
# =================

def fetch_outlet_images_raw():
    """
    Fetch raw outlet images from Odoo.
    
    Returns:
    [
        {
            "name": "Outlet A",
            "image": "base64string"
        }
    ]
    """
    response = requests.post(
        f"{ODOO_DATABASE_URL}/api/order/session",
        json={"ids":[]},
        headers=HEADERS,
        timeout=20
    )
    
    response.raise_for_status()
    
    return response.json().get("data", [])


# =================
# MAIN LOGIC
# =================

def fetch_outlet_images():
    """
    Main outlet image processing flow.

    Steps:
    1. Fetch outlet list from database
    2. Fetch outlet images from Odoo
    3. Match images with outlets
    4. Cache images locally
    5. Return frontend-safe response
    """
    
    # Get all outlets from the database
    outlets_list = fetch_all_outlet_data()
    
    # Get all outlet images from Odoo
    images_raw = fetch_outlet_images_raw()
    
    """
    Create a searchable outlet dictionary
    
    Example:
        {
        "outlet a": {...},
        "outlet b": {...}
        }
    """
    outlets = {}
    
    for outlet in outlets_list:
        
        outlet_name = outlet.get("outlet_name","").strip()
        
        if outlet_name:
            outlets[
                normalize(outlet_name)
            ] = outlet
    
    results = []
    
    # Process every image from Odoo
    for item in images_raw:
        name = (
            item.get("name") or ""
        ).strip()
        
        raw_image = (
            item.get("image") or ""
        ).strip()
    
        # Skip invalid data
        if not name or not raw_image:
            continue
        
        # Normalize name for matching
        key = normalize(name)
        
        # Find matching outlet
        outlet = outlets.get(key)
        
        # Skip if outlet not found
        if not outlet:
            continue
            
        # Generate Unique Image ID
        image_id = generate_image_id(name, raw_image)
        path = image_path(image_id)
        
        # Cache image only if missing
        if not path.exists():
            try:
                png_bytes = convert_base64_to_png(raw_image)
                path.write_bytes(png_bytes)
            
            except Exception as e:
                return jsonify({
                    "success": False,
                    "error": str(e)
                })
        
        # Add response item
        results.append({
            "id": image_id,
            "outlet_name": outlet["outlet_name"],
            "image": f"{PUBLIC_HOST}/outlet_image/{image_id}"
        })
    
    return results

# ======================
# API RESPONSE HELPERS
# ======================

def get_outlet_images_response():
    """
    Returns response for Frontend
    """
    return jsonify({
        "media": fetch_outlet_images()
    }), 200

def stream_outlet_image(image_id: str):
    """
    Streams the cached images to frontend.
    """
    path = image_path(image_id)
    
    # Image missing
    if not path.exists():
        abort(404, "Image Not Found")
    
    return send_file(
        path,
        mimetype="image/png",
        as_attachment=False
    )