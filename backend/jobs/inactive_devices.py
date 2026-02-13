import logging
from datetime import datetime, timedelta, timezone

from models import db_connection

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def check_for_inactive_devices():
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=5)
    
    with db_connection.get_db_connection() as (conn, cur):
        try:
            query = """
            SELECT outlet_id, last_seen
            FROM active_outlets
            WHERE outlet_status = 'online'
        """
            cur.execute(query)
            devices = cur.fetchall()
        
            for device_id, last_seen in devices:
                if not last_seen:
                 continue
            
                if last_seen < threshold:
                    query = """
                    UPDATE active_outlets
                    SET outlet_status = 'offline'
                    WHERE outlet_id = %s
                    """
                    cur.execute(query, (device_id,))
                    log.info(f"Device {device_id} marked offline")
        
            conn.commit()
        
        except Exception as e:
            log.info(f"Inactive Device job failed: {e}")

if __name__ == "__main__":
    check_for_inactive_devices()