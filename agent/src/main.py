import sys
import time
import signal
import uuid
import logging
from typing import Optional
from src.config import load_config
from src.logging_config import setup_logging
from src.device_identity import DeviceIdentity
from src.api_client import ApiClient
from src.storage.queue import LocalQueue
from src.activity.collector import ForegroundAppCollector
from src.activity.idle import IdleDetector
from src.activity.session import SessionAggregator
from src.uploader.worker import UploadWorker

logger = logging.getLogger("DEVSYNXAgent")
running = True


def signal_handler(signum, frame):
    global running
    logger.info(f"Received termination signal ({signum}). Initiating graceful shutdown...")
    running = False


def main():
    global running

    # 1. Load Configuration
    try:
        config = load_config()
    except Exception as e:
        print(f"❌ Startup Aborted: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. Setup Logging
    setup_logging(secret_token=config.device_token)
    logger.info("Starting DEVSYNX Desktop Activity Agent v1.0.0")
    logger.info(f"Configured Backend URL: {config.backend_url}")
    logger.info(f"Configured Device ID: {config.device_id}")
    logger.info(f"Sampling Interval: {config.sample_interval_seconds}s | Idle Threshold: {config.idle_threshold_seconds}s | Upload Interval: {config.upload_interval_seconds}s")

    # 3. Register Signal Handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # 4. Initialize Agent Components
    device_identity = DeviceIdentity(config)
    api_client = ApiClient(config, device_identity)
    queue = LocalQueue(db_path=config.db_path)
    collector = ForegroundAppCollector()
    idle_detector = IdleDetector(threshold_seconds=config.idle_threshold_seconds)
    aggregator = SessionAggregator()
    uploader = UploadWorker(config, queue, api_client)

    # 5. Start Background Uploader
    uploader.start()

    logger.info("Sampling loop active. Monitoring foreground application activity...")

    # 6. Sampling Loop
    while running:
        try:
            is_idle = idle_detector.is_idle()
            if is_idle:
                app_info = {"app_name": "System Idle", "window_title": None}
            else:
                app_info = collector.get_foreground_app(window_title_enabled=config.window_title_enabled)

            # Record sample into aggregator
            aggregator.add_sample(
                app_name=app_info["app_name"],
                window_title=app_info["window_title"],
                is_idle=is_idle,
            )

            # Flush completed sessions to local offline queue
            completed_sessions = aggregator.get_and_flush_completed_sessions()
            if completed_sessions:
                batch_id = f"BATCH-{uuid.uuid4()}"
                queue.enqueue_batch(batch_id, completed_sessions)
                logger.debug(f"Enqueued batch '{batch_id}' with {len(completed_sessions)} session(s) into local offline queue.")

        except Exception as e:
            logger.error(f"Error in activity sampling loop: {e}")

        # Sleep sample_interval_seconds in 1s steps for responsive shutdown
        for _ in range(config.sample_interval_seconds):
            if not running:
                break
            time.sleep(1)

    # 7. Graceful Shutdown Routine
    logger.info("Executing graceful agent shutdown routine...")
    try:
        aggregator.close_current_session()
        remaining_sessions = aggregator.get_and_flush_completed_sessions()
        if remaining_sessions:
            batch_id = f"BATCH-SHUTDOWN-{uuid.uuid4()}"
            queue.enqueue_batch(batch_id, remaining_sessions)
            logger.info(f"Final session batch '{batch_id}' saved to local offline queue.")

        # Final queue flush attempt before exit
        uploader.process_queue_once()
        uploader.stop()
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

    logger.info("DEVSYNX Desktop Activity Agent stopped cleanly.")


if __name__ == "__main__":
    main()
