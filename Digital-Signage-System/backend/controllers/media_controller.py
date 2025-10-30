import os
import requests
import base64
import hashlib
from dotenv import load_dotenv

load_dotenv()

# --- ENV ---
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

# --- PATH SETUP ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "static", "media")

# ✅ Auto-create the folder if it doesn't exist
os.makedirs(MEDIA_DIR, exist_ok=True)

# --- GLOBAL CACHE ---
current_index = 0
media_cache = []
cache_loaded = False
carousel_active = False


# ----------------------------------------------------------
# 🔹 Save image if new (no duplicates)
# ----------------------------------------------------------
def save_image_if_new(base64_data):
    try:
        base64_data = base64_data.split(",")[-1]
        image_bytes = base64.b64decode(base64_data)
        img_hash = hashlib.md5(image_bytes).hexdigest()
        filename = f"{img_hash}.jpg"
        path = os.path.join(MEDIA_DIR, filename)

        # Skip writing if already exists
        if os.path.exists(path):
            return f"/static/media/{filename}"

        with open(path, "wb") as f:
            f.write(image_bytes)

        return f"/static/media/{filename}"
    except Exception as e:
        print(f"Failed to save image: {e}")
        return None


# ----------------------------------------------------------
# 🔹 Fetch media from Odoo
# ----------------------------------------------------------
def get_media_json():
    global media_cache, cache_loaded
    try:
        if cache_loaded and media_cache:
            print("✅ Returning cached media list")
            return media_cache

        print("Fetching promotion media from Odoo...")
        response = requests.get(f"{BASE_URL}/api/get/news", headers=HEADERS, timeout=20)
        response.raise_for_status()
        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API error: {data.get('message')}")

        media_items = []
        for block in data.get("data", []):
            for item in block.get("promotion", []):
                raw_img = (item.get("image") or "").replace("\n", "").replace(" ", "").replace("\r", "").strip()
                if not raw_img:
                    continue

                image_url = save_image_if_new(raw_img)
                if not image_url:
                    continue

                media_items.append({
                    "name": item.get("name"),
                    "description": item.get("description"),
                    "date_start": item.get("date_start"),
                    "date_end": item.get("date_end"),
                    "image": image_url,
                })

        # Add already existing files (in case no new ones)
        for file in os.listdir(MEDIA_DIR):
            if file.endswith(".jpg"):
                url = f"/static/media/{file}"
                if not any(i["image"] == url for i in media_items):
                    media_items.append({"image": url})
        
        media_cache = media_items
        cache_loaded = True
        print(f"✅ {len(media_items)} media items available.")
        return media_cache

    except Exception as e:
        print(f"Error fetching media: {e}")
        return media_cache or []
