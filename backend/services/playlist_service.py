from models.active_outlets import get_outlet_information
from utils.s3_helper import get_s3_playlist_media, get_video_media


class PlaylistService:
    """
    Handles media playlist logic
    
    Responsibilities:
        - Find outlet information
        - Determine outlet region
        - Build S3 Folder path
        - Fetch media from S3
    """
    
    # ======================
    # OUTLET REGION HELPER
    # ======================
    def get_outlet_region(self, outlet_id:str):
        """
        Gets outlet region from database
        """
        outlet = get_outlet_information(outlet_id)
        
        if not outlet:
            raise Exception("Outlet Not Found")

        region = outlet.get("outlet_location")
        
        if not region:
            raise Exception("Outlet Region Not Configured")
        
        return region

    # ======================
    # MIXED MEDIA PLAYLIST
    # ======================
    def get_playlist(self, outlet_id:str, batch_number:int):
        """
            Used for mixed media Screen
            
            Example: Selangor/Batch 2/
        """
        # Step 1: Get outlet region
        region = self.get_outlet_region(outlet_id)
        
        # Step 2: Build S3 folder path
        prefix = f"{region}/Batch {batch_number}"
        
        # Step 3: Fetch mixed media
        media = get_s3_playlist_media(prefix)
        
        return media

    # ==============================
    # SIGNAGE SCREEN VIDEO PLAYLIST
    # ==============================
    def get_signage_videos(self):
        """
            - Used for signage screen
            - Always points to the Digital-Signage Folder
        """        
        prefix = "Digital Signage/"
        
        # Step 3: Fetch only the videos
        videos = get_video_media(prefix)
        
        return videos