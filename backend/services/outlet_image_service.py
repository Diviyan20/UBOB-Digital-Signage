"""
OUTLET IMAGE SERVICE

- Fetches Outlet Images and their names from Odoo
- Handles Image Processing so that images are optimized for Android systems
- Returns base64-encoded PNG directly in the API response
  (frontend downloads and caches locally — no streaming endpoint needed)
"""
import base64
import hashlib
import io
import os
from difflib import get_close_matches

import requests
from flask import jsonify
from PIL import Image
from services.outlet_service import fetch_all_outlet_data

# Prevent extremely large image crashes
Image.MAX_IMAGE_PIXELS = 20_000_000

# =======================
# ENVIRONMENT VARIABLES
# =======================
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")

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
    Normalize text for comparison.

    Example:
    " Outlet A " -> "outlet a"
    """
    return text.strip().lower()


def generate_image_id(name: str, raw_image: str) -> str:
    """
    Generate a stable unique image ID from outlet name + image content.
    Used by the frontend as a cache filename.
    """
    seed = f"{name}:{raw_image[:50]}"
    return hashlib.md5(seed.encode()).hexdigest()[:10]


def convert_base64_to_png_b64(raw_image: str) -> str:
    """
    Convert raw base64 image (any format) to an optimized 120x120 PNG,
    then return it as a base64 string for direct JSON embedding.
    """
    # Strip data URI prefix if present
    if raw_image.startswith("data:"):
        raw_image = raw_image.split(",", 1)[1]

    image_bytes = base64.b64decode(raw_image)

    with Image.open(io.BytesIO(image_bytes)) as img:
        img.load()

        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        img = img.resize((120, 120), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="PNG", optimize=True)

        return base64.b64encode(output.getvalue()).decode("utf-8")


# =================
# OUTLET MATCHING
# =================

def find_outlet(name: str, outlets: dict) -> dict | None:
    """
    Match an Odoo outlet name against the DB outlet dictionary.

    Tries exact match first, then falls back to fuzzy match (80% similarity).
    Logs mismatches so you can fix data inconsistencies over time.
    """
    key = normalize(name)

    # Exact match
    if key in outlets:
        return outlets[key]

    # Fuzzy match fallback
    matches = get_close_matches(key, outlets.keys(), n=1, cutoff=0.8)
    if matches:
        print(f"[FUZZY MATCH] '{key}' -> '{matches[0]}'")
        return outlets[matches[0]]

    print(f"[MATCH FAIL] Odoo name '{name}' (normalized: '{key}') not found in DB")
    print(f"[DB OUTLETS] {list(outlets.keys())}")
    return None


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
        json={"ids": []},
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
    3. Match images to outlets (exact + fuzzy)
    4. Convert each image to optimized PNG
    5. Return base64-encoded PNG directly in response
       (no streaming endpoint — frontend caches to disk)
    """

    # Step 1: Get all outlets from DB
    outlets_list = fetch_all_outlet_data()

    # Step 2: Get all outlet images from Odoo
    images_raw = fetch_outlet_images_raw()

    # Step 3: Build searchable outlet dict keyed by normalized name
    outlets = {}
    for outlet in outlets_list:
        outlet_name = outlet.get("outlet_name", "").strip()
        if outlet_name:
            outlets[normalize(outlet_name)] = outlet

    results = []

    # Step 4: Process every image from Odoo
    for item in images_raw:
        name = (item.get("name") or "").strip()
        raw_image = (item.get("image") or "").strip()

        # Skip entries with missing data
        if not name or not raw_image:
            continue

        # Match to DB outlet
        outlet = find_outlet(name, outlets)
        if not outlet:
            continue

        # Generate stable image ID (used as filename on device)
        image_id = generate_image_id(name, raw_image)

        # Convert to optimized PNG and base64-encode for JSON transport
        try:
            image_b64 = convert_base64_to_png_b64(raw_image)
        except Exception as e:
            print(f"[IMAGE ERROR] Failed processing '{name}': {e}")
            continue

        results.append({
            "id": image_id,
            "outlet_name": outlet["outlet_name"],
            "image_b64": image_b64,   # frontend writes this to disk
        })

    print(f"[OUTLET IMAGES] Returning {len(results)} images")
    return results


# ======================
# API RESPONSE HELPERS
# ======================

def get_outlet_images_response():
    """
    Returns response for frontend.
    Each item includes image_b64 — a base64-encoded optimized PNG.
    Frontend downloads and caches these to device storage.
    """
    return jsonify({
        "media": fetch_outlet_images()
    }), 200