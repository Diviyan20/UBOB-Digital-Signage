import gc
import logging
import os

import psutil

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def log_memory_usage():
    gc.collect()
    process = psutil.Process(os.getpid())
    mem_mb = process.memory_info().rss / 1024 / 1024
    log.info(f"Memory usage: {mem_mb:.1f} MB")


if __name__ == "__main__":
    log_memory_usage()
