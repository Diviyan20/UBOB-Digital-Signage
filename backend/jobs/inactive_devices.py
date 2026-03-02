import logging
from datetime import datetime, timedelta, timezone

from models.active_outlets import mark_device_offline, search_online_devices

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def check_for_inactive_devices():
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=5)
    
    try:
        devices = search_online_devices()
        for outlet_id, last_seen in devices:
            if not last_seen:
                continue
            
            if last_seen < threshold:
                mark_device_offline(outlet_id)
                log.info(f"Device {outlet_id} marked offline")
    except Exception as e:
        log.info(f"Inactive Device job failed: {e}")

if __name__ == "__main__":
    check_for_inactive_devices()