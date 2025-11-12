import os, io, base64, json, gc, threading, requests, logging
from dataclasses import dataclass
from typing import Optional, Dict, Tuple, List
from pathlib import Path
from dotenv import load_dotenv
from flask import send_file, abort
from PIL import Image as PILImage
from concurrent.futures import ThreadPoolExecutor, as_completed


# -----------------------------------
# ENVIRONMENT VARIABLES CONFIGURATION
# -----------------------------------
load_dotenv()
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")

# -----------------------------
# CACHE DIRECTORY CONFIGURATION
#------------------------------
CACHE_DIR = Path(r"D:/media_cache")
MAX_CACHE_SIZE_MB = 30
MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024
CACHE_INDEX_FILE = CACHE_DIR / "cache_index.json"

# Ensure cache directory exists
CACHE_DIR.mkdir(parents=True, exist_ok = True)


# Single session to reuse connections
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


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
# DATA STRUCTURES
# ----------------

@dataclass
class ImageMetadata:
    """Metadata for a cached image"""
    id: str
    name: Optional[str]
    description: Optional[str]
    date_start: Optional[str]
    date_end: Optional[str]
    image: str  # Image URL

@dataclass
class CachedImage:
    """Represent a cached image with metadata and bytes"""
    meta: ImageMetadata
    image_bytes: bytes



# -------------
# CACHE MANAGER
# -------------

class ImageCacheManager:
    """Manages disk-based image cache with size limits and cleanup."""

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
            log.warning(f"Failed to load cache index: {e}")
            self._index = {}
        
    def _save_index(self) -> None:
        """Save cache index to disk."""
        try:
            with open(self.index_file, "w") as f:
                json.dump(self._index, f)
        except Exception as e:
            log.error(f"Failed to save cache index: {e}")
        
    
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
            log.warning(f"Failed to load cached image {image_id}: {e}")
            
            # Remove from index if the file is corrupted
            self._remove_from_index(image_id)
            return None
        
    def save_image(self, image_id: str, image_bytes: bytes) -> bool:
        """Save image to disk cache and update index"""
        filename = f"{image_id}.png"
        file_path = self.cache_dir / filename

        try:
            with open(file_path,"wb") as f:
                f.write(image_bytes)

            size = file_path.stat().st_size

            with self.lock:
                self._index[filename] = size
                self._save_index()
            
            # Trigger cleanup if needed
            self._cleanup_if_needed()
            return True
        
        except Exception as e:
            log.error(f"Failed to save image {image_id}: {e}")
            return False
        
    def _remove_from_index(self, image_id:str) -> None:
        """Remove image from the index"""
        filename = f"{image_id}.png"
        if filename in self._index:
            del self._index[filename]
            self._save_index()
    
    def _cleanup_if_needed(self) -> None:
        """Cleanup cache if exceeds file size limit"""
        total_size = self.get_total_size_bytes()

        if total_size <= self.max_size_bytes:
            return
        
        log.info(f"🧹 Cache cleanup triggered ({self.get_total_size_mb():.2f} MB)")

        # Get all cached files with their creation times
        files_with_times = []
        for filename in list(self._index.keys()):
            file_path = self.cache_dir / filename
            if file_path.exists():
                try:
                    ctime = file_path.stat().st_ctime
                    files_with_times.append((filename,file_path, ctime))
                except Exception:
                    # File might have been deleteed
                    self._remove_from_index(filename.replace(".png", ""))
        
        # Sort by creation time (Oldest first)
        files_with_times.sort(key=lambda x:x[2])

        # Delete oldest file first untul we are under 90% of the limit
        target_size = int(self.max_size_bytes * 0.9)
        deleted_count = 0

        for filename, file_path, _ in files_with_times:
            if total_size <= target_size:
                break
                
            try:
                size = self._index.get(filename, 0)
                file_path.unlink()
                with self.lock:
                    if filename in self._index:
                        del self._index[filename]
                
                total_size -= size
                deleted_count += 1
            
            except Exception as e:
                log.warning(f"Failed to delete {file_path}: {e}")
        
        if deleted_count > 0:
            self._save_index()
            log.info(f"✅ Deleted {deleted_count} files, cache reduced to {self.get_total_size_mb():.2f} MB")


