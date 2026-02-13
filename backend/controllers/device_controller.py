import logging
import os
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import find_dotenv, load_dotenv
from flask import jsonify
from models.db_connection import get_db_connection

load_dotenv(find_dotenv())

ODOO_DATABASE_URL = os.getenv("ODOO_DATABASE_URL")
ODOO_API_TOKEN = os.getenv("ODOO_API_TOKEN")


# ==========================
# HELPERS - ODOO HEADERS
# ==========================

def odoo_headers():
    """ Generate headers for Odoo API requests with authentication token. """
    return{
        "Authorization": f"Bearer {ODOO_API_TOKEN}",
        "Content-Type": "application/json"
    }

# ================
# LOGGING SETUP
# ================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# =====================
# OUTLET VALIDATION
# =====================

def validate_outlet(outlet_id: str) -> dict:
    """
        Validate an outlet that exists in the Odoo Database.
        This function ONLY checks if the outlet is valid and doest NOT register devices.
        Returns outlet info if valid, error if not.
    """
    try:
        log.info(f"📡 Validating outlet {outlet_id} from Odoo...")
        
         # Fetch all the Outlets from Odoo
        response = requests.post(
            f"{ODOO_DATABASE_URL}/api/get/outlet/regions",
            json={"ids": []},
            headers=odoo_headers(),
            timeout=15
        )
        response.raise_for_status()

        data = response.json()
        if not data.get("status"):
            return {"is_valid": False ,"error": "Odoo API error", "details": data.get("message", "Unknown error")}


        # Find the matching outlet
        for region in data.get("data", []):
            for outlet in region.get("pos_shops", []):
                if str(outlet.get("id")) == str(outlet_id):
                    return{
                        "is_valid": True,
                        "outlet_id": str(outlet.get("id")),
                        "outlet_name": outlet.get("name"),
                        "region_name": region.get("outlet_region_name")
                    }
        
        return {"is_valid": False, "error": "Outlet not found"}
    
    except Exception as e:
        log.error(f"Failed to validate outlet {outlet_id}: {e}")
        return {"error": "Connection failed", "details": str(e)}


# =====================
# GET OUTLET INFO
# =====================

def get_device_info(outlet_id: str) -> dict:
    """
    Get outlet information from Database.
    Returns outlet data, or None if not found.
    """
    try:
        with get_db_connection() as (conn,cur):
            query = """
                SELECT * FROM active_outlets WHERE outlet_id = %s
            """
            cur.execute(query, [outlet_id])
            
            outlet = cur.fetchone()

            if not outlet:
                return None
            
            return{
                "outlet_id": outlet[0],
                "outlet_name": outlet[1],
                "outlet_status": outlet[2],
                "outlet_location": outlet[3],
                "active": outlet[4],
                "last_seen": outlet[5],
                "order_api_url": outlet[6],
                "order_api_key": outlet[7]
            }
    
    except Exception as e:
        log.error(f"Failed to get outlet info for {outlet_id}: {e}")
        return None


# ===================
# REGISTER OUTLET
# ===================

def register_device(outlet_id:str, outlet_name:str, region_name:str, 
                    order_api_url:str, order_api_key:str) -> dict:
    """
    Register outlet with all info in one step.
    Creates a new field for the outlet, or updates existing one.
    """
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)
            
            # Check if outlet exists
            existing= get_device_info(outlet_id)

            if existing:
                log.info(f"Outlet already registered: {outlet_id}")

                # Update Existing outlet
                update_query = """
                    UPDATE active_outlets 
                    SET outlet_name = %s,
                        outlet_location = %s,
                        outlet_status = 'online',
                        last_seen = %s,
                        order_api_url = %s,
                        order_api_key = %s
                    WHERE outlet_id = %s
                    RETURNING *
                """
                cur.execute(update_query, (outlet_name, region_name, now, order_api_url, order_api_key, outlet_id))
            
            else:
                # Insert new outlet
                query = """
                    INSERT INTO active_outlets 
                    (outlet_id, outlet_name, outlet_status, outlet_location, 
                     active, last_seen, order_api_url, order_api_key)
                    VALUES (%s, %s, 'online', %s, %s, %s, %s, %s)
                    RETURNING *
                """
                cur.execute(query, (outlet_id, outlet_name, region_name, now, now, order_api_url, order_api_key))

                outlet = cur.fetchone()
                conn.commit()
                
            return{
                "success": True,
                "outlet_id": outlet[0],
                "outlet_name": outlet[1],
                "outlet_status": outlet[2],
                "outlet_location": outlet[3],
                "order_api_url": outlet[6],
                "order_api_key": outlet[7]
            }
                 
    except Exception as e:
        log.error(f"Failed to register outlet {outlet_id}: {e}")
        return {"success": False, "error": str(e)}

# ============================
# PARSE ORDER TRACKING URL
# ============================
def parse_order_tracking_url(full_url: str) -> tuple:
    """
    Split the URL into Base and Access Token
    
    Example input: https://unclebob-mobile-app-integration-xxxxxxx.dev.odoo.com/pos-order-tracking/?access_token=xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    
    Returns: ("https://odoo.com/pos-order-tracking", "abc-123")
    """
    try:
        parsed = urlparse(full_url)

        # Get Base URl without query params
        base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"

        # Get Access Token from query sting
        query_params = parse_qs(parsed.query)
        access_token = query_params.get("access_token", [None])[0]

        if not access_token:
            log.error("No access token found in URL!")
            return None, None
        
        return base_url, access_token
    
    except Exception as e:
        log.error(f"Error Parsing URL: {e}")
        return None, None

# ==========================
# HEARTBEAT MONITORING
# ==========================

def update_heartbeat(outlet_id: str, status: str):
    """
    Update heartbeat status.
    """
    if not outlet_id:
        return jsonify({"error": "Missing Outlet ID!"}), 400
    
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)

            # Make sure status is valid
            if status.lower() not in ("online", "offline"):
                status = "online"

            update_query = """
                UPDATE active_outlets 
                SET outlet_status = %s, last_seen = %s
                WHERE outlet_id = %s
                RETURNING outlet_id
            """
            cur.execute(update_query, (status.lower(), now, outlet_id))
            result = cur.fetchone()
            conn.commit()

            if result:
                return jsonify({
                    "message": "Heartbeat updated",
                    "outlet_id": outlet_id,
                    "status": status
                }), 200
            else:
                return jsonify({"error": "Outlet not found"}), 404
    
    except Exception as e:
        log.error(f"Error Updating Heartbeat for Outlet {outlet_id}: {e}")
        return jsonify({"error": str(e)}), 500


# ========================
# VALIDATE FOR MEDIA
# ========================
def validate_device_for_media(outlet_id: str) -> dict:
    """
    Check if outlet can access media screen.
    Returns what to show: media, config form, or error
    """
    # 1. Validate outlet exists in Odoo
    odoo_outlet= validate_outlet(outlet_id)
    if not odoo_outlet.get("is_valid"):
        return{
            "can_access_media": False,
            "reason": "invalid_outlet",
            "error": odoo_outlet.get("error")
        }

    # 2. Check if outlet is registered
    db_outlet= get_device_info(outlet_id)

    if not db_outlet:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": db_outlet
        }
    
    # 3. Check outlet has credentials
    if not db_outlet["order_api_url"] or not db_outlet["order_api_key"]:
        return {
            "can_access_media": False,
            "reason": "missing_credentials",
            "outlet_info": odoo_outlet
        }
    
    # Everything Checks Out!
    return{
        "can_access_media": True,
        "outlet_info": odoo_outlet,
        "device_info": db_outlet
    }
