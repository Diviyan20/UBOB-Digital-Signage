import logging
from datetime import datetime, timedelta, timezone

from models.db_connection import get_db_connection

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def check_for_inactive_devices():
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=5)
    
    with get_db_connection() as (conn, cur):
        query = """
            SELECT device_id, last_seen
            FROM outlet_devices
            WHERE device_status = 'online'
        """
        cur.execute(query)
        devices = cur.fetchall()
        
        for device_id, last_seen in devices:
            if not last_seen:
                continue
            
            if last_seen < threshold:
                query = """
                    UPDATE outlet_devices
                    SET device_status = 'offline'
                    WHERE device_id = %s
                """
                cur.execute(query, (device_id,))
                log.info(f"Device {device_id} marked offline")
        
        conn.commit()

if __name__ == "__main__":
    check_for_inactive_devices()