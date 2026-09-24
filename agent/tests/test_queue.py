import os
import tempfile
import pytest
from src.storage.queue import LocalQueue


@pytest.fixture
def temp_queue():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        temp_path = f.name
    queue = LocalQueue(db_path=temp_path)
    yield queue
    queue.close()
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass


def test_queue_enqueue_and_get(temp_queue):
    batch_id = "BATCH-TEST-001"
    samples = [
        {
            "appName": "Chrome",
            "windowTitle": "GitHub",
            "startedAt": "2026-09-18T10:00:00Z",
            "endedAt": "2026-09-18T10:05:00Z",
            "isIdle": False,
        }
    ]

    success = temp_queue.enqueue_batch(batch_id, samples)
    assert success is True
    assert temp_queue.get_queue_depth() == 1

    pending = temp_queue.get_pending_batches()
    assert len(pending) == 1
    assert pending[0]["batch_id"] == batch_id
    assert pending[0]["payload"]["samples"][0]["appName"] == "Chrome"


def test_queue_mark_completed(temp_queue):
    batch_id = "BATCH-TEST-002"
    samples = [{"appName": "VS Code", "startedAt": "2026-09-18T10:00:00Z", "endedAt": "2026-09-18T10:05:00Z", "isIdle": False}]

    temp_queue.enqueue_batch(batch_id, samples)
    assert temp_queue.get_queue_depth() == 1

    temp_queue.mark_batch_completed(batch_id)
    assert temp_queue.get_queue_depth() == 0


def test_queue_increment_attempt_count(temp_queue):
    batch_id = "BATCH-TEST-003"
    samples = [{"appName": "Terminal", "startedAt": "2026-09-18T10:00:00Z", "endedAt": "2026-09-18T10:05:00Z", "isIdle": False}]

    temp_queue.enqueue_batch(batch_id, samples)
    temp_queue.increment_attempt_count(batch_id)

    pending = temp_queue.get_pending_batches()
    assert len(pending) == 1
    assert pending[0]["attempt_count"] == 1


def test_queue_duplicate_batch_id_rejected(temp_queue):
    batch_id = "BATCH-TEST-UNIQUE"
    samples = [{"appName": "Slack", "startedAt": "2026-09-18T10:00:00Z", "endedAt": "2026-09-18T10:05:00Z", "isIdle": False}]

    assert temp_queue.enqueue_batch(batch_id, samples) is True
    # Attempting to enqueue same batchId again should return False without corrupting queue
    assert temp_queue.enqueue_batch(batch_id, samples) is False
    assert temp_queue.get_queue_depth() == 1
