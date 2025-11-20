import os, io, base64, json, gc, threading, requests, logging, hashlib
from dataclasses import dataclass
from typing import Optional, Dict, Tuple, List
from pathlib import Path
from dotenv import load_dotenv
from flask import send_file, jsonify, abort
from PIL import Image as PILImage
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from func_timeout import func_timeout, FunctionTimedOut

load_dotenv()

# -----------------------------------
# ENVIRONMENT VARIABLES CONFIGURATION
# -----------------------------------
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")

# -----------------------------
# CACHE DIRECTORY CONFIGURATION
# -----------------------------
CACHE_DIR = Path(r"D:/outlet_cache")
MAX_CACHE_SIZE_MB = 15
MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024
CACHE_INDEX_FILE = CACHE_DIR / "cache_index.json"

# Ensure cache directory exists
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Single session to reuse connections
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# Thread pool for parallel image processing
PROCESSOR_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="outlet_img_proc")

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
class OutletImageMetadata:
    """Metadata for a cached outlet image"""
    id: str
    name: Optional[str]
    image: str  # Image URL

@dataclass
class CachedOutletImage:
    """Represent a cached outlet image with metadata and bytes"""
    meta: OutletImageMetadata
    image_bytes: bytes


# -------------
# CACHE MANAGER
# -------------

