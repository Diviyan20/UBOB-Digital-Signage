from backend.controllers import outlet_controllers, heartbeat_controller

def test_get_outlet_data(client, monkeypatch):
    # Mock data
    mock_outlets = [
        {"outlet_id": 42, "outlet_name": "AEON MALL AU2", "region_name": "Selangor"},
        {"outlet_id": 38, "outlet_name": "UMS", "region_name": "Sabah"},
    ]

    monkeypatch.setattr(outlet_controllers, "fetch_outlets", lambda: mock_outlets)

    # Mock register_device behavior
    mock_register = lambda oid, oname, rname:{
        "device_id": oid, "outlet_name": oname, "region_name": rname
    }
    monkeypatch.setattr(heartbeat_controller, "register_device", mock_register)

    # Hit Flask Endpoint
    payload = {
        "outlet_id": "42",
        "outlet_id": "38",
    }

    response = client.post("/get_outlets", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    assert data["is_valid"] is True
    assert data["outlet_name"] == "UMS" and "AEON MALL AU2"
    assert "device_info" in data

# Test for Invalid Outlet Code
def test_get_outlets_invalid_code(client, monkeypatch):
    monkeypatch.setattr(outlet_controllers, "fetch_outlets", lambda: [])
    payload = {"outlet_id": "99"}
    response = client.post("/get_outlets", json=payload)

    assert response.status_code == 404
    assert response.get_json()["is_valid"] is False