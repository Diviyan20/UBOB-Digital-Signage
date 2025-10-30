import os
import time
import threading
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
media_items_cache = []
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
    try:
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

        print(f"✅ {len(media_items)} media items available.")
        return media_items

    except Exception as e:
        print(f"Error fetching media: {e}")
        return []


# ----------------------------------------------------------
# 🔹 Carousel logic
# ----------------------------------------------------------
def start_image_carousel(media_list: list, interval: int = 5):
    global media_items_cache, current_index, carousel_active
    media_items_cache = media_list
    current_index = 0
    carousel_active = True

    def loop():
        global current_index
        while carousel_active and media_items_cache:
            current_item = media_items_cache[current_index]
            print(f"🖼️ Showing image index {current_index}: {current_item.get('name', 'Unnamed')}")
            time.sleep(interval)
            current_index = (current_index + 1) % len(media_items_cache)

    threading.Thread(target=loop, daemon=True).start()


def stop_media_carousel():
    global carousel_active
    carousel_active = False
    print("Carousel stopped")


def get_current_media():
    global current_index, media_items_cache
    if not media_items_cache:
        return None
    return media_items_cache[current_index]
