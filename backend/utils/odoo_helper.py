import os

import requests

BASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

def fetch_odoo_promotions():
    """
    Fetch promotion images from Odoo API
    """
    response = requests.get(
        f"{BASE_URL}/api/get/news",
        headers=HEADERS,
        timeout=20
    )
    
    response.raise_for_status()
    data = response.json()
    
    promotions = []
    
    for block in data.get("data", []):
        
        for promo in block.get("promotion", []):
            
            promotions.append({
                "type": "image",
                "name": promo.get("name"),
                "description": promo.get("description"),
                "image": promo.get("image")
            })
    
    return promotions