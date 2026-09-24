import requests
import logging
from typing import Dict, Any, Tuple, Optional
from src.config import Config
from src.device_identity import DeviceIdentity

logger = logging.getLogger("DEVSYNXAgent")


class ApiClient:
    """HTTP Client for communicating with the DEVSYNX Activity Tracker backend."""

    def __init__(self, config: Config, device_identity: DeviceIdentity):
        self.backend_url = config.backend_url
        self.device_identity = device_identity
        self.timeout_seconds = 10.0

    def upload_batch(self, payload: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]], int]:
        """
        Uploads a activity telemetry batch to POST /api/v1/activity/batches.
        Returns Tuple: (success: bool, response_data: Optional[Dict], status_code: int)
        """
        endpoint = f"{self.backend_url}/api/v1/activity/batches"
        headers = self.device_identity.get_auth_headers()

        try:
            response = requests.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=self.timeout_seconds,
            )

            status_code = response.status_code
            try:
                res_data = response.json()
            except Exception:
                res_data = None

            if status_code == 200 and res_data and res_data.get("status") == "success":
                # Handle idempotency: both new accepted batch and duplicate retry response count as successful server ACK
                return True, res_data, status_code
            else:
                err_msg = res_data.get("error", {}).get("message") if res_data else response.text
                logger.warning(f"Backend upload rejected with HTTP {status_code}: {err_msg}")
                return False, res_data, status_code

        except requests.exceptions.Timeout:
            logger.warning(f"Network timeout when attempting to connect to {endpoint}")
            return False, None, 408
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection refused/network unavailable when calling {endpoint}")
            return False, None, 503
        except Exception as e:
            logger.error(f"Unexpected HTTP request error during activity batch upload: {e}")
            return False, None, 500
