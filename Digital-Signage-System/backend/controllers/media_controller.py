import os
import io,base64
import requests
from dotenv import load_dotenv
from flask import send_file, abort
from PIL import Image as PILImage

load_dotenv()

# --- ENV ---
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

media_cache = []
cache_loaded = False


# ----------------------------------------------------------
# Fetch media from Odoo
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
                img_data = (item.get("image") or "").replace("\n", "").replace(" ", "").replace("\r", "").strip()
                if not img_data:
                    continue

                
                image_id = str(abs(hash(img_data)))[:10]  # Simple unique identifier
                
                HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")
                image_url = f"{HOST_URL}/image/{image_id}"


                media_items.append({
                    "id": image_id,
                    "name": item.get("name"),
                    "description": item.get("description"),
                    "date_start": item.get("date_start"),
                    "date_end": item.get("date_end"),
                    "image": image_url,
                    "raw_img": img_data
                })

        media_cache = media_items
        cache_loaded = True
        print(f"✅ {len(media_items)} media items available.")
        return media_cache

    except Exception as e:
        print(f"Error fetching media: {e}")
        return media_cache or []


def stream_image(image_id: str):
    try:
        match = next((m for m in media_cache if m["id"] == image_id), None)

        if not match:
            print(f"Image not found for ID: {image_id}")
            abort(404)

        raw_img = match["raw_img"]
        if not raw_img.startswith("data:image"):
            raw_img = "data:image/jpeg;base64," + raw_img

        # Extract base64 data
        base64_data = raw_img.split(",")[1]
        img_bytes = base64.b64decode(base64_data)

        # Downscale to save memory
        img = PILImage.open(io.BytesIO(img_bytes))
        img.thumbnail((1280, 720))  # maintain aspect ratio
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        output.seek(0)
        
        return send_file(io.BytesIO(img_bytes), mimetype="image/jpeg")
    
    except Exception as e:
        print(f"Failed to stream image {image_id}: {e}")
        abort(500)
