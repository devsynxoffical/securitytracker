from typing import Dict
from src.config import Config


class DeviceIdentity:
    """Manages Phase 6 device credentials and constructs HTTP authentication headers."""

    def __init__(self, config: Config):
        self.device_id = config.device_id
        self.device_token = config.device_token

    def get_auth_headers(self) -> Dict[str, str]:
        """Returns standard headers required by backend requireDeviceAuth middleware."""
        return {
            "X-Device-ID": self.device_id,
            "X-Device-Token": self.device_token,
            "Content-Type": "application/json",
        }
