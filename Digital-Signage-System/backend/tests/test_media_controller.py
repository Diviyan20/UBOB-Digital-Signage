import base64
from backend.controllers import media_controller

def test_get_media(client, monkeypatch):
    mock_media = [
        {"id": 1, "image": "data:image/png;base64," + base64.b64encode(b"fakeimg").decode()}
    ]

    
    monkeypatch.setattr(media_controller, "get_media_json", lambda: mock_media)

    response = client.get("/get_media")
    data = response.get_json()

    assert response.status_code == 200
    assert "message" in data
    assert "media" in data
    assert isinstance(data["media"], list)
    assert len(data["media"]) > 0
