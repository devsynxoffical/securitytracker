import os
import sys
import subprocess
import PyInstaller.__main__

def build():
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    main_script = os.path.join(agent_dir, "src", "main.py")
    dist_dir = os.path.join(agent_dir, "dist")
    build_dir = os.path.join(agent_dir, "build")
    
    print(f"Building DEVSYNX Desktop Agent executable from {main_script}...")
    
    args = [
        main_script,
        "--onefile",
        "--name=devsynx-agent",
        f"--distpath={dist_dir}",
        f"--workpath={build_dir}",
        f"--specpath={agent_dir}",
        f"--paths={os.path.join(agent_dir, 'src')}",
        "--clean",
        "--noconfirm"
    ]
    
    PyInstaller.__main__.run(args)
    print(f"\n[SUCCESS] Standalone executable successfully built at: {os.path.join(dist_dir, 'devsynx-agent.exe')}")

if __name__ == "__main__":
    build()
