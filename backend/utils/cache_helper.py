import json
from pathlib import Path

CACHE_DIR = Path("/tmp/digital-signage-cache")

CACHE_DIR.mkdir(
    parents=True,
    exist_ok=True
)

def save_cache(filename: str, data: dict):
    """
    Save JSON cache file.
    """
    
    path = CACHE_DIR / filename
    path.write_text(
        json.dumps(data, indent=2)
    )
    
def load_cache(filename: str):
    """
    Load JSON cache file
    """
    
    path = CACHE_DIR / filename
    
    if not path.exists():
        return None
    
    return json.loads(path.read_text())