import os
import time
import pytest
import tempfile
import sqlite3
from unittest.mock import MagicMock
from src.config import Config
from src.storage.queue import LocalQueue
from src.api_client import ApiClient
from src.device_identity import DeviceIdentity
from src.uploader.worker import UploadWorker
from src.activity.session import SessionAggregator
from src.activity.idle import IdleDetector


class TestE2EPipeline:
    @pytest.fixture
    def temp_db(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            db_path = os.path.join(temp_dir, "test_agent.sqlite")
            yield db_path

    @pytest.fixture
    def mock_config(self):
        config = MagicMock(spec=Config)
        config.backend_url = "http://localhost:4000"
        config.device_id = "test-device-uuid-1234"
        config.device_token = "dev_sec_token_5678"
        config.db_path = "agent_data.sqlite"
        config.sample_interval_seconds = 5
        config.idle_threshold_seconds = 180
        config.upload_interval_seconds = 30
        config.window_title_enabled = True
        return config

    def test_device_credential_states(self, temp_db, mock_config):
        """Tests uploader behavior under ACTIVE, DISABLED, and REVOKED device credential states."""
        queue = LocalQueue(db_path=temp_db)
        mock_api = MagicMock(spec=ApiClient)
        worker = UploadWorker(config=mock_config, queue=queue, api_client=mock_api)

        # Enqueue sample batch
        batch_id = "BATCH-CRED-TEST-1"
        sample_data = [{"appName": "vscode.exe", "durationSeconds": 30, "startTime": "2026-09-18T10:00:00Z", "endTime": "2026-09-18T10:00:30Z", "isIdle": False}]
        queue.enqueue_batch(batch_id, sample_data)
        assert queue.get_queue_depth() == 1

        # 1. State: Temporary Failure (HTTP 503) -> Should retry normally
        mock_api.upload_batch.return_value = (False, {"error": "Service Unavailable"}, 503)
        uploaded = worker.process_queue_once()
        assert uploaded == 0
        assert queue.get_queue_depth() == 1
        pending = queue.get_pending_batches()
        assert pending[0]["attempt_count"] == 1

        # 2. State: Permanent Auth Failure (HTTP 401 REVOKED / 403 DISABLED) -> Pause batch, retain data in SQLite
        mock_api.upload_batch.return_value = (False, {"error": "Invalid or revoked device token"}, 401)
        # Set last_attempt_at in past so backoff check passes
        with queue._get_connection() as conn:
            conn.execute("UPDATE pending_batches SET last_attempt_at = '2020-01-01T00:00:00+00:00' WHERE batch_id = ?", (batch_id,))
            conn.commit()

        uploaded = worker.process_queue_once()
        assert uploaded == 0
        # Batch status is now PAUSED_AUTH_ERROR, so pending depth is 0 (no infinite retry loop)
        assert queue.get_queue_depth() == 0
        # Verify batch is still safely preserved in SQLite
        with queue._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT status FROM pending_batches WHERE batch_id = ?", (batch_id,))
            status = cursor.fetchone()[0]
            assert status == "PAUSED_AUTH_ERROR"

        # 3. State: Re-provisioning / Reset -> Reset paused batches back to PENDING and upload successfully under ACTIVE (HTTP 200)
        queue.reset_paused_auth_batches()
        assert queue.get_queue_depth() == 1

        with queue._get_connection() as conn:
            conn.execute("UPDATE pending_batches SET last_attempt_at = '2020-01-01T00:00:00+00:00' WHERE batch_id = ?", (batch_id,))
            conn.commit()

        mock_api.upload_batch.return_value = (True, {"acknowledged": True, "count": 1}, 200)
        uploaded = worker.process_queue_once()
        assert uploaded == 1
        assert queue.get_queue_depth() == 0

    def test_batch_idempotency_and_stable_batch_id(self, temp_db, mock_config):
        """Verifies that batchId remains stable across retries and duplicate ACKs process cleanly."""
        queue = LocalQueue(db_path=temp_db)
        mock_api = MagicMock(spec=ApiClient)
        worker = UploadWorker(config=mock_config, queue=queue, api_client=mock_api)

        batch_id = "STABLE-BATCH-ID-999"
        queue.enqueue_batch(batch_id, [{"appName": "chrome.exe", "durationSeconds": 10, "startTime": "2026-09-18T10:05:00Z", "endTime": "2026-09-18T10:05:10Z", "isIdle": False}])

        # First attempt fails
        mock_api.upload_batch.return_value = (False, {"error": "Network timeout"}, 504)
        worker.process_queue_once()

        pending = queue.get_pending_batches()
        assert len(pending) == 1
        assert pending[0]["batch_id"] == batch_id  # batchId preserved
        assert pending[0]["payload"]["batchId"] == batch_id

        # Second attempt succeeds (simulating server duplicate ACK)
        with queue._get_connection() as conn:
            conn.execute("UPDATE pending_batches SET last_attempt_at = '2020-01-01T00:00:00+00:00' WHERE batch_id = ?", (batch_id,))
            conn.commit()

        mock_api.upload_batch.return_value = (True, {"acknowledged": True, "count": 1, "duplicate": True}, 200)
        worker.process_queue_once()
        assert queue.get_queue_depth() == 0

    def test_offline_queueing_and_network_drop_recovery(self, temp_db, mock_config):
        """Simulates network drop offline storage accumulation followed by batch drain upon reconnection."""
        queue = LocalQueue(db_path=temp_db)
        mock_api = MagicMock(spec=ApiClient)
        worker = UploadWorker(config=mock_config, queue=queue, api_client=mock_api)

        # Network down: accumulate 3 batches
        for i in range(3):
            queue.enqueue_batch(f"OFFLINE-BATCH-{i}", [{"appName": f"app_{i}.exe", "durationSeconds": 15, "startTime": "2026-09-18T10:10:00Z", "endTime": "2026-09-18T10:10:15Z", "isIdle": False}])

        assert queue.get_queue_depth() == 3

        # Upload attempt during network down fails
        mock_api.upload_batch.return_value = (False, {"error": "Host unreachable"}, 503)
        worker.process_queue_once()
        assert queue.get_queue_depth() == 3

        # Reset last_attempt_at to simulate backoff delay passage
        with queue._get_connection() as conn:
            conn.execute("UPDATE pending_batches SET last_attempt_at = '2020-01-01T00:00:00+00:00'")
            conn.commit()

        # Network restored: all batches successfully uploaded
        mock_api.upload_batch.return_value = (True, {"acknowledged": True}, 200)
        uploaded = worker.process_queue_once()
        assert uploaded == 3
        assert queue.get_queue_depth() == 0

    def test_process_restart_queue_recovery(self, temp_db, mock_config):
        """Verifies that enqueued batches persist across agent restarts."""
        # Agent instance 1
        queue1 = LocalQueue(db_path=temp_db)
        batch_id = "RESTART-PERSIST-BATCH-1"
        queue1.enqueue_batch(batch_id, [{"appName": "slack.exe", "durationSeconds": 45, "startTime": "2026-09-18T10:15:00Z", "endTime": "2026-09-18T10:15:45Z", "isIdle": False}])
        queue1.close()

        # Agent instance 2 (simulating restart)
        queue2 = LocalQueue(db_path=temp_db)
        assert queue2.get_queue_depth() == 1
        pending = queue2.get_pending_batches()
        assert pending[0]["batch_id"] == batch_id

        # Upload and complete in instance 2
        mock_api = MagicMock(spec=ApiClient)
        mock_api.upload_batch.return_value = (True, {"acknowledged": True}, 200)
        worker = UploadWorker(config=mock_config, queue=queue2, api_client=mock_api)
        uploaded = worker.process_queue_once()

        assert uploaded == 1
        assert queue2.get_queue_depth() == 0

    def test_idle_session_separation(self):
        """Verifies session aggregator closes active session and starts system idle session on idle trigger."""
        aggregator = SessionAggregator()

        # Active application samples
        aggregator.add_sample("Code.exe", "main.ts - VSCode", is_idle=False)
        aggregator.add_sample("Code.exe", "main.ts - VSCode", is_idle=False)

        # Transition to system idle
        aggregator.add_sample("System Idle", None, is_idle=True)

        sessions = aggregator.get_and_flush_completed_sessions()
        assert len(sessions) == 1
        assert sessions[0]["appName"] == "Code.exe"
        assert sessions[0]["isIdle"] is False

        # Transition back to active application
        aggregator.add_sample("Chrome.exe", "Google Search", is_idle=False)

        sessions2 = aggregator.get_and_flush_completed_sessions()
        assert len(sessions2) == 1
        assert sessions2[0]["appName"] == "System Idle"
        assert sessions2[0]["isIdle"] is True
