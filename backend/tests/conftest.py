import pytest, sys, os
from backend.main import app

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# ------------------------------------------------------------------------------
# UNIT TEST CONFIGURATION
# Allows to call API routes directly (Eg. response = client.get("/get_outlets"))
# ------------------------------------------------------------------------------
@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["DEBUG"] = False

    with app.test_client() as client:
        yield client