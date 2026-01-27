import base64
import hashlib
import io
import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import abort, jsonify, send_file
from PIL import Image

load_dotenv()
Image.MAX_IMAGE_PIXELS = 20_000_000

# -----------------
# CONFIG
# -----------------
ODOO_BASE_URL = os.getenv("ODOO_DATABASE_URL")
ODOO_API_TOKEN = os.getenv("ODOO_API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL", "http://10.0.2.2:5000")

HEADERS = {
    "Authorization": f"Bearer {ODOO_API_TOKEN}",
    "Content-Type": "application/json",
}

CACHE_DIR = Path(__file__).parent / "cache" / "outlets"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# -----------------
# HELPERS
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

        img.thumbnail((1280, 720))
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


# -----------------
# FETCHERS
# -----------------

def fetch_outlet_names():
    """
    /api/get/outlet/regions → outlet id + name
    """
    res = requests.post(
        f"{ODOO_BASE_URL}/api/get/outlet/regions",
        json={"ids": []},
        headers=HEADERS,
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    outlets = {}
    for region in data.get("data", []):
        for outlet in region.get("pos_shops", []):
            name = outlet.get("name")
            if name:
                outlets[normalize(name)] = {
                    "outlet_id": outlet.get("id"),
                    "outlet_name": name,
                }

    log.info(f"Loaded {len(outlets)} outlets")
    return outlets


def fetch_outlet_images_raw():
    """
    /api/order/session → outlet images (base64)
    """
    res = requests.post(
        f"{ODOO_BASE_URL}/api/order/session",
        json={"ids": []},
        headers=HEADERS,
        timeout=20,
    )
    res.raise_for_status()
    return res.json().get("data", [])


# -----------------
# PUBLIC API
# -----------------

def fetch_outlet_images():
    """
    Returns:
    [{ id, outlet_name, image }]
    """
    outlets = fetch_outlet_names()
    images_raw = fetch_outlet_images_raw()

    results = []

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
