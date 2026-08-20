from models.media_library import sync_media_library, get_all_media, generate_preview_url

def refresh_media_library():
    """
    Synchronize the media_library table with S3,
    then return the current media list.
    """
    sync_media_library()
    
    return get_all_media()

def fetch_media_preview_url(media_id: str):
    """Generates a presigned url to preview media"""
    return generate_preview_url(media_id)