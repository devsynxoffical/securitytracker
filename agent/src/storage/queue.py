import sqlite3
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger("DEVSYNXAgent")


class LocalQueue:
    """
    Local SQLite database queue for temporary offline storage of pending activity batches.
    Preserves batchId across network retries for server-side idempotency.
    """

    def __init__(self, db_path: str = "agent_data.sqlite"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def close(self) -> None:
        """Closes connections if applicable."""
        pass

    def _init_db(self) -> None:
        """Initializes local SQLite schema for agent queue."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pending_batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    batch_id TEXT UNIQUE NOT NULL,
                    payload_json TEXT NOT NULL,
                    sample_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    attempt_count INTEGER DEFAULT 0,
                    last_attempt_at TEXT,
                    status TEXT DEFAULT 'PENDING'
                )
            """)
            conn.commit()

    def enqueue_batch(self, batch_id: str, samples: List[Dict[str, Any]]) -> bool:
        """Enqueues a new telemetry batch for upload."""
        if not samples:
            return False

        now_iso = datetime.now(timezone.utc).isoformat()
        payload = {
            "batchId": batch_id,
            "samples": samples,
        }
        payload_json = json.dumps(payload)

        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO pending_batches (batch_id, payload_json, sample_count, created_at, status)
                    VALUES (?, ?, ?, ?, 'PENDING')
                    """,
                    (batch_id, payload_json, len(samples), now_iso),
                )
                conn.commit()
                return True
        except sqlite3.IntegrityError:
            logger.warning(f"Batch ID '{batch_id}' already exists in local queue.")
            return False
        except Exception as e:
            logger.error(f"Failed to enqueue batch to local SQLite storage: {e}")
            return False

    def get_pending_batches(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Retrieves pending batches sorted by creation order."""
        batches = []
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT id, batch_id, payload_json, attempt_count, created_at, last_attempt_at
                    FROM pending_batches
                    WHERE status = 'PENDING'
                    ORDER BY id ASC
                    LIMIT ?
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()
                for row in rows:
                    batches.append({
                        "id": row["id"],
                        "batch_id": row["batch_id"],
                        "payload": json.loads(row["payload_json"]),
                        "attempt_count": row["attempt_count"],
                        "created_at": row["created_at"],
                        "last_attempt_at": row["last_attempt_at"],
                    })
        except Exception as e:
            logger.error(f"Failed to query pending batches from local SQLite: {e}")
        return batches

    def mark_batch_completed(self, batch_id: str) -> None:
        """Deletes/clears a successfully acknowledged batch from the local queue."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM pending_batches WHERE batch_id = ?", (batch_id,))
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to mark batch completed in local queue: {e}")

    def increment_attempt_count(self, batch_id: str) -> None:
        """Increments failed attempt count and updates last_attempt_at timestamp."""
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE pending_batches
                    SET attempt_count = attempt_count + 1, last_attempt_at = ?
                    WHERE batch_id = ?
                    """,
                    (now_iso, batch_id),
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to update attempt count for batch {batch_id}: {e}")

    def mark_batch_paused_auth_error(self, batch_id: str) -> None:
        """Marks a batch as PAUSED_AUTH_ERROR when backend returns permanent HTTP 401/403 device auth error."""
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE pending_batches
                    SET status = 'PAUSED_AUTH_ERROR', last_attempt_at = ?
                    WHERE batch_id = ?
                    """,
                    (now_iso, batch_id),
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to mark batch {batch_id} as PAUSED_AUTH_ERROR: {e}")

    def reset_paused_auth_batches(self) -> None:
        """Resets PAUSED_AUTH_ERROR batches back to PENDING after credential re-provisioning."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE pending_batches SET status = 'PENDING' WHERE status = 'PAUSED_AUTH_ERROR'")
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to reset paused auth error batches: {e}")

    def get_queue_depth(self) -> int:
        """Returns total number of pending batches in queue."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM pending_batches WHERE status = 'PENDING'")
                return cursor.fetchone()[0]
        except Exception:
            return 0
