import os, io, base64, requests
from dotenv import load_dotenv
from flask import send_file, abort
from PIL import Image as PILImage
from memory_profiler import profile

load_dotenv()

# --- ENV ---
BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

media_cache = {}
cache_loaded = False


# ----------------------------------------------------------
# Fetch media from Odoo
# ----------------------------------------------------------
@profile
def get_media_json():
    global media_cache, cache_loaded
    try:
        if cache_loaded and media_cache:
            print("✅ Returning cached media list")
            return [v["meta"] for v in media_cache.values()]

        print("Fetching promotion media from Odoo...")
        response = requests.get(f"{BASE_URL}/api/get/news", headers=HEADERS, timeout=20)
        response.raise_for_status()
        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API error: {data.get('message')}")

        new_cache = {}

        for block in data.get("data", []):
            for item in block.get("promotion", []):
                img_data = (item.get("image") or "").strip()
                if not img_data:
                    continue

                
                image_id = str(abs(hash(img_data)))[:10]  # Simple unique identifier
                
                HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")
                image_url = f"{HOST_URL}/image/{image_id}"

                # Decode and resize once, store compressed bytes
                if not img_data.startswith("data:image"):
                    img_data = "data:image/jpeg;base64," + img_data

                try:
                    base64_data = img_data.split(",")[1]
                    img_bytes = base64.b64decode(base64_data)
                    with PILImage.open(io.BytesIO(img_bytes)) as img:
                        img.thumbnail((1280, 720))
                        output = io.BytesIO()
                        img.save(output, format="JPEG", quality=85)
                        jpeg_bytes = output.getvalue()
                except Exception as img_err:
                    print(f"⚠️ Failed to process image {item.get('name')}: {img_err}")
                    continue
            
            meta = {
                    "id": image_id,
                    "name": item.get("name"),
                    "description": item.get("description"),
                    "date_start": item.get("date_start"),
                    "date_end": item.get("date_end"),
                    "image": image_url,
                }

            new_cache[image_id] = {
                    "meta": meta,
                    "jpeg_bytes": jpeg_bytes,
                }
        
        media_cache = new_cache
        cache_loaded = True
        print(f"✅ Cached {len(media_cache)} media items.")
        return [v["meta"] for v in media_cache.values()]

    except Exception as e:
        print(f"❌ Error fetching media: {e}")
        return [v["meta"] for v in media_cache.values()]

@profile
def stream_image(image_id: str):
    try:
        entry = media_cache.get(image_id)
        if not entry:
            print(f"⚠️ Image not found for ID: {image_id}")
            abort(404)

        jpeg_bytes = entry.get("jpeg_bytes")
        if not jpeg_bytes:
            abort(404)

        return send_file(
            io.BytesIO(jpeg_bytes),
            mimetype="image/jpeg",
            as_attachment=False,
            download_name=f"{image_id}.jpg",
        )

    except Exception as e:
        print(f"❌ Failed to stream image {image_id}: {e}")
        abort(500)
