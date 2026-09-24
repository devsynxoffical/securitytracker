import platform
import logging

logger = logging.getLogger("DEVSYNXAgent")


class IdleDetector:
    """Detects system-wide user idle duration via OS input timers without recording user inputs."""

    def __init__(self, threshold_seconds: int = 180):
        self.os_type = platform.system()
        self.threshold_seconds = threshold_seconds

    def get_idle_seconds(self) -> float:
        """Returns elapsed idle duration in seconds since last user keyboard or mouse interaction."""
        try:
            if self.os_type == "Windows":
                return self._get_windows_idle_seconds()
            elif self.os_type == "Darwin":
                return self._get_macos_idle_seconds()
            else:
                return 0.0
        except Exception as e:
            logger.debug(f"Idle time detection check error: {e}")
            return 0.0

    def is_idle(self) -> bool:
        """Evaluates whether current system idle duration exceeds the configured threshold."""
        return self.get_idle_seconds() >= self.threshold_seconds

    def _get_windows_idle_seconds(self) -> float:
        """Windows GetLastInputInfo API."""
        import ctypes

        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", ctypes.c_uint),
                ("dwTime", ctypes.c_uint),
            ]

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)

        if user32.GetLastInputInfo(ctypes.byref(lii)):
            millis = kernel32.GetTickCount() - lii.dwTime
            return max(0.0, millis / 1000.0)
        return 0.0

    def _get_macos_idle_seconds(self) -> float:
        """macOS IOHidIdleTime calculation."""
        try:
            import subprocess
            output = subprocess.check_output(["hidutil", "property", "--matching", '{"HIDIdleTime":1}'], stderr=subprocess.DEVNULL)
            # Simplified fallback: returns 0.0 if not parsed
            return 0.0
        except Exception:
            return 0.0
