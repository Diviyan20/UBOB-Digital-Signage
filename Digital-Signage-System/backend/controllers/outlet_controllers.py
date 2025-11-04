import os
import requests
import io, base64
from dotenv import load_dotenv
from flask import send_file, abort, jsonify
from PIL import Image as PILImage

load_dotenv()

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

payload = {
    "ids": [],
}

outlet_cache = []
cache_loaded = False


# -----------------
# Fetch list of all outlets
# -----------------
def fetch_outlets():
    try:
        print("Fetching outlets from Odoo...")
        response = requests.post(
            f"{BASE_URL}/api/get/outlet/regions",
            headers=HEADERS,
            json=payload,
            timeout=15,
        )
        print(f"📡 Odoo Response Status: {response.status_code}")
        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API returned error: {data.get('message')}")

        outlets = []
        for region in data.get("data", []):
            region_name = region.get("outlet_region_name")
            region_id = region.get("outlet_region_id")

            for outlet in region.get("pos_shops", []):
                session = outlet.get("current_session_id", [])
                session_id = (
                    session[0]
                    if isinstance(session, list) and len(session) > 0
                    else None
                )
                session_code = (
                    session[1]
                    if isinstance(session, list) and len(session) > 1
                    else None
                )

                outlets.append(
                    {
                        "region_id": region_id,
                        "region_name": region_name,
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": outlet.get("name"),
                        "session_id": session_id,
                        "session_code": session_code,
                        "is_open": outlet.get("is_open"),
                        "merchant_id": outlet.get("entity_merchant_id"),
                    }
                )

        return outlets

    except requests.exceptions.Timeout:
        print("Timeout while connecting to Odoo API.")
        return None


def get_outlets_json():
    outlets = fetch_outlets()
    if outlets is None or not outlets:
        return []
    return outlets


# -------------------
# Fetch outlet images
# -------------------
def get_outlet_images():
    global outlet_cache, cache_loaded
    try:
        if cache_loaded and len(outlet_cache) > 0:
            print("Using cached outlet images")
            return outlet_cache
        
        print("Fetching outlet images from Odoo...")
        
        response = requests.post(
            f"{BASE_URL}/api/order/session",
            headers=HEADERS,
            json={"ids": []},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API error: {data.get('message')}")

        outlet_images = []
        for item in data.get("data", []):
            img_data = (
                (item.get("image") or "")
                .replace("\n", "")
                .replace(" ", "")
                .replace("\r", "")
                .strip()
            )
            outlet_name = item.get("name", "").strip() or "Unknown"

            if not img_data:
                continue

            image_id = str(abs(hash(img_data)))[:10]

            HOST_URL = os.getenv("PUBLIC_HOST_URL", "http://localhost:5000")
            image_url = f"{HOST_URL}/outlet_image/{image_id}"

            outlet_images.append(
                {
                    "id": image_id,
                    "image": image_url,
                    "raw_img": img_data,
                    "name": outlet_name,
                }
            )

        outlet_cache = outlet_images
        cache_loaded = True
        print(f"📸 Total outlet images fetched: {len(outlet_images)}")
        return outlet_cache

    except Exception as e:
        print(f"Error fetching outlet images: {e}")
        return outlet_cache or []


def stream_outlet_image(image_id: str):
    try:
        match = next((o for o in outlet_cache if o["id"] == image_id), None)

        if not match:
            print(f"Outlet Image not found for ID: {image_id}")
            abort(404)

        raw_img = match["raw_img"]
        if not raw_img.startswith("data:image"):
            raw_img = "data:image/jpeg;base64," + raw_img

        # Extract base64 data
        base64_data = raw_img.split(",")[1]
        img_bytes = base64.b64decode(base64_data)

        # Downscale to save memory
        img = PILImage.open(io.BytesIO(img_bytes))
        img.thumbnail((1280, 720))
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        output.seek(0)

        return send_file(output, mimetype="image/jpeg")

    except Exception as e:
        print(f"Failed to stream image {image_id}: {e}")
        abort(500)


# ------------------------------
# Fetch outlet images with names
# ------------------------------
def get_outlet_images_with_names():
    try:
        print("Fetching Outlet Images + Names .......")

        # Fetch both datasets
        outlets = get_outlets_json()
        outlet_images = get_outlet_images()

        print(f"📊 Total outlets fetched: {len(outlets)}")
        print(f"🖼️  Total outlet images fetched: {len(outlet_images)}")

        if not outlets or not outlet_images:
            return jsonify({"status": False, "message": "No outlets or images found"}), 404

        # Map outlet name -> outlet info (case insensitive)
        outlet_map = {o["outlet_name"].strip().lower(): o for o in outlets if o.get("outlet_name")}

        combined = []
        matched = 0
        unmatched = 0

        for img in outlet_images:
            img_name = img.get("name", "").strip().lower()
            outlet_match = outlet_map.get(img_name)

            if outlet_match:
                matched += 1
                combined.append({
                    "id": img["id"],
                    "image": img["image"],
                    "outlet_id": outlet_match["outlet_id"],
                    "outlet_name": outlet_match["outlet_name"],
                })
                print(f"✅ Matched image '{img.get('name')}' → {outlet_match['outlet_name']}")
            else:
                unmatched += 1
                combined.append({
                    "id": img["id"],
                    "image": img["image"],
                    "outlet_id": "",
                    "outlet_name": img.get("name", "Unknown Outlet"),
                })
                print(f"⚠️ No match for image name '{img.get('name')}'")

        
        print(f"🟢 Matched {matched} outlets with images")
        print(f"🟠 Unmatched images: {unmatched}")

        return jsonify({"status": True, "media": combined}), 200

    except Exception as e:
        print(f"Error combining outlet images and names: {e}")
        return jsonify({"status": False, "message": str(e)}), 500
