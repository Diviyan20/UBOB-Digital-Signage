import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from jobs.inactive_devices import check_for_inactive_devices

log = logging.getLogger(__name__)

_scheduler = None

def start_scheduler():
    global _scheduler
    
    if _scheduler:
        return # Prevent double start (IMPORTANT)
    
    log.info("Starting background scheduler....")
    
    scheduler = BackgroundScheduler(timezone="UTC")
    
    scheduler.add_job(
        check_for_inactive_devices,
        trigger=IntervalTrigger(minutes=5),
        id="inactive_devices_job",
        replace_existing=True,
        max_instances=1,     # prevents overlaps
        coalesce=True,      # skips missed runs
    )
    
    scheduler.start()
    _scheduler = scheduler