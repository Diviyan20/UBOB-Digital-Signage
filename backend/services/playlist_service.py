import hashlib

from models.active_outlets import get_outlet_info
from utils.s3_helper import get_s3_playlist_media, get_video_media, list_s3_objects, get_video_url

class PlaylistService:
    """
    Handles media playlist logic
    """

    # ======================
    # OUTLET REGION HELPER
    # ======================
    def get_outlet_region(self, outlet_id: str):
        """
        Gets outlet region from database
        """
        outlet = get_outlet_info(outlet_id)

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
        Example: Kuala_Lumpur -> Kuala Lumpur
        """
        return region.strip().replace("_", " ")

    def get_playlist(self, outlet_id: str, batch_number: int, tier: str, orientation: str = "Landscape", filter_keys: list = None):
        """
        Legacy S3-folder playlist endpoint.

        Keep it temporarily for any existing callers. New Media Player login
          must not depend on this function.
        """
        
        # Step 1: Get outlet region and build s3 folder path
        region = self.get_outlet_region(outlet_id)
        normalized_region = self.normalize_region(region)
        prefix = f"{normalized_region}/Batch {batch_number}/{tier}/{orientation}/"

        print(f"[PLAYLIST PREFIX] {prefix}")

        # Step 2: Fetch mixed media
        media = get_s3_playlist_media(prefix)
        
        # Filter to only requested keys if provided
        if filter_keys:
            wanted = set(filter_keys)
            media = [item for item in media if item.get("key") in wanted]

        return media

    # ========================
    # VIDEO SIGNAGE PLAYLIST
    # ========================
    def get_signage_videos(self):
        """
        - Used for signage screen
        - Always points to the "Global/Signage/" folder
        """
        return get_video_media("Global/Signage/")

    def has_signage_videos(self) -> bool:
        return bool(list_s3_objects("Global/Signage/"))

    def _compute_version(self, prefix: str) -> dict:
        """
         Computes a stable content fingerprint and returns the full file manifest.
 
        The manifest is used by the frontend to diff against its cache —
        only added/removed files are downloaded or deleted. Nothing is
        transferred if the etag matches.
 
        Returns:
            etag        — short hash of the folder contents
            itemCount   — number of files in the folder
            manifest    — list of {key, url} for every file in the folder
                          Frontend compares this against its cached URL list
                          to find what to add or remove.
        """
        objects = list_s3_objects(prefix)

        fingerprint = "".join(
            f"{obj['key']}:{obj['size']}:{obj['modified']}"
            for obj in sorted(objects, key=lambda x: x["key"])
        )

        etag = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:12]

        print("\n========== VERSION CHECK ==========")
        print(f"PREFIX      : {prefix}")
        print(f"ITEM COUNT  : {len(objects)}")
        print(f"ETAG        : {etag}")
        print("===================================")
        
        """
            Build manifest — key identifies the file, 
                             url is what the frontend downloads
        """
        manifest = [
            {
                "key": obj["key"],
                "url": get_video_url(obj["key"]), # presigned or CloudFront URL from s3_helper
            }
            
            for obj in objects
        ]

        return {
            "etag": etag,
            "itemCount": len(objects),
            "manifest": manifest
        }

    def get_playlist_version(self, outlet_id: str, batch_number: int, tier: str, orientation: str = "Landscape") -> dict:
        """
        Returns version info for a playlist screen's S3 folder.
        """
        region = self.get_outlet_region(outlet_id)
        normalized_region = self.normalize_region(region)
        prefix = f"{normalized_region}/Batch {batch_number}/{tier}/{orientation}/"
        return self._compute_version(prefix)

    def get_signage_version(self) -> dict:
        """
        Returns version info for the "Global/Signage" folder.
        """
        return self._compute_version("Global/Signage/")