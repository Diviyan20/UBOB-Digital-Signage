import os, io, base64, json, gc, threading, requests, logging
from dotenv import load_dotenv
from flask import send_file, abort
from PIL import Image as PILImage
from memory_profiler import profile
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed

load_dotenv()

# -----------------------------
# CACHE DIRECTORY CONFIGURATION
#------------------------------
CACHE_DIR = r"D:/media_cache"
MAX_CACHE_SIZE_MB = 30  # 30MB size limit for cache
os.makedirs(CACHE_DIR, exist_ok=True)

# --- ENV ---
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

# Single session to reuse connections
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

CACHE_INDEX_FILE = os.path.join(CACHE_DIR, "cache_index.json")
CACHE_LOCK = threading.Lock()

media_cache = {}
cache_loaded = False

# Thread pool for parallel image processing
PROCESSOR_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="img_proc")

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
    """Trim cache if it exceeds max cache size"""
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
                log.warning(f"Failed to delete {path}: {e}")
        
        _save_cache_index(index)
        log.info(f"✅ Cache reduced to {total_size / (1024*1024):.2f} MB")

def _add_to_cache(image_id: str, jpeg_bytes: bytes):
    """Write a processed image to disk cache."""
    file_path = os.path.join(CACHE_DIR, f"{image_id}.jpg")
    
    try:
        with open(file_path, "wb") as f:
            f.write(jpeg_bytes)
        size = os.path.getsize(file_path)
        index = _load_cache_index()
        index[os.path.basename(file_path)] = size
        _save_cache_index(index)
        cleanup_cache()
    except Exception as e:
        log.warning(f"Failed to cache {image_id}: {e}")

def _process_single_image(item, img_data, image_id, image_url):
    """Process a single image and return metadata + bytes."""
    try:
        # Normalize base64 input
        if not img_data.startswith("data:image"):
            img_data = "data:image/jpeg;base64," + img_data

        base64_data = img_data.split(",")[1]
        img_bytes = base64.b64decode(base64_data)
        
        with PILImage.open(io.BytesIO(img_bytes)) as img:
            img.thumbnail((1280, 720))
            output = io.BytesIO()
            img.save(output, format="JPEG", quality=85)
            jpeg_bytes = output.getvalue()

        # Save to disk cache
        _add_to_cache(image_id, jpeg_bytes)

        meta = {
            "id": image_id,
            "name": item.get("name"),
            "description": item.get("description"),
            "date_start": item.get("date_start"),
            "date_end": item.get("date_end"),
            "image": image_url,
        }

        return meta, jpeg_bytes

    except Exception as img_err:
        log.warning(f"⚠️ Failed to process image {item.get('name')}: {img_err}")
        return None, None


# ----------------------------------------------------------
# Fetch media from Odoo (Optimized with async processing)
# ----------------------------------------------------------
@lru_cache(maxsize=1)
def _fetch_raw_media_data():
    """Fetch raw media data from Odoo API (cached)."""
    log.info("📡 Fetching promotion media from Odoo...")
    response = SESSION.get(f"{BASE_URL}/api/get/news", timeout=20)
    response.raise_for_status()
    data = response.json()

    if not data.get("status", False):
        raise ValueError(f"Odoo API error: {data.get('message')}")
    
    return data

