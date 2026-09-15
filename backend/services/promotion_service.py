import base64
import hashlib
import io
import os
from pathlib import Path

from flask import abort, send_file
from PIL import Image

from utils.odoo_helper import fetch_odoo_promotions


# =======================
# ENVIRONMENT VARIABLES
# =======================

PUBLIC_HOST_URL = os.getenv("PUBLIC_HOST_URL")


# ==========================
# LAMBDA IMAGE CACHE
# ==========================

CACHE_DIR = Path("/tmp/promotion_cache")
CACHE_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


class PromotionService:
    """
    Handles:
        - Fetching promotion metadata from Odoo
        - Converting base64 images into PNG files
        - Reusing converted PNG files
        - Returning promotion image URLs

    Odoo is the source of truth for promotion metadata.
    The Lambda only caches the generated image files.
    """

    def get_promotions(self):
        """
        Fetch the latest promotions from Odoo.

        The promotion list itself is NOT cached.

        This is intentional because the TV needs to be able
        to detect changes to date_start/date_end.

        Image files are still reused from /tmp when possible.
        """

        print("[PROMOTION] Fetching latest promotions from Odoo...")

        raw_promotions = fetch_odoo_promotions()

        processed_promotions = []

        for promo in raw_promotions:
            name = promo.get("name", "unknown")
            description = promo.get("description", "")
            raw_image = promo.get("image")

            if not raw_image:
                continue

            image_id = self.generate_image_id(
                name,
                raw_image,
            )

            image_path = self.get_image_path(image_id)

            # Reuse converted image if it already exists.
            if not image_path.exists():
                print(
                    f"[PROMOTION] Converting image: {name}"
                )

                self.save_base64_as_png(
                    raw_image,
                    image_id,
                )

            processed_promotions.append(
                {
                    "type": "image",
                    "name": name,
                    "description": description,
                    "image": (
                        f"{PUBLIC_HOST_URL}"
                        f"/promotion_image/{image_id}"
                    ),
                    "date_start": promo.get("date_start"),
                    "date_end": promo.get("date_end"),
                }
            )

        print(
            f"[PROMOTION] Returning "
            f"{len(processed_promotions)} promotion(s)"
        )

        return processed_promotions

    def stream_promotion_image(self, image_id):
        """
        Streams a previously converted promotion image.
        """
        path = self.get_image_path(image_id)

        if not path.exists():
            abort(404, "Image not found")

        return send_file(
            path,
            mimetype="image/png",
            as_attachment=False,
        )

    # =================
    # HELPER FUNCTIONS
    # =================

    def generate_image_id(self, name, raw_image):
        """
        Generates a stable ID based on the promotion
        name and image content.
        """
        seed = f"{name}:{raw_image[:50]}"

        return hashlib.md5(
            seed.encode()
        ).hexdigest()[:12]

    def get_image_path(self, image_id):
        """
        Returns the local path for a converted image.
        """
        return CACHE_DIR / f"{image_id}.png"

    def save_base64_as_png(self, base64_data, image_id):
        """
        Converts a base64 image into an optimized PNG.
        """

        if "," in base64_data:
            base64_data = base64_data.split(
                ",",
                1,
            )[1]

        image_bytes = base64.b64decode(
            base64_data
        )

        with Image.open(
            io.BytesIO(image_bytes)
        ) as img:

            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")

            img.thumbnail((1280, 720))

            img.save(
                self.get_image_path(image_id),
                format="PNG",
                optimize=True,
            )