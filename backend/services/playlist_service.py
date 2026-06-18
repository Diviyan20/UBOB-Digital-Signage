import hashlib

from models.active_outlets import get_outlet_information
from utils.s3_helper import get_s3_playlist_media, get_video_media, list_s3_objects


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
    
    def has_signage_videos(self) -> bool:
        prefix = "Digital Signage/"
        
        objects = list_s3_objects(prefix)
        
        return len(objects) > 0
    
    def _compute_version(self, prefix: str) -> dict:
        """
        Computes a stable content fingerprint.

        Changes whenever:
        - file added
        - file removed
        - file renamed
        - file replaced
        """

        objects = list_s3_objects(prefix)

        fingerprint = "".join(
            f"{obj['key']}:{obj['size']}:{obj['modified']}"
            for obj in sorted(
                objects,
                key=lambda x: x["key"]
            )
        )

        etag = hashlib.md5(
            fingerprint.encode()
        ).hexdigest()[:12]

        print("\n========== VERSION CHECK ==========")
        print(f"PREFIX      : {prefix}")
        print(f"ITEM COUNT  : {len(objects)}")
        print(f"ETAG        : {etag}")
        print("===================================")

        return {
            "etag": etag,
            "itemCount": len(objects)
        }
    
    def get_playlist_version(self, outlet_id: str, batch_number: int, orientation: str= "Landscape") -> dict:
        """
        Returns version info for a playlist screen's S3 folder.
        """
        region = self.get_outlet_region(outlet_id)
        normalized_region = self.normalize_region(region)
        prefix = f"{normalized_region}/Batch {batch_number}/{orientation}/"
        return self._compute_version(prefix)

    def get_signage_version(self) -> dict:
        """
        Returns version info for the Digital Signage folder.
        """
        prefix = "Digital Signage/"
        return self._compute_version(prefix)