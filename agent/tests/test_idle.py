from src.activity.idle import IdleDetector


def test_idle_detector_threshold():
    detector = IdleDetector(threshold_seconds=180)

    # Mock idle time below threshold (e.g. 50s)
    detector._get_windows_idle_seconds = lambda: 50.0
    detector._get_macos_idle_seconds = lambda: 50.0

    assert detector.is_idle() is False

    # Mock idle time exceeding threshold (e.g. 200s)
    detector._get_windows_idle_seconds = lambda: 200.0
    detector._get_macos_idle_seconds = lambda: 200.0

    assert detector.is_idle() is True
