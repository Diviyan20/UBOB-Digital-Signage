import logging

from asgiref.wsgi import WsgiToAsgi
from controllers.admin_controller import admin_bp
from controllers.media_controller import media_bp
from controllers.outlet_controller import outlet_bp

# BLUEPRINTS
from controllers.video_controller import video_bp

# FLASK
from flask import Flask
from flask_cors import CORS
from mangum import Mangum
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, static_folder="static")

CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    },
)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# REGISTER BLUEPRINTS
app.register_blueprint(admin_bp)
app.register_blueprint(outlet_bp)
app.register_blueprint(media_bp)
app.register_blueprint(video_bp)

# =======
# LOGGING
# =======
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ==============
# 🚀 RUN SERVER
# ==============
asgi_app = WsgiToAsgi(app)
handler = Mangum(asgi_app, lifespan="off")
if __name__ == "__main__":
    log.info("Starting Flask backend for Digital Signage System...")
    log.info("🚀 Flask backend running")
    app.run(debug=True, host="0.0.0.0", port=5000)