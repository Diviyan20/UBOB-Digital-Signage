import base64
import io
import json
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
INDEX_FILE = CACHE_DIR / "index.json"

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

def fetch_and_cache_media() -> int:
        """
        Fetch media from Odoo and cache images.
        Returns number of media items processed.
        """
        try:
            response = fetch_new_from_odoo()
            
            if not response.get("status"):
                log.warning("Odoo returned status= False")
                return 0

            index = load_index()
            count = 0
            
            for block in response.get("data", []):
                for promo in block.get("promotion", []):
                    raw_image = promo.get("image")
                    
                    if not raw_image:
                        continue
                        
                    name = promo.get("name", "unknown")
                    description = promo.get("description", "unknown")
                    image_id = name.lower().replace(" ", "_")
                    
                    if not image_exists(image_id):
                        save_base64_as_png(raw_image,image_id)
                        log.info(f"Cached media image: {image_id}")
                    
                    index[image_id] = {
                    "name": name,
                    "description": description,
                    "image": f"{image_id}.png",
                    }
                    
                    count += 1
            
            save_index(index)
            log.info(f"Media refresh complete. {count} items processed.")
            return count
    
        except Exception as e:
            log.error(f"Media refresh failed: {e}")
            return 0

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

def load_index() -> dict:
    if not INDEX_FILE.exists():
        return {}

    try:
        content = INDEX_FILE.read_text().strip()
        if not content:
            return {}
        return json.loads(content)
    except json.JSONDecodeError:
        log.warning("index.json is corrupted or empty. Rebuilding.")
        return {}

def save_index(index: dict):
    tmp = INDEX_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(index, indent=2))
    tmp.replace(INDEX_FILE)

# -------------
# MEDIA SERVICE
# -------------

class MediaService:
    
    def get_media(self) -> List[dict]:
       index = load_index()
       items = []
       
       for image_id, data in index.items():
           items.append({
               "id": image_id,
               "name": data.get("name"),
               "description": data.get("description"),
               "image": f"{PUBLIC_HOST_URL}/image/{image_id}",
           })
        
       return items
        

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