; WorkPulse installer hooks (docs/09 section 7). Lives in installer/ (build/ is gitignored). Runs inside electron-builder's NSIS script.
; The tracker agent, native host and watchdog are bundled under $INSTDIR\resources\agent when the
; release was built with the agent (release-desktop.yml). Without them the app still installs and runs
; without app-level tracking; nothing here fails the install.

!macro customInstall
  IfFileExists "$INSTDIR\resources\agent\CompanyOS.Watchdog.exe" 0 agent_done
    DetailPrint "Registering Company OS Watchdog service"
    nsExec::ExecToLog 'sc.exe stop CompanyOSWatchdog'
    nsExec::ExecToLog 'sc.exe delete CompanyOSWatchdog'
    nsExec::ExecToLog 'sc.exe create CompanyOSWatchdog binPath= "$INSTDIR\resources\agent\CompanyOS.Watchdog.exe" start= auto obj= LocalSystem DisplayName= "Company OS Watchdog"'
    nsExec::ExecToLog 'sc.exe failure CompanyOSWatchdog reset= 86400 actions= restart/5000/restart/10000/restart/30000'
    nsExec::ExecToLog 'sc.exe description CompanyOSWatchdog "Starts the WorkPulse tracker agent in the user session and keeps it running."'
    ; Native messaging host manifest for Chrome and Edge (docs/09 section 5); the manifest ships with the agent files.
    IfFileExists "$INSTDIR\resources\agent\com.companyos.agent.json" 0 +3
      WriteRegStr HKLM "SOFTWARE\Google\Chrome\NativeMessagingHosts\com.companyos.agent" "" "$INSTDIR\resources\agent\com.companyos.agent.json"
      WriteRegStr HKLM "SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.companyos.agent" "" "$INSTDIR\resources\agent\com.companyos.agent.json"
    nsExec::ExecToLog 'sc.exe start CompanyOSWatchdog'
  agent_done:
!macroend

!macro customUnInstall
  IfFileExists "$INSTDIR\resources\agent\CompanyOS.Watchdog.exe" 0 unagent_done
    DetailPrint "Removing Company OS Watchdog service"
    nsExec::ExecToLog 'sc.exe stop CompanyOSWatchdog'
    nsExec::ExecToLog 'taskkill /F /IM CompanyOS.Agent.exe'
    nsExec::ExecToLog 'sc.exe delete CompanyOSWatchdog'
    DeleteRegKey HKLM "SOFTWARE\Google\Chrome\NativeMessagingHosts\com.companyos.agent"
    DeleteRegKey HKLM "SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.companyos.agent"
  unagent_done:
!macroend