class OutletImageCacheManager:
    """Manages disk-based outlet image cache with size limits and cleanup."""

    def __init__(self, cache_dir: Path, max_size_bytes: int, index_file: Path):
        self.cache_dir = cache_dir
        self.max_size_bytes = max_size_bytes
        self.index_file = index_file
        self.lock = threading.Lock()
        self._index: Dict[str, int] = {}  # {filename: size_bytes}
        self._load_index()
    
    def _load_index(self) -> None:
        """Load cache index from disk."""
        if not self.index_file.exists():
            self._index = {}
            return
        try:
            with open(self.index_file, "r") as f:
                self._index = json.load(f)
        except Exception as e:
            log.warning(f"Failed to load outlet cache index: {e}")
            self._index = {}
        
    def _save_index(self) -> None:
        """Save cache index to disk."""
        try:
            with open(self.index_file, "w") as f:
                json.dump(self._index, f)
        except Exception as e:
            log.error(f"Failed to save outlet cache index: {e}")
        
    
    def get_total_size_bytes(self) -> int:
        return sum(self._index.values())
    
    def get_total_size_mb(self) -> float:
        """Get total cache size in Megabytes (MB)"""
        return self.get_total_size_bytes() / (1024 * 1024)
    
    def has_image(self, image_id: str) -> bool:
        """Check if image exists in the cache"""
        filename = f"{image_id}.png"
        file_path = self.cache_dir / filename
        return file_path.exists() and filename in self._index
    
    def get_image_path(self, image_id: str) -> Path:
        """Get file path for the image ID"""
        return self.cache_dir / f"{image_id}.png"
    
    def load_image(self, image_id: str) -> Optional[bytes]:
        """Load image bytes from the disk cache"""
        file_path = self.get_image_path(image_id)

        if not file_path.exists():
            return None
        
        try:
            with open(file_path, "rb") as f:
                return f.read()
            
        except Exception as e:
            log.warning(f"Failed to load cached outlet image {image_id}: {e}")
            
            # Remove from index if the file is corrupted
            self._remove_from_index(image_id)
            return None
        
    def save_image(self, image_id: str, image_bytes: bytes) -> bool:
        """Save image to disk cache and update index"""
        filename = f"{image_id}.png"
        file_path = self.cache_dir / filename

        try:
            with open(file_path, "wb") as f:
                f.write(image_bytes)

            size = file_path.stat().st_size

            with self.lock:
                self._index[filename] = size
                self._save_index()
            
            # Trigger cleanup if needed
            self._cleanup_if_needed()
            return True
        
        except Exception as e:
            log.error(f"Failed to save outlet image {image_id}: {e}")
            return False
        
    def _remove_from_index(self, image_id: str) -> None:
        """Remove image from the index"""
        filename = f"{image_id}.png"
        if filename in self._index:
            del self._index[filename]
            self._save_index()
    
    def _cleanup_if_needed(self) -> None:
        """Cleanup cache if exceeds file size limit"""
        # First, sync index with actual files on disk
        self._sync_index_with_disk()
        
        total_size = self.get_total_size_bytes()

        if total_size <= self.max_size_bytes:
            return
        
        log.info(f"🧹 Outlet cache cleanup triggered ({self.get_total_size_mb():.2f} MB)")

        # Get all cached files with their creation times
        files_with_times = []
        for filename in list(self._index.keys()):
            file_path = self.cache_dir / filename
            if file_path.exists():
                try:
                    ctime = file_path.stat().st_ctime
                    size = file_path.stat().st_size
                    files_with_times.append((filename, file_path, ctime, size))
                except (OSError, FileNotFoundError):
                    # File doesn't exist or was deleted, remove from index
                    image_id = filename.replace(".png", "")
                    self._remove_from_index(image_id)
            else:
                # File doesn't exist, remove from index
                image_id = filename.replace(".png", "")
                self._remove_from_index(image_id)
        
        # Sort by creation time (Oldest first)
        files_with_times.sort(key=lambda x: x[2])

        # Delete oldest file first until we are under 90% of the limit
        target_size = int(self.max_size_bytes * 0.9)
        deleted_count = 0

        for filename, file_path, _, actual_size in files_with_times:
            if total_size <= target_size:
                break
                
            try:
                # Double-check file exists before deletion (race condition protection)
                if not file_path.exists():
                    # File was already deleted, just remove from index
                    with self.lock:
                        if filename in self._index:
                            index_size = self._index[filename]
                            del self._index[filename]
                            total_size -= index_size
                    continue
                
                # Get actual file size
                file_size = file_path.stat().st_size
                file_path.unlink()
                
                with self.lock:
                    if filename in self._index:
                        del self._index[filename]
                
                total_size -= file_size
                deleted_count += 1
            
            except (OSError, FileNotFoundError) as e:
                # File doesn't exist or was already deleted
                with self.lock:
                    if filename in self._index:
                        # Use index size as fallback
                        index_size = self._index.get(filename, 0)
                        del self._index[filename]
                        total_size -= index_size
                log.debug(f"File {filename} was already deleted, removed from index")
            except Exception as e:
                log.warning(f"Failed to delete {file_path}: {e}")
        
        if deleted_count > 0:
            self._save_index()
            log.info(f"✅ Deleted {deleted_count} outlet files, cache reduced to {self.get_total_size_mb():.2f} MB")
    
    def _sync_index_with_disk(self) -> None:
        """Sync cache index with actual files on disk, removing orphaned entries."""
        with self.lock:
            files_to_remove = []
            for filename in list(self._index.keys()):
                file_path = self.cache_dir / filename
                if not file_path.exists():
                    files_to_remove.append(filename)
            
            if files_to_remove:
                for filename in files_to_remove:
                    del self._index[filename]
                self._save_index()
                log.debug(f"Removed {len(files_to_remove)} orphaned entries from outlet cache index")


