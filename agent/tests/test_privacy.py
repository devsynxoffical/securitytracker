import os
import glob
import pytest

PROHIBITED_MODULES = [
    "pynput",
    "keyboard",
    "pyautogui",
    "mss",
    "PIL",
    "ImageGrab",
    "pyperclip",
    "cv2",
    "sounddevice",
    "pyaudio",
    "webbrowser",
    "sqlite3_browser_history",
]

PROHIBITED_KEYWORDS = [
    "keylog",
    "keystroke",
    "screenshot",
    "screen_record",
    "clipboard_get",
    "webcam",
    "microphone_record",
]


def test_privacy_no_prohibited_dependencies_in_requirements():
    req_file = os.path.join(os.path.dirname(__file__), "..", "requirements.txt")
    if os.path.exists(req_file):
        with open(req_file, "r", encoding="utf-8") as f:
            content = f.read().lower()
            for mod in PROHIBITED_MODULES:
                assert mod.lower() not in content, f"PRIVACY VIOLATION: Prohibited library '{mod}' found in requirements.txt"


def test_privacy_no_prohibited_imports_in_source_code():
    src_dir = os.path.join(os.path.dirname(__file__), "..", "src")
    python_files = glob.glob(os.path.join(src_dir, "**", "*.py"), recursive=True)

    for file_path in python_files:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

            # Check for prohibited library imports
            for mod in PROHIBITED_MODULES:
                import_pattern1 = f"import {mod}"
                import_pattern2 = f"from {mod}"
                assert import_pattern1 not in content, f"PRIVACY VIOLATION: '{import_pattern1}' found in {file_path}"
                assert import_pattern2 not in content, f"PRIVACY VIOLATION: '{import_pattern2}' found in {file_path}"

            # Check for prohibited surveillance capability keywords
            for kw in PROHIBITED_KEYWORDS:
                assert kw not in content.lower(), f"PRIVACY VIOLATION: Prohibited keyword '{kw}' found in {file_path}"
