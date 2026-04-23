import logging
import os
from ast import List

import requests

# -----------------
# CONFIG
# -----------------
ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_HOST = os.getenv("PUBLIC_HOST_URL", "http://10.0.2.2:5000")

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


# HEADERS
def odoo_headers():
    return{
        "Authorization":f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }

# ----------------------------------------
# MAIN FUNCTION - Single Source of Truth
# ----------------------------------------
def fetch_all_outlet_data() -> List:
    """
    Main function which fetches all the outlet data from Odoo.
    Returns complete information of all outlets
    """
    try:
        log.info("Fetching Outlet data from Odoo....")
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids":[]},
            headers=odoo_headers(),
            timeout=15
        )
        
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get("status"):
            log.error("Odoo API Error.")
            return[]
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
            
            log.info(f"Fetched {len(outlets)} Outlets from Odoo.")
            return outlets

    except Exception as e:
        log.error(f"Failed to fetch outlets from Odoo: {e}")
        return []