# ---------------
# IMAGE PROCESSOR
# ---------------
class OutletImageProcessor:
    """Handles outlet image processing and optimization"""

    MAX_DIMENSIONS = (1280, 720)

    @staticmethod
    def process_image(img_data: str, image_id: str) -> Optional[bytes]:
        """Process and optimize image from base64 data."""
        try:
            # Normalize base64 input
            if not img_data.startswith("data:image"):
                img_data = "data:image/png;base64," + img_data

            # Decode base64
            base64_data = img_data.split(",")[1] if "," in img_data else img_data
            img_bytes = base64.b64decode(base64_data)

            # Process with PIL
            with PILImage.open(io.BytesIO(img_bytes)) as img:
                # Convert palette/transparency modes to RGBA
                if img.mode in ("P", "RGBA", "LA"):
                    img = img.convert("RGBA")
                elif img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                
                # Resize maintaining aspect ratio
                img.thumbnail(OutletImageProcessor.MAX_DIMENSIONS, PILImage.Resampling.LANCZOS)

                # Save as optimized PNG
                output = io.BytesIO()
                img.save(output, format="PNG", optimize=True)
                return output.getvalue()
        
        except Exception as e:
            log.warning(f"Failed to process outlet image {image_id}: {e}")
            return None


# -------------
# OUTLET SERVICE
# -------------

