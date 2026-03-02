import os
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg2
from dotenv import find_dotenv, load_dotenv

find_dotenv()
load_dotenv()
# ENVIRONMET VARIABLES
DB_NAME = os.getenv("DB_NAME")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOSTNAME = os.getenv("DB_HOSTNAME")
DB_PORT = os.getenv("DB_PORT")

@contextmanager
def get_db_connection():
    """
    - Context manager for database connection
    - Automatically handles connection cleanup
    """
    conn = None
    cur = None
    try:

        conn = psycopg2.connect(
            database = DB_NAME,
            user = DB_USERNAME,
            password = DB_PASSWORD,
            host = DB_HOSTNAME,
            port = DB_PORT
        )

        cur = conn.cursor()

        # Ensure table exists
        create_script = """
            CREATE TABLE IF NOT EXISTS active_outlets (
                outlet_id VARCHAR(255) PRIMARY KEY,
                outlet_name VARCHAR(255) NOT NULL,
                outlet_status VARCHAR(50) NOT NULL,
                outlet_location VARCHAR(255),
                active TIMESTAMP WITH TIME ZONE,
                last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
                order_api_url TEXT,
                order_api_key TEXT
            )
        """
        cur.execute(create_script)
        conn.commit()

        yield conn, cur

    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

def get_outlet_information(outlet_id: str) -> dict:
    """
    Retrieving REGISTERED outlet information from Database.
    """    
    try:
        with get_db_connection() as (conn,cur):
        
            query = "SELECT * FROM active_outlets WHERE outlet_id = %s"
            
            cur.execute(query, (outlet_id,))
        
            outlet = cur.fetchone()
            
            if not outlet:
                return None
            else:
                return {
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
        raise ValueError(f"Error fetching data from Database : {e}")


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

def test_connection():
    with get_db_connection() as (conn, cur):
        query = "SELECT * FROM active_outlets;"
        cur.execute(query)
        data = cur.fetchall()
        
        for d in data:
            print(d)