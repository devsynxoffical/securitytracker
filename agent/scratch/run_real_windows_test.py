import os
import sys
import time
import json
import signal
import subprocess
import requests

BACKEND_URL = "http://localhost:4000"

def run_real_windows_verification():
    print("=== Starting Real Windows Hardware & Binary Verification ===")
    scratch_dir = os.path.dirname(os.path.abspath(__file__))
    setup_script = os.path.abspath("backend/tests/setup_real_device.ts")
    
    # 1. Run setup node script to seed device & user in database
    print(f"Running database setup via {setup_script}...")
    setup_proc = subprocess.run(f'npx tsx "{setup_script}"', cwd="d:\\devsynx-activity-tracker\\backend", shell=True, capture_output=True, text=True)
    if setup_proc.returncode != 0:
        print(f"[FAIL] Database setup failed:\nSTDOUT:\n{setup_proc.stdout}\nSTDERR:\n{setup_proc.stderr}")
        return False
        
    creds_file = os.path.join(scratch_dir, "test_device_creds.json")
    if not os.path.exists(creds_file):
        print(f"[FAIL] Credentials file {creds_file} not found.")
        return False
        
    with open(creds_file, "r") as f:
        creds = json.load(f)
        
    admin_token = creds["adminToken"]
    emp_id = creds["employeeId"]
    device_id = creds["deviceId"]
    raw_device_token = creds["rawDeviceToken"]
    
    print(f"[OK] Seeded Employee: {emp_id}")
    print(f"[OK] Seeded Device: {device_id}")
    
    # 2. Write agent config.json
    test_db_path = os.path.join(scratch_dir, "real_agent_test.sqlite")
    if os.path.exists(test_db_path):
        try:
            os.remove(test_db_path)
        except Exception:
            pass
            
    config_data = {
        "backend_url": BACKEND_URL,
        "device_id": device_id,
        "device_token": raw_device_token,
        "sample_interval_seconds": 1,
        "idle_threshold_seconds": 180,
        "upload_interval_seconds": 2,
        "window_title_enabled": True,
        "db_path": test_db_path
    }
    
    config_file = os.path.join(scratch_dir, "config.json")
    with open(config_file, "w") as f:
        json.dump(config_data, f, indent=2)
        
    exe_path = os.path.abspath("agent/dist/devsynx-agent.exe")
    if not os.path.exists(exe_path):
        print(f"[FAIL] Compiled agent binary not found at {exe_path}")
        return False
        
    print(f"[OK] Launching standalone agent executable: {exe_path}")
    
    # 3. Launch compiled devsynx-agent.exe process
    agent_proc = subprocess.Popen([exe_path], cwd=scratch_dir)
    print(f"[OK] Executable process started with PID: {agent_proc.pid}")
    
    # 4. Monitor activity sampling on Windows desktop for 20 seconds, launching Notepad to trigger app switch session flush
    print("Running active sampling loop on Windows desktop...")
    time.sleep(5)
    
    print("Launching Notepad to trigger application focus switch...")
    notepad_proc = subprocess.Popen(["notepad.exe"])
    time.sleep(10)
    
    notepad_proc.terminate()
    time.sleep(5)
    
    # 5. Terminate agent process
    print("Terminating executable gracefully...")
    agent_proc.terminate()
    try:
        agent_proc.wait(timeout=5)
    except Exception:
        agent_proc.kill()
        
    print("[OK] Standalone agent executable terminated.")
    
    # 6. Verify activity records in backend database via Prisma query
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
        
    try:
        sessions = json.loads(json_line)
    except Exception as e:
        print(f"[FAIL] Could not parse session json from stdout ({json_line}): {e}")
        return False
        
    print(f"[OK] Total Ingested Sessions Count: {len(sessions)}")
    
    if len(sessions) > 0:
        for idx, s in enumerate(sessions):
            print(f"   Session #{idx+1}: App='{s.get('appName')}' | Window='{s.get('windowTitle')}' | Duration={s.get('durationSeconds')}s | Device={s.get('deviceId')} | User={s.get('userId')}")
            
        print("\n=== Real Windows Binary & Hardware Verification SUCCESSFUL ===")
        return True
    else:
        print("[FAIL] Zero activity sessions ingested by backend.")
        return False

if __name__ == "__main__":
    success = run_real_windows_verification()
    sys.exit(0 if success else 1)