# ---------------
# IMAGE PROCESSOR
# ---------------
class ImageProcessor:
    """Handles image processing and optimization"""

    MAX_DIMENSIONS = (1280,720)

    @staticmethod
    def process_image(img_data:str, image_id: str) -> Optional[bytes]:
        """Process and optimize image from base64 data."""
        try:
            # Normalize base64 input
            if not img_data.startswith("data:image"):
                img_data = "data:image/png;base64," + img_data

            
            # Decode base64
            base64_data = img_data.split(",")[1]
            img_bytes = base64.b64decode(base64_data)

            # Process with PIL
            with PILImage.open(io.BytesIO(img_bytes)) as img:
                # Convert palette/transparency modes to RGBA
                if img.mode in ("P","RGBA", "LA"):
                    img = img.convert("RGBA")
                
                # Resize maintaining aspect ratio
                img.thumbnail(ImageProcessor.MAX_DIMENSIONS, PILImage.Resampling.LANCZOS)

                # Save as optimized PNG
                output = io.BytesIO()
                img.save(output, format="PNG", optimize=True)
                return output.getvalue()
        
        except Exception as e:
            log.warning(f"Failed to process image {image_id}: {e}")
            return None


# -------------
# MEDIA SERVICE
# -------------

class MediaService:
    """Main service for fetching and managing media."""

    def __init__(self):
        self.cache_manager = ImageCacheManager(CACHE_DIR, MAX_CACHE_SIZE_BYTES, CACHE_INDEX_FILE)
        self.memory_cache: Dict[str, CachedImage] = {}
        self.cache_loaded = False
        self.lock = threading.Lock()
    
    def _fetch_raw_media_data(self):
        """Fetch raw media data from Odoo API."""
        log.info("\nFetching promotion media from Odoo....\n")
        response = SESSION.get(f"{BASE_URL}/api/get/news", timeout=20)
        response.raise_for_status()
        data = response.json()

        if not data.get("status",False):
            raise ValueError(f"Odoo API error: {data.get('message')}")

        return data
    
    def _generate_image_id(self, img_data:str) -> str:
        """Generate a unique ID for an image based on its data."""
        return str(abs(hash(img_data)))[:10]
    
    def _create_metadata(self, item:dict, image_id: str) -> ImageMetadata:
        """Create metadata object from item data."""
        return ImageMetadata(
            id=image_id,
            name=item.get("name"),
            description=item.get("description"),
            date_start=item.get("date_start"),
            date_end=item.get("date_end"),
            image=f"{HOST_URL}/image/{image_id}",
        )
    
    def get_media_json(self) -> List[dict]:
        """Fetch media list - returns metadata immediately, processes images async."""
        try:
            # Return cached media if available
            with self.lock:
                if self.cache_loaded and self.memory_cache:
                    log.info("\nReturning cached media list\n")
                    return [img.meta.__dict__ for img in self.memory_cache.values()]

            # Fetch raw data from API
            data = self._fetch_raw_media_data()

            new_cache: Dict[str, CachedImage] = {}
            metadata_list: List[dict] = []
            processing_tasks: List[Tuple[str, dict, str, ImageMetadata]] = []

            # Step 1: Build metadata and check cache
            for block in data.get("data",[]):
                for item in block.get("promotion", []):
                    img_data = (item.get("image") or "").strip()
                    if not img_data:
                        continue
                        
                    image_id = self._generate_image_id(img_data)
                    meta = self._create_metadata(item,image_id)

                    # Check if image already exists in disk cache
                    if self.cache_manager.has_image(image_id):
                        image_bytes = self.cache_manager.load_image(image_id)
                        if image_bytes:
                            new_cache[image_id] = CachedImage(meta=meta, image_bytes=image_bytes)
                            metadata_list.append(meta.__dict__)
                            continue
                    
                    # Queue for processing
                    metadata_list.append(meta.__dict__)
                    processing_tasks.append((image_id, item, img_data, meta))

            # Step 2: Return metadata immediately
            log.info(f"✅ Returning {len(metadata_list)} media items (metadata only)")

            # Step 3: Process images in background
            if processing_tasks:
                # Process first 3 images synchronously for immediate availability
                priority_tasks = processing_tasks[:3]
                remaining_tasks = processing_tasks[3:]

                # Block on priority tasks
                for task in priority_tasks:
                    image_id, item, img_data, meta = task
                    image_bytes = ImageProcessor.process_image(img_data, image_id)
                    if image_bytes:
                        self.cache_manager.save_image(image_id, image_bytes)
                        new_cache[image_id] = CachedImage(meta=meta, image_bytes=image_bytes)

                # Process rest async
                if remaining_tasks:
                    self._process_images_async(remaining_tasks, new_cache)
                
                # Update cache with priority items
                with self.lock:
                    self.memory_cache.update(new_cache)
                    if not remaining_tasks:
                        self.cache_loaded = True

            return metadata_list
        
        except Exception as e:
            log.error(f"Error fetching media :{e}")
            # Return cached data if available
            with self.lock:
                if self.cache_loaded and self.memory_cache:
                    return[img.meta.__dict__ for img in self.memory_cache.values()]
            return []
    
    def _process_images_async(self, tasks: List[Tuple], new_cache: Dict[str, CachedImage]) -> None:
        """Process images in parallel and update cache."""
        def process_task(task):
            image_id, item, img_data, meta = task
            image_bytes = ImageProcessor.process_image(img_data, image_id)

            if image_bytes:
                # Save disk to cache
                self.cache_manager.save_image(image_id, image_bytes)
                return image_id, image_bytes, meta
            return None

        # Submit all tasks
        futures = [PROCESSOR_POOL.submit(process_task, task) for task in tasks]

        def update_cache():
            """Background thread to update cache as images are processed."""
            processed_count = 0
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        image_id, image_bytes, meta = result
                        with self.lock:
                            new_cache[image_id] = CachedImage(meta=meta, image_bytes=image_bytes)
                            processed_count += 1

                except Exception as e:
                    log.error(f"Error Processing Image: {e}")
            
            # Updage global cache when all processing is done
            with self.lock:
                self.memory_cache.update(new_cache)
                self.cache_loaded = True
            
            log.info(f"Processed {processed_count} new images, total cached: {len(new_cache)} items")
            gc.collect()
        
        # Start background processing
        threading.Thread(target=update_cache, daemon=True).start()
    
    def stream_image(self, image_id: str):
        """Return PNG Image by ID from memory or disk cache."""
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
                # Update memory cahce for faster future access
                with self.lock:
                    if cached:
                        cached.image_bytes = image_bytes
                    else:
                        # Create minimal entry
                        meta = ImageMetadata(
                            id=image_id,
                            name=None,
                            description=None,
                            date_start=None,
                            date_end=None,
                            image=f"{HOST_URL}/image/{image_id}",
                        )
                        self.memory_cache[image_id] = CachedImage(meta=meta, image_bytes=image_bytes)

                    return send_file(
                        io.BytesIO(image_bytes),
                        mimetype="image/png",
                        as_attachment=False,
                        download_name=f"{image_id}.png"
                    )

            # Step 3: Image not found
            log.warning(f"Image not found for ID: {image_id}")
            abort(404)
        
        except Exception as e:
            log.error(f"Failed to stream image {image_id}: {e}")
            abort(500)


# ---------------
# GLOBAL INSTANCE 
# ---------------
_media_service = MediaService()

# Public API functions
def get_media_json():
    return _media_service.get_media_json()

def stream_image(image_id: str):
    return _media_service.stream_image(image_id)