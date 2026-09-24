from datetime import datetime, timezone, timedelta
from src.activity.session import SessionAggregator, parse_utc_iso_string


def test_session_merging_same_app():
    aggregator = SessionAggregator()
    t0 = datetime(2026, 9, 18, 10, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(seconds=5)
    t2 = t0 + timedelta(seconds=10)

    # 3 consecutive samples of Google Chrome
    aggregator.add_sample("Google Chrome", "Tab 1", is_idle=False, sample_time=t0)
    aggregator.add_sample("Google Chrome", "Tab 1", is_idle=False, sample_time=t1)
    aggregator.add_sample("Google Chrome", "Tab 2", is_idle=False, sample_time=t2)

    # No completed sessions flushed yet because app hasn't switched
    completed = aggregator.get_and_flush_completed_sessions()
    assert len(completed) == 0

    # Explicitly close current session
    aggregator.close_current_session()
    completed = aggregator.get_and_flush_completed_sessions()

    assert len(completed) == 1
    session = completed[0]
    assert session["appName"] == "Google Chrome"
    assert session["durationSeconds"] == 10
    assert session["isIdle"] is False


def test_session_app_switch_transition():
    aggregator = SessionAggregator()
    t0 = datetime(2026, 9, 18, 10, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(seconds=5)

    # Sample 1: Chrome
    aggregator.add_sample("Google Chrome", "Tab 1", is_idle=False, sample_time=t0)
    # Sample 2: VS Code (App Switch!)
    aggregator.add_sample("Visual Studio Code", "main.py", is_idle=False, sample_time=t1)

    # Chrome session should now be completed
    completed = aggregator.get_and_flush_completed_sessions()
    assert len(completed) == 1
    assert completed[0]["appName"] == "Google Chrome"
    assert completed[0]["durationSeconds"] == 5

    # Close VS Code
    aggregator.close_current_session()
    completed_vs = aggregator.get_and_flush_completed_sessions()
    assert len(completed_vs) == 1
    assert completed_vs[0]["appName"] == "Visual Studio Code"


def test_session_idle_state_transition():
    aggregator = SessionAggregator()
    t0 = datetime(2026, 9, 18, 10, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(seconds=180)

    # User active on Chrome
    aggregator.add_sample("Google Chrome", "Tab 1", is_idle=False, sample_time=t0)
    # User becomes idle on Chrome
    aggregator.add_sample("System Idle", None, is_idle=True, sample_time=t1)

    completed = aggregator.get_and_flush_completed_sessions()
    assert len(completed) == 1
    assert completed[0]["appName"] == "Google Chrome"
    assert completed[0]["isIdle"] is False
    assert completed[0]["durationSeconds"] == 180

    aggregator.close_current_session()
    idle_completed = aggregator.get_and_flush_completed_sessions()
    assert len(idle_completed) == 1
    assert idle_completed[0]["appName"] == "System Idle"
    assert idle_completed[0]["isIdle"] is True
