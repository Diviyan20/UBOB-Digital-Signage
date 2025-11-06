from functools import lru_cache, wraps
import os, io, base64, json, gc, threading, requests,logging
from dotenv import load_dotenv
from flask import send_file, abort, jsonify
from PIL import Image as PILImage

load_dotenv()

# ----------------
# CONFIGURATION
# ----------------
CACHE_DIR = r"D:/outlet_cache"
MAX_CACHE_SIZE_MB = 15 # 30 MB size limit for cache
os.makedirs(CACHE_DIR, exist_ok=True)

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")

HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

# Single session to reuse connections
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

CACHE_INDEX_FILE = os.path.join(CACHE_DIR, "cache_index.json")
CACHE_LOCK = threading.Lock()

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
# CACHE MANAGEMENT
# ----------------
def _load_cache_index():
    if not os.path.exists(CACHE_INDEX_FILE):
        return {}
    try:
        with open(CACHE_INDEX_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def _save_cache_index(index):
    with open(CACHE_INDEX_FILE, "w") as f:
        json.dump(index, f)

def get_cache_size_mb():
    index = _load_cache_index()
    total = sum(index.values()) / (1024 * 1024)
    return total

def cleanup_cache():
    with CACHE_LOCK:
        index = _load_cache_index()
        total_size = sum(index.values())
        max_bytes = MAX_CACHE_SIZE_MB * 1024 * 1024

        if total_size <= max_bytes:
            return

        log.info(f"🧹 Cache cleanup triggered ({total_size / (1024*1024):.2f} MB)")
        # Sort oldest files first
        files = sorted(((os.path.join(CACHE_DIR, f), os.path.getctime(os.path.join(CACHE_DIR, f))) 
                        for f in index), key=lambda x: x[1])

        for path, _ in files:
            try:
                size = os.path.getsize(path)
                os.remove(path)
                del index[os.path.basename(path)]
                total_size -= size
                if total_size < max_bytes * 0.9:
                    break
            except Exception as e:
                log.error(f"Failed to delete {path}: {e}")

        _save_cache_index(index)
        log.info(f"✅ Cache reduced to {total_size / (1024*1024):.2f} MB")


# ----------------
# IMAGE OPERATIONS
# ----------------
def cache_image(image_id, img_bytes):
    cache_path = os.path.join(CACHE_DIR, f"{image_id}.png")

    try:
        with PILImage.open(io.BytesIO(img_bytes)) as img:
            # Convert palette, RGBA, or other modes to RGB before saving as JPEG
            if img.mode in ("P", "LA"):
                img = img.convert("RGBA")
            
            elif img.mode not in ("RGB", "RBGA"):
                img = img.convert("RGB")

            img.thumbnail((1280, 720))
            img.save(cache_path, format="PNG", quality=85)

        log.info(f"💾 Cached image {image_id} successfully → {cache_path}")
        return cache_path

    except Exception as e:
        log.error(f"⚠️ Failed to cache image {image_id}: {e}")
        raise


# ----------------
# DATA FETCHING
# ----------------
@lru_cache(maxsize=1)
def fetch_outlets():
    try:
        log.info("📡 Fetching outlets from Odoo...")
        res = SESSION.post(f"{BASE_URL}/api/get/outlet/regions", json={"ids": []}, timeout=15)
        res.raise_for_status()
        data = res.json()

        if not data.get("status"):
            raise ValueError(data.get("message", "Odoo API error"))

        outlets = [
            {
                "region_name": region.get("outlet_region_name"),
                "outlet_id": str(outlet.get("id")),
                "outlet_name": outlet.get("name"),
                "is_open": outlet.get("is_open"),
            }
            for region in data.get("data", [])
            for outlet in region.get("pos_shops", [])
        ]
        return outlets
    except Exception as e:
        log.error(f"❌ fetch_outlets: {e}")
        return []

@lru_cache(maxsize=1)
def fetch_outlet_images():
    try:
        log.info("🖼️ Fetching outlet image metadata...")
        res = SESSION.post(f"{BASE_URL}/api/order/session", json={"ids": []}, timeout=20)
        res.raise_for_status()
        data = res.json()

        if not data.get("status"):
            raise ValueError(data.get("message", "Invalid Odoo response"))

        outlet_images = []
        for item in data.get("data", []):
            raw_img = item.get("image", "")
            if not raw_img:
                continue

            name = item.get("name", "").strip()
            image_id = str(abs(hash(name or raw_img)))[:10]
            image_url = f"{HOST_URL}/outlet_image/{image_id}"

            outlet_images.append({
                "id": image_id,
                "name": name,
                "raw_img": raw_img,
                "image": image_url,
            })

        log.info(f"✅ Loaded {len(outlet_images)} images")
        return outlet_images

    except Exception as e:
        log.error(f"❌ Failed fetch_outlet_images: {e}")
        return []

def stream_outlet_image(image_id):
    cache_path = os.path.join(CACHE_DIR, f"{image_id}.jpg")
    if os.path.exists(cache_path):
        log.info(f"✅ Serving cached image {image_id}")
        return send_file(cache_path, mimetype="image/jpeg")

    try:
        log.info(f"📡 Lazy fetch for image {image_id} from Odoo API...")
        res = SESSION.post(f"{BASE_URL}/api/order/session", json={"ids": []}, timeout=20)
        res.raise_for_status()
        data = res.json()
        log.info(f"✅ Received response with {len(data.get('data', []))} items")

        if not data.get("status"):
            log.error(f"❌ Invalid Odoo response: {data}")
            abort(404)

        found = False
        for item in data.get("data", []):
            name = item.get("name", "")
            possible_id = str(abs(hash(name or item.get("image", ""))))[:10]
            if possible_id == image_id:
                found = True
                raw_img = item.get("image", "").strip()
                log.info(f"🎯 Matched outlet image {name} → ID {image_id}")

                if not raw_img:
                    log.error(f"❌ No image data found for {name}")
                    abort(404)

                try:
                    base64_data = raw_img.split(",")[1] if "base64," in raw_img else raw_img
                    img_bytes = base64.b64decode(base64_data)
                except Exception as e:
                    log.error(f"⚠️ Base64 decode failed for {name}: {e}")
                    abort(500)

                try:
                    cached_path = cache_image(image_id, img_bytes)
                    log.info(f"💾 Cached image for {name} at {cached_path}")
                    return send_file(cached_path, mimetype="image/png")
                except Exception as e:
                    log.error(f"⚠️ Failed to cache or send image {name}: {e}")
                    abort(500)

        if not found:
            log.warning(f"⚠️ Image ID {image_id} not found in Odoo response.")
            abort(404)

    except Exception as e:
        log.error(f"❌ stream_outlet_image failed for {image_id}: {e}", exc_info=True)
        abort(500)
    finally:
        gc.collect()


def get_outlet_images_with_names():
    try:
        outlets = fetch_outlets()
        images = fetch_outlet_images()

        outlet_map = {o["outlet_name"].strip().lower(): o for o in outlets if o.get("outlet_name")}
                
        combined = [
            {
                "id": img["id"],
                "image": img["image"],
                "outlet_id": outlet_map.get(img["name"].strip().lower(), {}).get("outlet_id", ""),
                "outlet_name": outlet_map.get(img["name"].strip().lower(), {}).get("outlet_name", img["name"]),
            }
            for img in images
        ]

        return jsonify({"status": True, "media": combined}), 200
    except Exception as e:
        log.error(f"❌ Failed get_outlet_images_with_names: {e}")
        gc.collect()
        return jsonify({"status": False, "message": str(e)}), 500