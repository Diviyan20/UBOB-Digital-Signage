import logging
import threading
import time

from controllers.media_controller import fetch_and_cache_media

log = logging.getLogger(__name__)

REFRESH_INTERVAL = 300 # 5 Minutes

def media_refresh_loop():
    while True:
        log.info("Running scheduled media refresh...")
        fetch_and_cache_media()
        time.sleep(REFRESH_INTERVAL)
    
def start_media_scheduler():
    thread = threading.Thread(
        target=media_refresh_loop,
        daemon=True
    )
    thread.start()