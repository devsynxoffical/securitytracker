import pytest
from unittest.mock import MagicMock, patch
from src.config import Config
from src.device_identity import DeviceIdentity
from src.api_client import ApiClient


@pytest.fixture
def api_client():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="test-dev-id-123",
        device_token="devsynx_dev_test_token_123",
    )
    identity = DeviceIdentity(config)
    return ApiClient(config, identity)


@patch("requests.post")
def test_upload_batch_success(mock_post, api_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "status": "success",
        "data": {"batchId": "BATCH-1", "accepted": 1, "duplicate": False},
    }
    mock_post.return_value = mock_response

    payload = {"batchId": "BATCH-1", "samples": []}
    success, res_data, status_code = api_client.upload_batch(payload)

    assert success is True
    assert status_code == 200
    assert res_data["data"]["duplicate"] is False


@patch("requests.post")
def test_upload_batch_duplicate_idempotent_ack(mock_post, api_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "status": "success",
        "data": {"batchId": "BATCH-1", "accepted": 0, "duplicate": True},
    }
    mock_post.return_value = mock_response

    payload = {"batchId": "BATCH-1", "samples": []}
    success, res_data, status_code = api_client.upload_batch(payload)

    assert success is True
    assert status_code == 200
    assert res_data["data"]["duplicate"] is True


@patch("requests.post")
def test_upload_batch_401_unauthorized(mock_post, api_client):
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.json.return_value = {
        "error": {"code": "UNAUTHORIZED", "message": "Invalid device credentials"}
    }
    mock_post.return_value = mock_response

    payload = {"batchId": "BATCH-1", "samples": []}
    success, res_data, status_code = api_client.upload_batch(payload)

    assert success is False
    assert status_code == 401


@patch("requests.post")
def test_upload_batch_network_timeout(mock_post, api_client):
    import requests
    mock_post.side_effect = requests.exceptions.Timeout("Connection timed out")

    payload = {"batchId": "BATCH-1", "samples": []}
    success, res_data, status_code = api_client.upload_batch(payload)

    assert success is False
    assert status_code == 408
