from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any


def get_utc_iso_string(dt: Optional[datetime] = None) -> str:
    """Returns ISO 8601 formatted UTC timestamp string ending with 'Z'."""
    now_dt = dt or datetime.now(timezone.utc)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    return now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc_iso_string(iso_str: str) -> datetime:
    """Parses ISO 8601 timestamp string to datetime object."""
    clean_str = iso_str.replace("Z", "+00:00")
    return datetime.fromisoformat(clean_str)


@dataclass
class Session:
    appName: str
    windowTitle: Optional[str]
    startedAt: str
    endedAt: str
    isIdle: bool
    durationSeconds: int = 0

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "appName": self.appName,
            "startedAt": self.startedAt,
            "endedAt": self.endedAt,
            "isIdle": self.isIdle,
            "durationSeconds": self.durationSeconds,
        }
        if self.windowTitle is not None:
            d["windowTitle"] = self.windowTitle
        return d


class SessionAggregator:
    """
    Merges consecutive 5-second samples of the same application and idle state
    into contiguous activity sessions. Closes sessions on app switches or idle state transitions.
    """

    def __init__(self):
        self.current_session: Optional[Session] = None
        self._current_start_dt: Optional[datetime] = None
        self._current_last_sample_dt: Optional[datetime] = None
        self._completed_sessions: List[Session] = []

    def add_sample(
        self,
        app_name: str,
        window_title: Optional[str] = None,
        is_idle: bool = False,
        sample_time: Optional[datetime] = None,
    ) -> None:
        """Processes a sample timestamp. Merges into active session or closes current and starts new session."""
        now_dt = sample_time or datetime.now(timezone.utc)
        if now_dt.tzinfo is None:
            now_dt = now_dt.replace(tzinfo=timezone.utc)

        iso_str = get_utc_iso_string(now_dt)

        if self.current_session is None:
            # Start initial session
            self._current_start_dt = now_dt
            self._current_last_sample_dt = now_dt
            self.current_session = Session(
                appName=app_name,
                windowTitle=window_title,
                startedAt=iso_str,
                endedAt=iso_str,
                isIdle=is_idle,
                durationSeconds=0,
            )
            return

        # Check if sample matches active session criteria
        same_app = self.current_session.appName == app_name
        same_idle = self.current_session.isIdle == is_idle

        if same_app and same_idle:
            # Update end time and duration of current session
            self._current_last_sample_dt = now_dt
            self.current_session.endedAt = iso_str
            duration = int((now_dt - self._current_start_dt).total_seconds())
            self.current_session.durationSeconds = max(0, duration)
            if window_title and not self.current_session.windowTitle:
                self.current_session.windowTitle = window_title
        else:
            # Transition detected! Finalize current session & start new session
            self._finalize_current_session(final_time=now_dt)

            self._current_start_dt = now_dt
            self._current_last_sample_dt = now_dt
            self.current_session = Session(
                appName=app_name,
                windowTitle=window_title,
                startedAt=iso_str,
                endedAt=iso_str,
                isIdle=is_idle,
                durationSeconds=0,
            )

    def _finalize_current_session(self, final_time: Optional[datetime] = None) -> None:
        if self.current_session is None or self._current_start_dt is None:
            return

        now_dt = final_time or self._current_last_sample_dt or datetime.now(timezone.utc)
        if now_dt.tzinfo is None:
            now_dt = now_dt.replace(tzinfo=timezone.utc)

        duration = int((now_dt - self._current_start_dt).total_seconds())
        if duration <= 0:
            now_dt = datetime.fromtimestamp(self._current_start_dt.timestamp() + 1, tz=timezone.utc)
            duration = 1

        self.current_session.endedAt = get_utc_iso_string(now_dt)
        self.current_session.durationSeconds = duration

        self._completed_sessions.append(self.current_session)
        self.current_session = None
        self._current_start_dt = None
        self._current_last_sample_dt = None

    def close_current_session(self) -> None:
        """Explicitly closes and flushes active session (e.g. during application shutdown)."""
        self._finalize_current_session()

    def get_and_flush_completed_sessions(self) -> List[Dict[str, Any]]:
        """Returns completed sessions formatted for API ingestion, flushing the internal completed buffer."""
        result = [s.to_dict() for s in self._completed_sessions]
        self._completed_sessions.clear()
        return result
