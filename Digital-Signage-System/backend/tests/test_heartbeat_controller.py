from backend.controllers import heartbeat_controller

def test_register_device(monkeypatch):
    # Mock database insertion and datetime
    mock_insert = lambda data: {"inserted_id": "123"}
    monkeypatch.setattr(heartbeat_controller.devices, "insert_one", mock_insert)

    result = heartbeat_controller.register_device("42", "AEON MALL AU2", "Selangor")

    assert result is not None
    assert "device_id" in result
    assert result["device_id"] == "42"
