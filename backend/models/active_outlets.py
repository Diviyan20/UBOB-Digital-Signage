import logging
import psycopg2
import os
import boto3
import json

from datetime import datetime, timezone
from dotenv import load_dotenv
from contextlib import contextmanager

load_dotenv()

# ENVIRONMENT VARIABLES
OUTLET_DATABASE = os.getenv("OUTLET_DATABASE")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOSTNAME = os.getenv("DB_HOSTNAME")
DB_PORT = os.getenv("DB_PORT")

# ================
# LOGGING SETUP
# ================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

def get_db_credentials():
    secret_arn = os.getenv("DB_SECRET_ARN")
    
    client = boto3.client("secretsmanager")
    
    response = client.get_secret_value(SecretId=secret_arn)
    secret = json.loads(response["SecretString"])
    
    return{
        "username":secret["username"],
        "password:":secret["password"]
    }

@contextmanager
def get_db_connection():
    """Connect to the database with Environment Variables using psycopg2"""
    creds = get_db_credentials()
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(
            database = OUTLET_DATABASE,
            user = creds["username"],
            password = creds["password"],
            host = DB_HOSTNAME,
            port = DB_PORT
        )
        
        cur = conn.cursor()
    
        yield conn, cur
    
    # Error handling for Connection Error
    except psycopg2.Error as e:
        log.error(f"Database connection Error: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

def get_outlet_info(outlet_id: str) -> dict:
    """
    Get outlet information from the Database based on 'outlet_id'.
    Returns None if no ID is found.
    """
    try:
        with get_db_connection() as (conn, cur):
            query = "SELECT * FROM active_outlets WHERE outlet_id = %s"     # Query to select all fields based on outlet_id
            
            cur.execute(query, [outlet_id])     # Executes query with outlet_id as the parameter
            
            outlet = cur.fetchone()
            
            # If outlet does not exist
            if not outlet:
                return None
            else:
                return{
                "outlet_id": outlet[0],
                "outlet_name": outlet[1],
                "outlet_status": outlet[2],
                "outlet_location": outlet[3],
                "active": outlet[4],
                "last_seen": outlet[5],
                "order_api_url": outlet[6],
                "order_api_key": outlet[7],
                "tier": outlet[8]
            }
    
    except Exception as e:
        log.error(f"Database Error: {e}")

def get_all_outlets() -> dict:
    try:
        with get_db_connection() as (conn, cur):
            query = "SELECT * FROM active_outlets ORDER BY outlet_id ASC;"
        
            cur.execute(query)
            
            outlets = cur.fetchall()
            
            if not outlets:
                return []
            
            return[{
                "outlet_id": outlet[0],
                "outlet_name": outlet[1],
                "outlet_status": outlet[2],
                "outlet_location": outlet[3],
                "active": outlet[4],
                "last_seen": outlet[5],
                "order_api_url": outlet[6],
                "order_api_key": outlet[7],
                "tier": outlet[8],
                "uuid": outlet[9]
            }
                   for outlet in outlets
            ]
        
    except Exception as e:
        raise ValueError(f"Error fetching outlets: {e}")
        
def update_heartbeat_status(outlet_id: str, status: str):
    """
    Update the heartbeat status of an active outlet.
    """
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)
            
            # Make sure status is valid
            if status.lower() not in ("online", "offline"):
                status = "online"
            
            query = """
                    UPDATE active_outlets 
                    SET outlet_status = %s, last_seen = %s
                    WHERE outlet_id = %s
                    RETURNING outlet_id
                """
            cur.execute(query, (status.lower(), now, outlet_id))
            result = cur.fetchone()
            conn.commit()
            
            if result:
                print(f"✅ Heartbeat updated for outlet {outlet_id}: {status}")
                return True
            else:
                print(f"❌ Outlet {outlet_id} not found in database")
                return False
    
    except Exception as e:
        raise ValueError(f"Error Updating Heartbeat for Outlet {outlet_id}: {e}")    

def search_online_devices():
    with get_db_connection() as (conn, cur):
        query = """
            SELECT outlet_id, last_seen
            FROM active_outlets
            WHERE outlet_status = 'online'
        """
        cur.execute(query)
        return cur.fetchall()

def mark_device_offline(outlet_id):
    with get_db_connection() as (conn, cur):
        query = """
                UPDATE active_outlets
                SET outlet_status = 'offline'
                WHERE outlet_id = %s
            """
        cur.execute(query,(outlet_id,))
        conn.commit()

def register_outlet(outlet_id:str, outlet_name:str, region_name:str, 
                    order_api_url:str, order_api_key:str, tier: str):
    """
    Register a new outlet into the Database.
    
    Utilizes the 'get_db_connection' function to connect to the database.
    """
    try:
        with get_db_connection() as (conn, cur):
            now = datetime.now(timezone.utc)
            
            # Check if outlet exists (use the 'get_outlet_info()' function)
            existing = get_outlet_info(outlet_id)
            
            if existing:
                return{
                    "success": False,
                    "error": "Outlet already exists"
                }
            
            # Register the outlet if it does not exist
            query = """
                    INSERT INTO active_outlets 
                    (outlet_id, outlet_name, outlet_status, outlet_location, 
                     active, last_seen, order_api_url, order_api_key, tier)
                    VALUES (%s, %s, 'offline', %s, %s, %s, %s, %s, %s)
                    RETURNING *
                """
            cur.execute(query, (outlet_id, outlet_name, region_name, now, now, order_api_url, order_api_key, tier))
                
            outlet = cur.fetchone()
            conn.commit()
                
            return{
                "success": True,
                "outlet_id": outlet[0],
                "outlet_name": outlet[1],
                "outlet_status": outlet[2],
                "outlet_location": outlet[3],
                "order_api_url": outlet[6],
                "order_api_key": outlet[7],
                "tier": outlet[8]
            }
    
    except Exception as e:
        log.error(f"Failed to register outlet: {e}")
        return {"success": False, "error":str(e)}