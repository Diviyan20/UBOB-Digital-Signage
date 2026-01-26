import base64
import io
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from flask import abort, send_file
from PIL import Image

# -----------------------------------
# ENVIRONMENT VARIABLES CONFIGURATION
# -----------------------------------
load_dotenv()
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

PUBLIC_HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://10.0.2.2:5000")

# -----------------------------
# CACHE DIRECTORY CONFIGURATION
# ------------------------------
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache" / "media"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# -------------
# LOGGING SETUP
# -------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ----------------
# DATA STRUCTURES
# ----------------


@dataclass
class MediaItem:
    id: str
    name: Optional[str]
    description: Optional[str]
    image: str  # URL served by backend


# -------
# HELPERS
# -------

def fetch_new_from_odoo() -> dict:
    """Fetch raw promotion media from Odoo"""
    log.info("Fetching promotions from Odoo....")
    res = requests.get(f"{BASE_URL}/api/get/news", headers=HEADERS, timeout=20)
    res.raise_for_status()
    return res.json()


def image_path(image_id: str) -> Path:
    return CACHE_DIR / f"{image_id}.png"


def image_exists(image_id: str) -> bool:
    return image_path(image_id).exists()


def save_base64_as_png(base64_data: str, image_id: str) -> None:
    """Convert base64 -> PNG and save to disk."""

    if base64_data.startswith("data:image"):
        base64_data = base64_data.split(",", 1)[1]

    raw_bytes = base64.b64decode(base64_data)

    with Image.open(io.BytesIO(raw_bytes)) as img:
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        img.thumbnail((1280, 720))
        img.save(image_path(image_id), format="PNG", optimize=True)


# -------------
# MEDIA SERVICE
# -------------


class MediaService:
    def get_media(self) -> List[dict]:
        response = fetch_new_from_odoo()

        if not response.get("status"):
            log.warning("Odoo returned status= FALSE")
            return []

        media_items: List[MediaItem] = []

        for block in response.get("data", []):
            for promo in block.get("promotion", []):
                raw_image = promo.get("image")
                if not raw_image:
                    continue

                # Stable ID: name-based (easy to debug)
                name = promo.get("name", "unknown")
                description = promo.get("description", "unknown")
                image_id = name.lower().replace(" ", "_")

                if not image_exists(image_id):
                    log.info(f"Caching Image: {image_id}")
                    save_base64_as_png(raw_image, image_id)

                media_items.append(
                    MediaItem(
                        id=image_id,
                        name=name,
                        description=description,
                        image=f"{PUBLIC_HOST_URL}/image/{image_id}",
                    )
                )

        log.info(f"Returning {len(media_items)} media items.")
        return [item.__dict__ for item in media_items]

    def stream_image(self, image_id: str):
        path = image_path(image_id)

        if not path.exists():
            log.warning(f"Image not found: {image_id}")
            abort(404)

        return send_file(
            path,
            mimetype="image/png",
            as_attachment=False,
        )

# ----------
# PUBLIC API
# ----------
_media_service = MediaService()

def get_media_json():
    return _media_service.get_media()

def stream_image(image_id: str):
    return _media_service.stream_image(image_id)