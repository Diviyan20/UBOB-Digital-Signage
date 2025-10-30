import os
import requests
import base64
import hashlib
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}

# --- PATH SETUP ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTLET_DIR = os.path.join(BASE_DIR, "static", "outlets")
os.makedirs(OUTLET_DIR, exist_ok=True)


# ----------------------------------------------------------
# 🔹 Save image if new
# ----------------------------------------------------------
def save_image_if_new(base64_data):
    try:
        base64_data = base64_data.split(",")[-1]
        image_bytes = base64.b64decode(base64_data)
        img_hash = hashlib.md5(image_bytes).hexdigest()
        filename = f"{img_hash}.jpg"
        path = os.path.join(OUTLET_DIR, filename)

        if os.path.exists(path):
            return f"/static/outlets/{filename}"

        with open(path, "wb") as f:
            f.write(image_bytes)

        return f"/static/outlets/{filename}"
    except Exception as e:
        print(f"Failed to save outlet image: {e}")
        return None


# ----------------------------------------------------------
# 🔹 Fetch outlet list
# ----------------------------------------------------------
def fetch_outlets_df() -> pd.DataFrame | None:
    try:
        print("Fetching outlets from Odoo...")
        response = requests.post(f"{BASE_URL}/api/get/outlet/regions", headers=HEADERS, json={"ids": []}, timeout=15)
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
                session_id = session[0] if isinstance(session, list) and len(session) > 0 else None
                session_code = session[1] if isinstance(session, list) and len(session) > 1 else None

                outlets.append({
                    "region_id": region_id,
                    "region_name": region_name,
                    "outlet_id": str(outlet.get("id")),
                    "outlet_name": outlet.get("name"),
                    "session_id": session_id,
                    "session_code": session_code,
                    "is_open": outlet.get("is_open"),
                    "merchant_id": outlet.get("entity_merchant_id"),
                })

        df_outlets = pd.DataFrame(outlets)
        print(f"✅ Retrieved {len(df_outlets)} outlets successfully.")
        return df_outlets

    except requests.exceptions.Timeout:
        print("Timeout while connecting to Odoo API.")
        return None


def get_outlets_json() -> list[dict]:
    df = fetch_outlets_df()
    if df is None or df.empty:
        return []
    return df.to_dict(orient="records")


# ----------------------------------------------------------
# 🔹 Fetch outlet images
# ----------------------------------------------------------
def get_outlet_images():
    try:
        print("Fetching outlet images from Odoo...")
        response = requests.post(f"{BASE_URL}/api/order/session", headers=HEADERS, json={"ids": []}, timeout=20)
        response.raise_for_status()
        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API error: {data.get('message')}")

        outlet_images = []
        for item in data.get("data", []):
            raw_img = (item.get("image") or "").replace("\n", "").replace(" ", "").replace("\r", "").strip()
            if not raw_img:
                continue

            image_url = save_image_if_new(raw_img)
            if image_url:
                outlet_images.append({"image": image_url})

        # Include existing files from the directory
        for file in os.listdir(OUTLET_DIR):
            if file.endswith(".jpg"):
                url = f"/static/outlets/{file}"
                if not any(i["image"] == url for i in outlet_images):
                    outlet_images.append({"image": url})

        print(f"✅ {len(outlet_images)} outlet images available.")
        return outlet_images

    except Exception as e:
        print(f"Error fetching outlet images: {e}")
        return []