class OutletService:
    """Main service for fetching and managing outlet data and images."""

    def __init__(self):
        self.cache_manager = OutletImageCacheManager(CACHE_DIR, MAX_CACHE_SIZE_BYTES, CACHE_INDEX_FILE)
        self.memory_cache: Dict[str, CachedOutletImage] = {}
        self.cache_loaded = False
        self.lock = threading.Lock()
        self._outlets_cache = None
        self._outlets_cache_lock = threading.Lock()
    
    def _fetch_raw_outlets_data(self):
        """Fetch raw outlets data from Odoo API."""
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
    
    def _fetch_raw_outlet_images_data(self):
        """Fetch raw outlet images data from Odoo API."""
        try:
            log.info("🖼️ Fetching outlet image metadata from Odoo...")
            res = SESSION.post(f"{BASE_URL}/api/order/session", json={"ids": []}, timeout=20)
            res.raise_for_status()
            data = res.json()

            if not data.get("status"):
                raise ValueError(data.get("message", "Invalid Odoo response"))

            return data.get("data", [])
        except Exception as e:
            log.error(f"❌ Failed to fetch outlet images data: {e}")
            return []
    
    def _generate_image_id(self, name: str, img_data: str = "") -> str:
        """Generate a unique ID for an image based on name or data."""
        unique_str = (name or "") + (img_data[:100] or "")
        return hashlib.md5(unique_str.encode("utf-8")).hexdigest()[:10]
    
    def _create_metadata(self, name: str, image_id: str) -> OutletImageMetadata:
        """Create metadata object from item data."""
        return OutletImageMetadata(
            id=image_id,
            name=name,
            image=f"{HOST_URL}/outlet_image/{image_id}",
        )
    
    def get_outlets(self) -> List[dict]:
        """Get outlets list with caching."""
        with self._outlets_cache_lock:
            if self._outlets_cache is None:
                self._outlets_cache = self._fetch_raw_outlets_data()
            return self._outlets_cache.copy()
    
    def clear_outlets_cache(self):
        """Clear outlets cache (useful for testing or manual refresh)."""
        with self._outlets_cache_lock:
            self._outlets_cache = None
    
    def get_outlet_images(self) -> List[dict]:
        """Fetch outlet images list - returns metadata immediately, processes images async."""
        try:
            # Return cached images if available
            with self.lock:
                if self.cache_loaded and self.memory_cache:
                    log.info("\nReturning cached outlet images list\n")
                    return [img.meta.__dict__ for img in self.memory_cache.values()]

            # Fetch raw data from API
            data = self._fetch_raw_outlet_images_data()

            new_cache: Dict[str, CachedOutletImage] = {}
            metadata_list: List[dict] = []
            processing_tasks: List[Tuple[str, str, str, OutletImageMetadata]] = []

            # Step 1: Build metadata and check cache
            for item in data:
                raw_img = (item.get("image") or "").strip()
                if not raw_img:
                    log.debug(f"Skipping item with no image data: {item.get('name', 'Unknown')}")
                    continue

                name = item.get("name", "").strip()
                if not name:
                    log.warning(f"Skipping item with no name, using image hash for ID")
                
                image_id = self._generate_image_id(name, raw_img)
                meta = self._create_metadata(name, image_id)

                # Check if image already exists in disk cache
                if self.cache_manager.has_image(image_id):
                    image_bytes = self.cache_manager.load_image(image_id)
                    if image_bytes:
                        new_cache[image_id] = CachedOutletImage(meta=meta, image_bytes=image_bytes)
                        metadata_list.append(meta.__dict__)
                        log.debug(f"✅ Loaded cached image for {name} (ID: {image_id})")
                        continue
                    else:
                        log.warning(f"⚠️ Cache index says image exists but failed to load: {image_id}")
                
                # Queue for processing
                metadata_list.append(meta.__dict__)
                processing_tasks.append((image_id, name, raw_img, meta))
                log.debug(f"📋 Queued image for processing: {name} (ID: {image_id})")

            # Step 2: Return metadata immediately
            log.info(f"✅ Returning {len(metadata_list)} outlet images (metadata only)")

            # Step 3: Process images in background
            if processing_tasks:
                # Process first 3 images synchronously for immediate availability
                priority_tasks = processing_tasks[:3]
                remaining_tasks = processing_tasks[3:]

                # Block on priority tasks
                for task in priority_tasks:
                    image_id, name, img_data, meta = task
                    try:
                        image_bytes = OutletImageProcessor.process_image(img_data, image_id)
                        if image_bytes:
                            if self.cache_manager.save_image(image_id, image_bytes):
                                new_cache[image_id] = CachedOutletImage(meta=meta, image_bytes=image_bytes)
                                log.info(f"✅ Processed priority image: {name} (ID: {image_id})")
                            else:
                                log.error(f"❌ Failed to save image to cache: {name} (ID: {image_id})")
                        else:
                            log.warning(f"⚠️ Failed to process image: {name} (ID: {image_id})")
                    except Exception as e:
                        log.error(f"❌ Error processing priority image {name} (ID: {image_id}): {e}")

                # Process rest async
                if remaining_tasks:
                    self._process_images_async(remaining_tasks, new_cache)
                
                # Update cache with priority items
                with self.lock:
                    self.memory_cache.update(new_cache)
                    if not remaining_tasks:
                        self.cache_loaded = True
            else:
                # All images were cached, update immediately
                with self.lock:
                    self.memory_cache = new_cache
                    self.cache_loaded = True

            return metadata_list
        
        except Exception as e:
            log.error(f"Error fetching outlet images: {e}")
            # Return cached data if available
            with self.lock:
                if self.cache_loaded and self.memory_cache:
                    return [img.meta.__dict__ for img in self.memory_cache.values()]
            return []
    
    def _process_images_async(self, tasks: List[Tuple], new_cache: Dict[str, CachedOutletImage]) -> None:
        """Process images in parallel and update cache."""
        def process_task(task):
            image_id, name, img_data, meta = task
            try:
                image_bytes = OutletImageProcessor.process_image(img_data, image_id)

                if image_bytes:
                    # Save to disk cache
                    if self.cache_manager.save_image(image_id, image_bytes):
                        return image_id, image_bytes, meta, None
                    else:
                        return image_id, None, meta, "Failed to save to cache"
                else:
                    return image_id, None, meta, "Failed to process image"
            except Exception as e:
                log.error(f"Exception in process_task for {name} (ID: {image_id}): {e}")
                return image_id, None, meta, str(e)

        # Submit all tasks
        futures = [PROCESSOR_POOL.submit(process_task, task) for task in tasks]

        def update_cache():
            """Background thread to update cache as images are processed."""
            processed_count = 0
            failed_count = 0
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        image_id, image_bytes, meta, error = result
                        if image_bytes:
                            with self.lock:
                                new_cache[image_id] = CachedOutletImage(meta=meta, image_bytes=image_bytes)
                            processed_count += 1
                            log.debug(f"✅ Processed async image: {meta.name} (ID: {image_id})")
                        else:
                            failed_count += 1
                            log.warning(f"⚠️ Failed to process async image: {meta.name} (ID: {image_id}) - {error}")

                except Exception as e:
                    failed_count += 1
                    log.error(f"Error processing outlet image in async task: {e}", exc_info=True)
            
            # Update global cache when all processing is done
            with self.lock:
                self.memory_cache.update(new_cache)
                self.cache_loaded = True
            
            log.info(f"✅ Processed {processed_count} new outlet images, {failed_count} failed, total cached: {len(new_cache)} items")
            gc.collect()
        
        # Start background processing
        threading.Thread(target=update_cache, daemon=True).start()
    
    def stream_outlet_image(self, image_id: str):
        """Return PNG Image by ID from memory or disk cache, with lazy fetch fallback."""
        try:
            # Step 1: Check memory cache
            with self.lock:
                cached = self.memory_cache.get(image_id)

            if cached and cached.image_bytes:
                return send_file(
                    io.BytesIO(cached.image_bytes),
                    mimetype="image/png",
                    as_attachment=False,
                    download_name=f"{image_id}.png",
                )

            # Step 2: Check disk cache
            image_bytes = self.cache_manager.load_image(image_id)
            if image_bytes:
                # Update memory cache for faster future access
                with self.lock:
                    if cached:
                        cached.image_bytes = image_bytes
                    else:
                        # Create minimal entry
                        meta = OutletImageMetadata(
                            id=image_id,
                            name=None,
                            image=f"{HOST_URL}/outlet_image/{image_id}",
                        )
                        self.memory_cache[image_id] = CachedOutletImage(meta=meta, image_bytes=image_bytes)

                return send_file(
                    io.BytesIO(image_bytes),
                    mimetype="image/png",
                    as_attachment=False,
                    download_name=f"{image_id}.png"
                )
            
            # Step 3: Check if image is currently being processed
            if not self.cache_manager.has_image(image_id):
                with self.lock:
                    if image_id not in [img.meta.id for img in self.memory_cache.values()]:
                        log.info(f"Outlet image {image_id} still processing, returning placeholder")
                        # Do not return placeholder immediately, try lazy loading first
                    else:
                        log.debug(f"Image {image_id} exists in memory but not processed yet")

            # Step 4: Lazy fetch from Odoo API if not in cache
            log.info(f"📡 Lazy fetch for outlet image {image_id} from Odoo API...")
            
            # Try to find this specific image without fetching all images
            found_item = None
            found_name = None

            # First try to find it in exisiting metadata cache
            with self.lock:
                for cached_img in self.memory_cache.values():
                    if cached_img.meta.id == image_id and cached_img.meta.name:
                        found_name = cached_img.meta.name
                        break
            
            # If we have the name, we can be more specific
            if found_name:
                log.debug(f"Found cached name '{found_name}' for image {image_id}")
                # We can try a more targeted search or use the name to reconsturct the image
                data = self._fetch_raw_outlet_images_data()

                # Look for the specific image by name
                for item in data:
                    if item.get("name", "").strip() == found_name.strip():
                        found_item = item
                        break
            
            else:
                # Fallback: fetch all and search (but with better error handling)
                log.debug(f"No cached name for {image_id}, fetching all outlet images...")
                data = self._fetch_raw_outlet_images_data()

                if not data:
                    log.warning(f"No outlet images availble for ID: {image_id}")
                    return abort(404, "No image available for this outlet")

                # Search for the image by ID matching
                for item in data:
                    name = item.get("name", "").strip()
                    raw_img = (item.get("image") or "").strip()

                    if not raw_img:
                        continue

                    # Generate ID using the same method as metadata creation
                    possible_id = self._generate_image_id(name, raw_img)

                    if possible_id == image_id:
                        found_item = item
                        break
            
            if found_item:
                name = found_item.get("name","").strip()
                raw_img = found_item.get("image","").strip()

                if not raw_img:
                    log.error(f"❌ No image data found for matched item {name}")
                    return abort(404, "No image data found for this outlet")
            
            try:
                log.info(f"🔄 Processing outlet image {name} (ID: {image_id})...")
                
                # Process and cache the image with timeout protection                
                
                try:
                    image_bytes = func_timeout(30, OutletImageProcessor.process_image, args=(raw_img, image_id))
                    
                    if not image_bytes:
                        log.error(f"❌ Failed to process image for {name}")
                        return abort(404, "No image data found for this outlet")
                    
                    # Save to disk cache
                    success = self.cache_manager.save_image(image_id, image_bytes)
                    if not success:
                        log.error(f"❌ Failed to save image {name} to cache")
                        return abort(404, "No image data found for this outlet")
                    
                    # Create metadata and update memory cache
                    meta = self._create_metadata(name, image_id)
                    with self.lock:
                        self.memory_cache[image_id] = CachedOutletImage(meta=meta, image_bytes=image_bytes)
                    
                    log.info(f"💾 Successfully cached and serving outlet image {name} (ID: {image_id})")
                    return send_file(
                        io.BytesIO(image_bytes),
                        mimetype="image/png",
                        as_attachment=False,
                        download_name=f"{image_id}.png"
                    )
                
                except FunctionTimedOut:
                    log.error(f"⏰ Timeout processing image {name}")
                    return abort(404, "Image processing timeout")
                    
            except Exception as e:
                log.error(f"⚠️ Failed to process/cache outlet image {name}: {e}")
                return abort(404, f"Failed to process outlet image: {str(e)}")
    
        except Exception as e:
            # Return placeholder for any error to prevent app crashes
            log.error(f"❌ Error streaming outlet image {image_id}: {e}", exc_info=True)
            return abort(404, f"Error streaming outlet image: {str(e)}")
    
    def get_outlet_images_with_names(self) -> Tuple[dict, int]:
        """Get outlet images combined with outlet names."""
        try:
            outlets = self.get_outlets()
            images = self.get_outlet_images()

            outlet_map = {
                o["outlet_name"].strip().lower(): o 
                for o in outlets 
                if o.get("outlet_name")
            }
                    
            combined = [
                {
                    "id": img["id"],
                    "image": img["image"],
                    "outlet_id": outlet_map.get(img.get("name", "").strip().lower(), {}).get("outlet_id", ""),
                    "outlet_name": outlet_map.get(img.get("name", "").strip().lower(), {}).get("outlet_name", img.get("name", "")),
                }
                for img in images
            ]

            return {"status": True, "media": combined}, 200
        except Exception as e:
            log.error(f"❌ Failed get_outlet_images_with_names: {e}")
            gc.collect()
            return {"status": False, "message": str(e)}, 500


# ---------------
# GLOBAL INSTANCE 
# ---------------
_outlet_service = OutletService()

# Public API functions (maintaining backward compatibility)
@lru_cache(maxsize=1)
def fetch_outlets():
    """Fetch outlets from Odoo (cached)."""
    return _outlet_service.get_outlets()

def fetch_outlet_images():
    """Fetch outlet images - returns metadata immediately, processes images async."""
    return _outlet_service.get_outlet_images()

def stream_outlet_image(image_id: str):
    """Stream outlet image by ID."""
    return _outlet_service.stream_outlet_image(image_id)

def get_outlet_images_with_names():
    """Get outlet images combined with outlet names."""
    result, status_code = _outlet_service.get_outlet_images_with_names()
    return jsonify(result), status_code

# Legacy cache management functions (kept for backward compatibility if needed)
def get_cache_size_mb():
    """Get current cache size in MB."""
    return _outlet_service.cache_manager.get_total_size_mb()

def cleanup_cache():
    """Trigger cache cleanup if needed."""
    _outlet_service.cache_manager._cleanup_if_needed()
