# DEVSYNX Desktop Activity Agent

Cross-platform background activity agent (Windows / macOS) for the DEVSYNX Employee Activity Tracker.

## Prerequisites
- Python 3.8 or higher
- Provisioned `device_id` and secret `device_token` from the DEVSYNX Dashboard / Admin API.

## Setup Instructions

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Create configuration file:
   ```bash
   cp config.example.json config.json
   ```

3. Edit `config.json` with your backend URL and provisioned device credentials:
   ```json
   {
     "backend_url": "http://localhost:4000",
     "device_id": "your-device-uuid",
     "device_token": "devsynx_dev_your_secret_token",
     "sample_interval_seconds": 5,
     "idle_threshold_seconds": 180,
     "upload_interval_seconds": 60,
     "window_title_enabled": false
   }
   ```

4. Run the Desktop Agent:
   ```bash
   python src/main.py
   ```

5. Package standalone executable (Windows `.exe`):
   ```bash
   python build_agent.py
   ```
   Generates `agent/dist/devsynx-agent.exe`.

6. Run full test suite (24 unit & e2e tests):
   ```bash
   python -m pytest
   ```

For production deployment details, auto-start options, and macOS launchd setup, see [`docs/deployment.md`](file:///d:/devsynx-activity-tracker/docs/deployment.md).

