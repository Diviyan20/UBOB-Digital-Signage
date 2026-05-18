import base64
import logging

from controllers.admin_controller import admin_bp
from controllers.outlet_controller import outlet_bp
from controllers.outlet_image_controller import outlet_image_bp
from controllers.playlist_controller import playlist_bp
from controllers.promotion_controller import promotion_bp
from controllers.system_config_controller import system_config_bp
from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, static_folder="static")

CORS(app, resources={r"/*": {"origins": "*"}})
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

app.register_blueprint(admin_bp)
app.register_blueprint(outlet_bp)
app.register_blueprint(outlet_image_bp)
app.register_blueprint(promotion_bp)
app.register_blueprint(playlist_bp)
app.register_blueprint(system_config_bp)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://d3k3f58khrn48v.cloudfront.net",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

def handler(event, context):
    method = event["requestContext"]["http"]["method"]
    path = event.get("rawPath", "/")
    headers = event.get("headers", {})

    # Handle preflight immediately — don't pass to Flask
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
            "isBase64Encoded": False
        }

    body = event.get("body", "")
    is_base64 = event.get("isBase64Encoded", False)

    if is_base64 and body:
        data = base64.b64decode(body)
    elif body:
        data = body.encode("utf-8") if isinstance(body, str) else body
    else:
        data = b""

    content_type = headers.get("content-type", "application/json")

    with app.test_client() as client:
        response = client.open(
            path,
            method=method,
            headers=headers,
            data=data,
            content_type=content_type
        )

        response_headers = dict(response.headers)
        response_headers.update(CORS_HEADERS)

        raw = response.get_data()
        resp_ct = response.headers.get("Content-Type", "").lower()
        is_binary = (
            resp_ct.startswith("image/")
            or resp_ct.startswith("application/octet-stream")
            or resp_ct.startswith("video/")
        )
        if is_binary:
            body = base64.b64encode(raw).decode("utf-8")
            is_b64 = True
        else:
            body = raw.decode("utf-8", errors="replace")
            is_b64 = False

        return {
            "statusCode": response.status_code,
            "headers": response_headers,
            "body": body,
            "isBase64Encoded": is_b64
        }


if __name__ == "__main__":
    log.info("Starting Flask backend for Digital Signage System...")
    app.run(debug=True, host="0.0.0.0", port=5000)