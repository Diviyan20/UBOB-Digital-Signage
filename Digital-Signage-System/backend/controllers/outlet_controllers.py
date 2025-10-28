import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")

HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}



def fetch_outlets_df() -> pd.DataFrame | None:
    try:
        print("Fetching outlets from Odoo...")
        response = requests.post(f"{BASE_URL}/api/get/outlet/regions", headers=HEADERS, json={"ids": []}, timeout=15)
        print(f"📡 Odoo Response Status: {response.status_code}")

        data = response.json()
        print("📡 Odoo Raw Response:", data)

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
                    "outlet_id": str(outlet.get("id")),  # stringify once here
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
    """
    - Helper function to return the outlets in JSON format instead of a DataFrame.
    - Perfect for returning in Flask API.
    """
    df = fetch_outlets_df()
    if df is None or df.empty:
        return []
    return df.to_dict(orient="records")

def get_outlet_images():
    try:
        print("Fetching Outlet Images from Odoo....")
        response = requests.post(f"{BASE_URL}/api/order/session", headers=HEADERS, json={"ids": []}, timeout=15)
        response.raise_for_status()

        data = response.json()

        if not data.get("status", False):
            raise ValueError(f"Odoo API returned error: {data.get('message')}")
        
        outlet_images = []
        for item in data.get("data",[]):
            raw_img = item.get("image","") or ""
            
            #Clean and normalize
            cleaned_img = (
                raw_img.replace("\n", "")
                    .replace(" ", "")
                    .replace("\r", "")
                    .strip()
            )

            #Ensure it ha the prefix
            if cleaned_img and not cleaned_img.startswith("data:image"):
                cleaned_img = f"data:image/jpeg;base64,{cleaned_img}"

                outlet_images.append({
                    "image": cleaned_img,
                })

        return outlet_images
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP Error: {http_err}")
        print(f"Response Text: {response.text[:300]}")
    
    except Exception as e:
        print(f"Unexpected Error: {e}")