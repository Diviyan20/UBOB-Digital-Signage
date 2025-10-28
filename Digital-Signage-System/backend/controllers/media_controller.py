import os
import time
import threading
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("ODOO_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


# Global index tracker
current_index = 0
media_items_cache = []
carousel_active = False


# Fetches all media/news from Odoo and returns a formatted DataFrame.
def fetch_media_df() -> pd.DataFrame | None:
    try:
        print("Fetching media/news from Odoo...")
        response = requests.get(f"{BASE_URL}/api/get/news", headers=HEADERS)
        response.raise_for_status()

        data = response.json()
        print(f"Odoo Raw Response: {data}")

        if not data.get("status", False):
            raise ValueError(f"Odoo API returned error: {data.get('message')}")

        media_items = []
        for block in data.get("data", []):  
            promotions = block.get("promotion", [])
            for item in promotions:
                raw_img = item.get("image", "") or ""
                # Clean and normalize
                cleaned_img = (
                    raw_img.replace("\n", "")
                    .replace(" ", "")
                    .replace("\r", "")
                    .strip()
                )
                # Ensure it has the prefix
                if cleaned_img and not cleaned_img.startswith("data:image"):
                    cleaned_img = f"data:image/jpeg;base64,{cleaned_img}"

                media_items.append({
                    "name": item.get("name"),
                    "date_start": item.get("date_start"),
                    "date_end": item.get("date_end"),
                    "description": item.get("description"),
                    "image": cleaned_img,
                })

        df_media = pd.DataFrame(media_items)
        print(f"✅ Retrieved {len(df_media)} media items successfully!")
        return df_media

    except Exception as e:
        print(f"Error fetching media: {e}")
        return None


"""
    - Helper function to return the news in JSON format instead of a DataFrame.
    - Perfect for returning in Flask API.
    """
def get_media_json() -> list[dict]:
    df = fetch_media_df()
    if df is None or df.empty:
        return []
    return df.to_dict(orient="records")

# Image Carousel Logic
def start_image_carousel(media_list: list, interval: int = 5):
    global media_items_cache, current_index, carousel_active
    media_items_cache = media_list
    current_index = 0
    carousel_active = True

    def loop():
        global current_index
        while carousel_active and media_items_cache:
            current_item = media_items_cache[current_index]
            print(f"🖼️ Showing image index {current_index}: {current_item['name']}")
            time.sleep(interval)
            current_index = (current_index + 1) % len(media_items_cache)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()


# Stops the carousel sequence
def stop_media_carousel():
    global carousel_active
    carousel_active = False
    print("Carousel stopped")


# Return currently active media item
def get_current_media():
    global current_index, media_items_cache
    
    if not media_items_cache:
        return None
    
    return media_items_cache[current_index]