@profile
def get_media_json():
    """Fetch media list - returns metadata immediately, processes images async."""
    global media_cache, cache_loaded
    
    try:
        # Return cached metadata if available
        if cache_loaded and media_cache:
            log.info("✅ Returning cached media list")
            return [v["meta"] for v in media_cache.values()]

        # Fetch raw data (cached API call)
        data = _fetch_raw_media_data()
        
        HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")
        new_cache = {}
        metadata_list = []
        processing_tasks = []

        # Step 1: Build metadata immediately (fast, no image processing)
        for block in data.get("data", []):
            for item in block.get("promotion", []):
                img_data = (item.get("image") or "").strip()
                if not img_data:
                    continue

                image_id = str(abs(hash(img_data)))[:10]
                image_url = f"{HOST_URL}/image/{image_id}"
                
                # Check if image already exists in disk cache
                cache_path = os.path.join(CACHE_DIR, f"{image_id}.jpg")
                if os.path.exists(cache_path):
                    # Image already cached, load it
                    try:
                        with open(cache_path, "rb") as f:
                            jpeg_bytes = f.read()
                        new_cache[image_id] = {
                            "meta": {
                                "id": image_id,
                                "name": item.get("name"),
                                "description": item.get("description"),
                                "date_start": item.get("date_start"),
                                "date_end": item.get("date_end"),
                                "image": image_url,
                            },
                            "jpeg_bytes": jpeg_bytes,
                        }
                        metadata_list.append(new_cache[image_id]["meta"])
                        continue
                    except Exception as e:
                        log.warning(f"Failed to load cached image {image_id}: {e}")

                # Create metadata immediately (before processing)
                meta = {
                    "id": image_id,
                    "name": item.get("name"),
                    "description": item.get("description"),
                    "date_start": item.get("date_start"),
                    "date_end": item.get("date_end"),
                    "image": image_url,
                }
                metadata_list.append(meta)

                # Queue image for async processing
                processing_tasks.append((image_id, item, img_data, image_url, meta))

        # Step 2: Return metadata immediately (fast response)
        log.info(f"✅ Returning {len(metadata_list)} media items (metadata only)")
        
        # Step 3: Process images in parallel (background)
        if processing_tasks:
            def process_and_update(task):
                image_id, item, img_data, image_url, meta = task
                processed_meta, jpeg_bytes = _process_single_image(item, img_data, image_id, image_url)
                if processed_meta and jpeg_bytes:
                    return image_id, processed_meta, jpeg_bytes
                return None

            # Process images in parallel
            futures = [PROCESSOR_POOL.submit(process_and_update, task) for task in processing_tasks]
            
            def update_cache():
                """Background thread to update cache as images are processed."""
                processed_count = 0
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        if result:
                            image_id, meta, jpeg_bytes = result
                            with CACHE_LOCK:
                                new_cache[image_id] = {
                                    "meta": meta,
                                    "jpeg_bytes": jpeg_bytes,
                                }
                            processed_count += 1
                    except Exception as e:
                        log.error(f"Error processing image: {e}")
                
                # Update global cache when all processing is done
                # new_cache already contains images loaded from disk + newly processed ones
                global media_cache, cache_loaded
                with CACHE_LOCK:
                    media_cache.update(new_cache)
                    cache_loaded = True
                log.info(f"✅ Processed {processed_count} new images, total cached: {len(new_cache)} items")
                gc.collect()

            # Start background processing (non-blocking)
            threading.Thread(target=update_cache, daemon=True).start()
        else:
            # All images were already cached, update immediately
            media_cache = new_cache
            cache_loaded = True

        return metadata_list

    except Exception as e:
        log.error(f"❌ Error fetching media: {e}")
        # Return cached data if available, otherwise empty
        if cache_loaded and media_cache:
            return [v["meta"] for v in media_cache.values()]
        return []

@profile
def stream_image(image_id: str):
    """Return JPEG image by ID from memory or disk cache (lazy loading)."""
    try:
        # Step 1: Check memory cache
        entry = media_cache.get(image_id)
        if entry and entry.get("jpeg_bytes"):
            return send_file(
                io.BytesIO(entry["jpeg_bytes"]),
                mimetype="image/jpeg",
                as_attachment=False,
                download_name=f"{image_id}.jpg",
            )
        
        # Step 2: Check disk cache (lazy loading)
        cache_path = os.path.join(CACHE_DIR, f"{image_id}.jpg")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "rb") as f:
                    jpeg_bytes = f.read()
                
                # Update memory cache for faster future access
                if entry:
                    entry["jpeg_bytes"] = jpeg_bytes
                else:
                    # Create entry if metadata exists but bytes are missing
                    with CACHE_LOCK:
                        media_cache[image_id] = {
                            "meta": {"id": image_id},  # Minimal metadata
                            "jpeg_bytes": jpeg_bytes,
                        }
                
                return send_file(
                    io.BytesIO(jpeg_bytes),
                    mimetype="image/jpeg",
                    as_attachment=False,
                    download_name=f"{image_id}.jpg",
                )
            except Exception as e:
                log.warning(f"Failed to read cached image {image_id}: {e}")

        # Step 3: Image not found
        log.warning(f"⚠️ Image not found for ID: {image_id}")
        abort(404)

    except Exception as e:
        log.error(f"❌ Failed to stream image {image_id}: {e}")
        abort(500)
