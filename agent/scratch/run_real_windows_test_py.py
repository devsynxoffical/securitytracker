import os
import sys

agent_dir = os.path.abspath("agent")
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

import time
import json
import uuid
import subprocess
import requests

from src.config import Config
from src.device_identity import DeviceIdentity
from src.api_client import ApiClient
from src.storage.queue import LocalQueue
from src.activity.collector import ForegroundAppCollector
from src.activity.idle import IdleDetector
from src.activity.session import SessionAggregator
from src.uploader.worker import UploadWorker

BACKEND_URL = "http://localhost:4000"

def run_real_windows_verification():
    print("=== Starting Real Windows Hardware & Python Verification ===")
    scratch_dir = os.path.dirname(os.path.abspath(__file__))
    setup_script = os.path.abspath("backend/tests/setup_real_device.ts")
    
    # 1. Seed device and user via setup script
    setup_proc = subprocess.run(f'npx tsx "{setup_script}"', cwd="d:\\devsynx-activity-tracker\\backend", shell=True, capture_output=True, text=True)
    if setup_proc.returncode != 0:
        print(f"[FAIL] Database setup failed: {setup_proc.stderr}")
        return False
        
    creds_file = os.path.join(scratch_dir, "test_device_creds.json")
    with open(creds_file, "r") as f:
        creds = json.load(f)
        
    emp_id = creds["employeeId"]
    device_id = creds["deviceId"]
    raw_device_token = creds["rawDeviceToken"]
    
    print(f"[OK] Seeded Employee: {emp_id}")
    print(f"[OK] Seeded Device: {device_id}")
    
    test_db_path = os.path.join(scratch_dir, "real_agent_test.sqlite")
    if os.path.exists(test_db_path):
        try:
            os.remove(test_db_path)
        except Exception:
            pass
            
    # 2. Instantiate real agent components
    config = Config(
        backend_url=BACKEND_URL,
        device_id=device_id,
        device_token=raw_device_token,
        sample_interval_seconds=1,
        idle_threshold_seconds=180,
        upload_interval_seconds=2,
        window_title_enabled=True,
        db_path=test_db_path
    )
    
    device_identity = DeviceIdentity(config)
    api_client = ApiClient(config, device_identity)
    queue = LocalQueue(db_path=test_db_path)
    collector = ForegroundAppCollector()
    idle_detector = IdleDetector(threshold_seconds=config.idle_threshold_seconds)
    aggregator = SessionAggregator()
    uploader = UploadWorker(config, queue, api_client)
    
    uploader.start()
    
    print("Running sampling loop for 10 seconds capturing real Windows desktop active windows...")
    start_t = time.time()
    while time.time() - start_t < 10:
        is_idle = idle_detector.is_idle()
        app_info = collector.get_foreground_app(window_title_enabled=True)
        aggregator.add_sample(
            app_name=app_info["app_name"],
            window_title=app_info["window_title"],
            is_idle=is_idle
        )
        completed = aggregator.get_and_flush_completed_sessions()
        if completed:
            batch_id = f"BATCH-REAL-{uuid.uuid4()}"
            queue.enqueue_batch(batch_id, completed)
            print(f"[OK] Enqueued batch '{batch_id}' with {len(completed)} session(s)")
            
        time.sleep(1)
        
    print("Executing agent graceful shutdown (closing active session & flushing queue)...")
    aggregator.close_current_session()
    remaining = aggregator.get_and_flush_completed_sessions()
    if remaining:
        batch_id = f"BATCH-SHUTDOWN-{uuid.uuid4()}"
        queue.enqueue_batch(batch_id, remaining)
        print(f"[OK] Final session batch '{batch_id}' saved to queue")
        
    uploader.process_queue_once()
    uploader.stop()
    
    # 3. Verify activity records in backend database via Prisma query
    time.sleep(2)
    verify_cmd = f'npx tsx "{setup_script}" verify "{emp_id}"'
    verify_proc = subprocess.run(verify_cmd, cwd="d:\\devsynx-activity-tracker\\backend", shell=True, capture_output=True, text=True)
    
    if verify_proc.returncode != 0:
        print(f"[FAIL] Session verification script error: {verify_proc.stderr}")
        return False
        
    json_line = None
    for line in verify_proc.stdout.splitlines():
        if line.startswith("RESULT_JSON="):
            json_line = line.replace("RESULT_JSON=", "").strip()
            break
            
    if not json_line:
        print(f"[FAIL] Could not find RESULT_JSON line in stdout:\n{verify_proc.stdout}")
        return False
        
    sessions = json.loads(json_line)
    print(f"[OK] Total Ingested Sessions Count: {len(sessions)}")
    
    if len(sessions) > 0:
        for idx, s in enumerate(sessions):
            print(f"   Session #{idx+1}: App='{s.get('appName')}' | Window='{s.get('windowTitle')}' | Duration={s.get('durationSeconds')}s | Device={s.get('deviceId')} | User={s.get('userId')}")
            
        print("\n=== Real Windows Hardware & Binary Verification SUCCESSFUL ===")
        return True
    else:
        print("[FAIL] Zero activity sessions ingested by backend.")
        return False

if __name__ == "__main__":
    success = run_real_windows_verification()
    sys.exit(0 if success else 1)
