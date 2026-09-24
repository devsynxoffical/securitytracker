import time
import math
import logging
import threading
from datetime import datetime, timezone
from typing import Optional
from src.config import Config
from src.storage.queue import LocalQueue
from src.api_client import ApiClient

logger = logging.getLogger("DEVSYNXAgent")


class UploadWorker:
    """
    Background worker that periodically inspects local queue and uploads pending batches to backend.
    Enforces exponential backoff for failed retries while preserving original batchId.
    """

    def __init__(self, config: Config, queue: LocalQueue, api_client: ApiClient):
        self.config = config
        self.queue = queue
        self.api_client = api_client
        self.upload_interval = config.upload_interval_seconds
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def calculate_backoff_delay(self, attempt_count: int) -> float:
        """Calculates exponential backoff delay in seconds for retry attempts (max 300 seconds)."""
        if attempt_count <= 0:
            return 0.0
        # 5s, 10s, 20s, 40s, 80s, 160s, max 300s
        return min(300.0, 5.0 * math.pow(2, attempt_count - 1))

    def process_queue_once(self) -> int:
        """
        Executes a single processing pass over the local pending offline queue.
        Returns number of successfully uploaded batches.
        """
        pending_batches = self.queue.get_pending_batches(limit=10)
        if not pending_batches:
            return 0

        uploaded_count = 0
        now_dt = datetime.now(timezone.utc)

        for item in pending_batches:
            batch_id = item["batch_id"]
            payload = item["payload"]
            attempt_count = item["attempt_count"]
            last_attempt_at = item.get("last_attempt_at")

            if attempt_count > 0 and last_attempt_at:
                try:
                    last_attempt_dt = datetime.fromisoformat(last_attempt_at)
                    if last_attempt_dt.tzinfo is None:
                        last_attempt_dt = last_attempt_dt.replace(tzinfo=timezone.utc)
                    elapsed = (now_dt - last_attempt_dt).total_seconds()
                    required_delay = self.calculate_backoff_delay(attempt_count)
                    if elapsed < required_delay:
                        logger.debug(
                            f"Skipping batch '{batch_id}' (Attempt #{attempt_count}); "
                            f"elapsed {elapsed:.1f}s < required backoff {required_delay:.1f}s"
                        )
                        continue
                except Exception as e:
                    logger.warning(f"Error parsing last_attempt_at for batch '{batch_id}': {e}")

            success, res_data, status_code = self.api_client.upload_batch(payload)

            if success:
                self.queue.mark_batch_completed(batch_id)
                uploaded_count += 1
                logger.info(f"Batch '{batch_id}' successfully uploaded and acknowledged by backend.")
            elif status_code in (401, 403):
                # Permanent device authentication failure (revoked / disabled / invalid token)
                self.queue.mark_batch_paused_auth_error(batch_id)
                logger.warning(
                    f"Permanent device authentication failure (HTTP {status_code}). "
                    f"Batch '{batch_id}' paused in local SQLite queue pending administrator re-provisioning."
                )
            else:
                # Temporary network / server failure
                self.queue.increment_attempt_count(batch_id)
                backoff = self.calculate_backoff_delay(attempt_count + 1)
                logger.warning(
                    f"Upload failed for batch '{batch_id}' (Attempt #{attempt_count + 1}, HTTP {status_code}). "
                    f"Retrying in ~{int(backoff)}s. Remaining in local queue."
                )

        return uploaded_count

    def start(self) -> None:
        """Starts background uploader thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"Upload worker started (Interval: {self.upload_interval}s).")

    def stop(self) -> None:
        """Stops background uploader thread cleanly."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        logger.info("Upload worker stopped.")

    def _run_loop(self) -> None:
        last_run = 0.0
        while self._running:
            try:
                now = time.time()
                # Run queue check every second or at upload_interval
                if now - last_run >= 1.0:
                    self.process_queue_once()
                    last_run = now
            except Exception as e:
                logger.error(f"Error in uploader processing loop: {e}")

            time.sleep(1)
