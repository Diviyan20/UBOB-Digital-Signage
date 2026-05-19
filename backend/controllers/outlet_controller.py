"""
Outlet Controller

Handles:
- Outlet Validation
- Outlet Hearbeat Updates
- Fetching Outlet Information
- Fetching Mixed Media (Images + Videos) from S3 Bucket
"""
import os

import boto3
from flask import Blueprint, jsonify, request
from models.active_outlets import (
    get_outlet_information,
    update_heartbeat_status,
)
from services.outlet_service import fetch_all_outlet_data

# ===================
# CREATE BLUEPRINT
# ===================
outlet_bp = Blueprint("outlet", __name__)

# ===================
# VALIDATE OUTLET
# ===================
@outlet_bp.route("/validate_outlet", methods=["POST"])
def validate_outlet_route():
    """
    Checks whether outlet exists
    
    Frontend sends: (outlet_id": "59")
    
    Backend checks API/database
    """
    data = request.get_json()
    outlet_id = str(data.get("outlet_id")).strip() # Get outlet ID from request body
    
    if not outlet_id:
        return jsonify({"is_valid": False, "message": "outlet_id is required"}), 400
    
    outlet = get_outlet_information(outlet_id) # Fetch all outlets
    
    if not outlet:
        return jsonify({
            "is_valid": False,
            "message": "Outlet not Found"
        }), 404
    
    return jsonify({
        "is_valid": True,
        **outlet
    }), 200
    
# ==================
# GET ALL OUTLETS
# ==================
@outlet_bp.route("/api/outlets" ,methods=["GET"])
def get_all_outlets():
    """
    Returns all outlets
    """
    try:
        outlets = fetch_all_outlet_data()
        return jsonify({
            "outlets": outlets
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to fetch outlets: {e}"
        }), 500

# ========================
# GET SINGLE OUTLET INFO
# ========================
@outlet_bp.route("/outlet_info/<outlet_id>", methods=["GET"])
def outlet_info(outlet_id):
    """
    Returns information for one outlet
    """
    try:
        outlet = get_outlet_information(outlet_id)
        
        if not outlet:
            return jsonify({
                "success": False, 
                "error": "Outlet not found"
                }), 404
        
        return jsonify({
            "success": True,
            "outlet": outlet
        }), 200
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to fetch outlet information: {e}"
        })

# ===================
# HEARTBEAT UPDATE
# ===================
@outlet_bp.route("/heartbeat", methods=["POST"])
def heartbeat():
    """
    - Updates outlet online/offline status
    - Frontend sends hearbeat every X seconds
    """
    data = request.get_json()
    outlet_id = data.get("outlet_id")
    status = data.get("outlet_status")
    
    result = update_heartbeat_status(outlet_id, status)
    
    if not result:
        return jsonify({
            "error": "Outlet Not Found"
        }), 404
    
    return jsonify({
        "success": True,
    }), 200

# =====================
# GET MIXED MEDIA
# =====================
@outlet_bp.route("/get_mixed_mdeia", methods=["POST"])
def get_mixed_media():
    """
    Fetches BOTH images and videos from S3
    
    Flow:
    1. Frontend sends outlet ID + batch number
    2. Backend checks outlet region
    3. Backend opens correct S3 Folder
    4. Backend separates videos and images
    5. Backend returns media URLS
    """
    
    # Get the requested data
    data = request.get_json()
    outlet_id = str(data.get("outlet_id", "")).strip()
    batch_number = data.get("batch_number")
    
    # Validate Input
    if not outlet_id or batch_number is None:
        return jsonify({
            "error": "Outlet ID and Batch Number are missing."
        }), 404
    
    # Get Outlet Information
    outlet = get_outlet_information(outlet_id)
    if not outlet:
        return jsonify({
            "error": "Outlet not found"
        }), 400
    
    # Get Outlet Region
    region = data.get("outlet_location")
    if not region:
        return jsonify({
            "error": "Outlet Region Not Configured."
        }), 400
    
    # Folder Example: Selangor/Batch 1/
    folder_prefix = f"{region}/ Batch {batch_number}"
    
    # Connect to S3
    try:
        s3 = boto3.client("s3", region="ap-southeast-5", endpoint_url="https://s3.ap-southeast-5.amazonaws.com")
        bucket = os.getenv("VIDEO_BUCKET_NAME")
        
        if not bucket:
            return jsonify({
                "error": "Invalid Bucket Name / Bucket Name not configured"
            }), 500
        
        response = s3.list_objects_v2(
            Bucket = bucket,
            Prefix = folder_prefix
        )
        
        # Store Media
        videos = []
        images = []
        
        video_extensions = (".mp4", ".mov", ".avi", ".mkv")
        image_extensions = (".jpg", ".jpeg", ".png", ".webp")
        
        # Loop Through Files
        for item in response.get("Contents", []):
            file_key = item["Key"]
            
            # Skip folder itself
            if file_key.endswith("/"):
                continue
                
            # Generate temporary URL
            presigned_url = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": bucket,
                    "Key": file_key
                },
                ExpiresIn= 86400 # 24 Hours
            )
            
            # Extract file name Only
            filename = file_key.split("/")[-1]
            
            media_item = {
                "filename": filename,
                "key": file_key,
                "url": presigned_url
            }
            
            lower_file_key = file_key.lower()
            
            # Separate videos and images
            if lower_file_key.endswith(video_extensions):
                videos.append(media_item)
                
            elif lower_file_key.endswith(image_extensions):
                images.append(media_item)
            
            # Return Response
            return jsonify({
                "region": region,
                "batch": batch_number,
                
                "videos": videos,
                "images": images,
                
                "count":{
                    "videos": len(videos),
                    "images": len(images)
                }
            }), 200
    
    except Exception as e:
        return jsonify({
            "error": "Failed to fetch mixed media",
            "message": str(e)
        }), 500