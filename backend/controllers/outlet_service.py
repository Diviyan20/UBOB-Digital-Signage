import os
from ast import List
from pathlib import Path

import requests
from flask import jsonify

CACHE_ROOT = Path(os.getenv("CACHE_ROOT", "/tmp/digital-signage-cache"))
CACHE_DIR = CACHE_ROOT / "outlets"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------
# CONFIG
# -----------------
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL")

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

# HEADERS
def odoo_headers():
    return{
        "Authorization":f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }

# ===============================
# FETCH ALL OUTLET INFORMATION
# ===============================
def fetch_all_outlet_data() -> List:
    """
    Main function which fetches all the outlet data from Odoo.
    Returns complete information of all outlets
    """
    try:
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids":[]},
            headers=odoo_headers(),
            timeout=15
        )
        
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get("status"):
            return jsonify({"erro": "Odoo API Error"}), []
        
        else:
            # Extract all outlet data
            outlets = []
            for region in data.get("data",[]):
                region_name = region.get("outlet_region_name")
                
                for outlet in region.get("pos_shops",[]):
                    outlets.append({
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": str(outlet.get("name")),
                        "region_name": region_name,
                        "is_open": outlet.get("is_open",False)
                    })
            return outlets
    except Exception as e:
        return jsonify({"error": str(e)}),[]