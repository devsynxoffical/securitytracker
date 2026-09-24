import pytest
import os
from src.config import Config, load_config


def test_config_valid():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="test-device-uuid-123",
        device_token="devsynx_dev_secret_token_123",
    )
    config.validate()
    assert config.backend_url == "http://localhost:4000"
    assert config.sample_interval_seconds == 5


def test_config_missing_device_id():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="",
        device_token="devsynx_dev_secret_token_123",
    )
    with pytest.raises(ValueError, match="device_id"):
        config.validate()


def test_config_missing_device_token():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="test-device-uuid-123",
        device_token="",
    )
    with pytest.raises(ValueError, match="device_token"):
        config.validate()


def test_config_invalid_intervals():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="test-device-uuid-123",
        device_token="devsynx_dev_secret_token_123",
        sample_interval_seconds=0,
    )
    with pytest.raises(ValueError, match="sample_interval_seconds"):
        config.validate()


def test_config_placeholder_rejection():
    config = Config(
        backend_url="http://localhost:4000",
        device_id="REPLACE_WITH_PROVISIONED_DEVICE_ID",
        device_token="devsynx_dev_secret_token_123",
    )
    with pytest.raises(ValueError, match="device_id"):
        config.validate()
