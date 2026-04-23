import base64
import logging

from controllers.admin_controller import admin_bp
from controllers.media_controller import media_bp
from controllers.outlet_controller import outlet_bp
from controllers.video_controller import video_bp
from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, static_folder="static")

CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

app.register_blueprint(admin_bp)
app.register_blueprint(outlet_bp)
app.register_blueprint(media_bp)
app.register_blueprint(video_bp)

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)


def handler(event, context):
    method = event["requestContext"]["http"]["method"]
    path = event.get("rawPath", "/")
    headers = event.get("headers", {})
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

        return {
            "statusCode": response.status_code,
            "headers": dict(response.headers),
            "body": response.get_data(as_text=True),
            "isBase64Encoded": False
        }


if __name__ == "__main__":
    log.info("Starting Flask backend for Digital Signage System...")
    app.run(debug=True, host="0.0.0.0", port=5000)