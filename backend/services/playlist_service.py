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
    def normalize_region(self, region: str) -> str:
        """
        Remove any special characters from string 
        
        Example: Kuala_Lumpur, Kuala Lumpur
        """
        return(region.strip().replace("_", " "))
    
    def get_playlist(self, outlet_id:str, batch_number:int, orientation: str="Landscape"):
        """
            Builds S3 path based on region, batch, and orientation.

            Example: Selangor/Batch 2/Landscape/
        """
        # Step 1: Get outlet region
        region = self.get_outlet_region(outlet_id)
        
        normalized_region = self.normalize_region(region)
        
        # Step 2: Build S3 folder path
        prefix = f"{normalized_region}/Batch {batch_number}/{orientation}/"
        
        print(f"[PLAYLIST PREFIX] {prefix}")
        
        # Step 3: Fetch mixed media
        media = get_s3_playlist_media(prefix)
        
        return media

    # ========================
    # VIDEO SIGNAGE PLAYLIST
    # ========================
    def get_signage_videos(self):
        """
            - Used for signage screen
            - Always points to the Digital-Signage Folder
        """        
        prefix = "Digital Signage/"
        
        # Step 3: Fetch only the videos
        videos = get_video_media(prefix)
        
        return videos