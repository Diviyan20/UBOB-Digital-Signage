import base64
import hashlib
import io
import logging
import os
from ast import List
from pathlib import Path

import requests
from flask import abort, jsonify, send_file
from PIL import Image

CACHE_ROOT = Path(os.getenv("CACHE_ROOT", "/tmp/digital-signage-cache"))
CACHE_DIR = CACHE_ROOT / "outlets"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------
# CONFIG
# -----------------
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL")

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


# HEADERS
def odoo_headers():
    return{
        "Authorization":f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }

# ----------------------------------------
# MAIN FUNCTION - Single Source of Truth
# ----------------------------------------
def fetch_all_outlet_data() -> List:
    """
    Main function which fetches all the outlet data from Odoo.
    Returns complete information of all outlets
    """
    try:
        log.info("Fetching Outlet data from Odoo....")
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids":[]},
            headers=odoo_headers(),
            timeout=15
        )
        
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get("status"):
            log.error("Odoo API Error.")
            return[]
        else:
            # Extract all outlet data
            outlets = []
            
            for region in data.get("data",[]):
                region_name = region.get("outlet_region_name")
                
                for outlet in region.get("pos_shops",[]):
                    outlets.append({
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": str(outlet.get("name")),
                        "region_name": region_name,
                        "is_open": outlet.get("is_open",False)
                    })
            
            log.info(f"Fetched {len(outlets)} Outlets from Odoo.")
            return outlets

    except Exception as e:
        log.error(f"Failed to fetch outlets from Odoo: {e}")
        return []


# -----------------
# IMAGE HELPERS
# -----------------

def normalize(name: str) -> str:
    return name.strip().lower()


def image_path(image_id: str) -> Path:
    return CACHE_DIR / f"{image_id}.png"


def generate_image_id(name: str, raw_img: str) -> str:
    seed = f"{name}:{raw_img[:50]}"
    return hashlib.md5(seed.encode()).hexdigest()[:10]


def base64_to_png(raw_img: str) -> bytes:
    if "," in raw_img:
        raw_img = raw_img.split(",", 1)[1]

    img_bytes = base64.b64decode(raw_img)

    with Image.open(io.BytesIO(img_bytes)) as img:
        img.load() # Forces full decode
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        img = img.resize((120,120), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue()

def fetch_outlet_images_raw():
    """
    /api/order/session → outlet images (base64)
    """
    res = requests.post(
        f"{ODOO_DATABASE_URL}/api/order/session",
        json={"ids": []},
        headers=odoo_headers(),
        timeout=20,
    )
    res.raise_for_status()
    return res.json().get("data", [])


def fetch_outlet_images():
    """
    Returns:
    [{ id, outlet_name, image }]
    """
    outlets_list = fetch_all_outlet_data()
    images_raw = fetch_outlet_images_raw()

    outlets = {}
    
    for outlet in outlets_list:
        name = outlet.get("outlet_name", "").strip()
        if name:
            outlets[normalize(name)] = outlet
    
    results =[]

    for item in images_raw:
        name = (item.get("name") or "").strip()
        raw_img = (item.get("image") or "").strip()

        if not name or not raw_img:
            continue

        key = normalize(name)
        outlet = outlets.get(key)

        if not outlet:
            log.debug(f"No outlet match for image: {name}")
            continue

        image_id = generate_image_id(name, raw_img)
        path = image_path(image_id)

        if not path.exists():
            try:
                path.write_bytes(base64_to_png(raw_img))
                log.info(f"Cached outlet image: {name}")
            except Exception as e:
                log.warning(f"Failed to cache image for {name}: {e}")
                continue

        results.append({
            "id": image_id,
            "outlet_name": outlet["outlet_name"],
            "image": f"{PUBLIC_HOST}/outlet_image/{image_id}",
        })

    log.info(f"Returning {len(results)} outlet images")
    return results


def get_outlet_images_with_names():
    return jsonify({
        "media": fetch_outlet_images()
    }), 200


def stream_outlet_image(image_id: str):
    path = image_path(image_id)
    if not path.exists():
        abort(404, "Image not found")

    return send_file(path, mimetype="image/png", as_attachment=False)