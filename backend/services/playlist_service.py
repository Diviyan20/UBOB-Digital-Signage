import hashlib
from urllib.parse import quote

from models.active_outlets import get_outlet_information
from utils.s3_helper import get_s3_playlist_media, get_video_media, list_s3_objects, get_video_url

CLOUDFRONT_DOMAIN = "d30au7cngoylsj.cloudfront.net"

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
    def get_outlet_region(self, outlet_id: str):
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

        Example: Kuala_Lumpur -> Kuala Lumpur
        """
        return region.strip().replace("_", " ")

    def get_playlist(self, outlet_id: str, batch_number: int, tier: str, orientation: str = "Landscape", filter_keys: list = None):
        """
        Builds S3 path based on region, batch, tier, and orientation.
        
        filter_keys: optional list of S3 keys — when provided, only returns
        those specific items. Used by the frontend diff sync to fetch only
        new files rather than the full playlist.

        Example: Selangor/Batch 2/Tier A/Landscape/
        """
        # Step 1: Get outlet region
        region = self.get_outlet_region(outlet_id)
        normalized_region = self.normalize_region(region)

        # Step 2: Build S3 folder path
        prefix = f"{normalized_region}/Batch {batch_number}/{tier}/{orientation}/"

        print(f"[PLAYLIST PREFIX] {prefix}")

        # Step 3: Fetch mixed media
        media = get_s3_playlist_media(prefix)
        
        # Filter to only requested keys if provided
        if filter_keys:
            filter_set = set(filter_keys)
            media = [item for item in media if item.get("key") in filter_set]
            print(f"[PLAYLIST] Filtered to {len(media)} items from filter_keys")

        return media

    # ========================
    # VIDEO SIGNAGE PLAYLIST
    # ========================
    def get_signage_videos(self):
        """
        - Used for signage screen
        - Always points to the Digital Signage folder
        """
        prefix = "Digital Signage/"
        return get_video_media(prefix)

    def has_signage_videos(self) -> bool:
        prefix = "Digital Signage/"
        objects = list_s3_objects(prefix)
        return len(objects) > 0

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

        etag = hashlib.md5(fingerprint.encode()).hexdigest()[:12]

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
        Returns version info for the Digital Signage folder.
        """
        prefix = "Digital Signage/"
        return self._compute_version(prefix)