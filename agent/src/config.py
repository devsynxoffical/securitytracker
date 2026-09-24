import os
import json
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    backend_url: str
    device_id: str
    device_token: str
    sample_interval_seconds: int = 5
    idle_threshold_seconds: int = 180
    upload_interval_seconds: int = 60
    window_title_enabled: bool = False
    db_path: str = "agent_data.sqlite"

    def validate(self) -> None:
        """Validates configuration parameters. Raises ValueError on missing or invalid configuration."""
        if not self.backend_url or not isinstance(self.backend_url, str):
            raise ValueError("Configuration Error: 'backend_url' is required and must be a valid URL string.")

        if not self.device_id or not isinstance(self.device_id, str) or self.device_id.startswith("REPLACE_"):
            raise ValueError("Configuration Error: 'device_id' is required and must be configured with a valid provisioned ID.")

        if not self.device_token or not isinstance(self.device_token, str) or self.device_token.startswith("REPLACE_"):
            raise ValueError("Configuration Error: 'device_token' is required and must be configured with a valid secret token.")

        if self.sample_interval_seconds <= 0:
            raise ValueError("Configuration Error: 'sample_interval_seconds' must be a positive integer.")

        if self.idle_threshold_seconds <= 0:
            raise ValueError("Configuration Error: 'idle_threshold_seconds' must be a positive integer.")

        if self.upload_interval_seconds <= 0:
            raise ValueError("Configuration Error: 'upload_interval_seconds' must be a positive integer.")

        # Clean trailing slash on backend_url
        self.backend_url = self.backend_url.rstrip("/")


def load_config(config_path: Optional[str] = None) -> Config:
    """
    Loads configuration from a JSON file (default: config.json or config.example.json)
    or environment variables.
    """
    data = {}

    # Determine file path
    target_path = config_path or os.environ.get("DEVSYNX_CONFIG_PATH") or "config.json"
    if not os.path.exists(target_path) and os.path.exists("config.example.json") and not config_path:
        target_path = "config.example.json"

    if os.path.exists(target_path):
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    # Environment variables take precedence over config.json
    backend_url = os.environ.get("DEVSYNX_BACKEND_URL") or data.get("backend_url", "http://localhost:4000")
    device_id = os.environ.get("DEVSYNX_DEVICE_ID") or data.get("device_id", "")
    device_token = os.environ.get("DEVSYNX_DEVICE_TOKEN") or data.get("device_token", "")

    sample_interval = int(os.environ.get("DEVSYNX_SAMPLE_INTERVAL", data.get("sample_interval_seconds", 5)))
    idle_threshold = int(os.environ.get("DEVSYNX_IDLE_THRESHOLD", data.get("idle_threshold_seconds", 180)))
    upload_interval = int(os.environ.get("DEVSYNX_UPLOAD_INTERVAL", data.get("upload_interval_seconds", 60)))
    window_title_enabled = str(os.environ.get("DEVSYNX_WINDOW_TITLE_ENABLED", data.get("window_title_enabled", False))).lower() in ("true", "1", "yes")

    config = Config(
        backend_url=backend_url,
        device_id=device_id,
        device_token=device_token,
        sample_interval_seconds=sample_interval,
        idle_threshold_seconds=idle_threshold,
        upload_interval_seconds=upload_interval,
        window_title_enabled=window_title_enabled,
        db_path=data.get("db_path", "agent_data.sqlite"),
    )

    config.validate()
    return config
