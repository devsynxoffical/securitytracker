import os
import sys
import platform
import logging
from typing import Dict, Optional

logger = logging.getLogger("DEVSYNXAgent")


class ForegroundAppCollector:
    """Detects the currently active/foreground application on Windows and macOS."""

    def __init__(self):
        self.os_type = platform.system()

    def get_foreground_app(self, window_title_enabled: bool = False) -> Dict[str, Optional[str]]:
        """
        Detects active application name and optional window title.
        Returns dict: {"app_name": str, "window_title": Optional[str]}
        """
        try:
            if self.os_type == "Windows":
                return self._get_windows_foreground_app(window_title_enabled)
            elif self.os_type == "Darwin":
                return self._get_macos_foreground_app(window_title_enabled)
            else:
                return {"app_name": "Generic Desktop Environment", "window_title": None}
        except Exception as e:
            logger.debug(f"Foreground application detection error: {e}")
            return {"app_name": "Unknown Application", "window_title": None}

    def _get_windows_foreground_app(self, window_title_enabled: bool) -> Dict[str, Optional[str]]:
        """Windows API foreground window detection via ctypes."""
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return {"app_name": "System Idle / Lock Screen", "window_title": None}

        window_title: Optional[str] = None
        if window_title_enabled:
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                window_title = buf.value

        # Get Process ID
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

        if not pid.value:
            return {"app_name": "System", "window_title": window_title}

        # Query process image path
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h_process = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)

        app_name = f"Process-{pid.value}"
        if h_process:
            try:
                buf_size = wintypes.DWORD(1024)
                exe_buf = ctypes.create_unicode_buffer(1024)
                if kernel32.QueryFullProcessImageNameW(h_process, 0, exe_buf, ctypes.byref(buf_size)):
                    exe_path = exe_buf.value
                    app_name = os.path.basename(exe_path)
            finally:
                kernel32.CloseHandle(h_process)

        # Clean app name extension for readability (e.g. "chrome.exe" -> "chrome")
        if app_name.lower().endswith(".exe"):
            app_name = app_name[:-4].capitalize()

        return {
            "app_name": app_name or "Unknown Application",
            "window_title": window_title,
        }

    def _get_macos_foreground_app(self, window_title_enabled: bool) -> Dict[str, Optional[str]]:
        """macOS frontmost application detection via AppKit or NSWorkspace stub."""
        try:
            from AppKit import NSWorkspace
            curr_app = NSWorkspace.sharedWorkspace().frontmostApplication()
            app_name = curr_app.localizedName() if curr_app else "macOS Desktop"
            return {
                "app_name": app_name or "macOS Application",
                "window_title": None,  # Window titles require Accessibility permissions on macOS
            }
        except ImportError:
            # Fallback for environment without PyObjC
            return {
                "app_name": "macOS Application",
                "window_title": None,
            }
