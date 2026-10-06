'use client';

import { useState } from 'react';
import {
  Shield,
  Download,
  Monitor,
  Apple,
  Lock,
  ArrowRight,
  Activity,
  Users,
  CheckCircle2,
  Sparkles,
  Layers,
  ChevronRight,
  BarChart3,
  Clock,
  PhoneCall,
  Laptop,
  Check,
  Zap,
} from 'lucide-react';

export default function PublicLandingPage() {
  const [downloadModal, setDownloadModal] = useState<'windows' | 'mac' | null>(null);

  const MAC_RELEASE_URL = 'https://github.com/devsynxoffical/securitytracker/releases/download/v1.0.0/WorkPulse-Mac-Universal.dmg';
  const WIN_RELEASE_URL = 'https://github.com/devsynxoffical/securitytracker/releases/download/v1.0.0/WorkPulse-Windows-x64.zip';

  const triggerDownload = (os: 'windows' | 'mac') => {
    setDownloadModal(os);
    const fileName = os === 'windows' ? 'WorkPulse-Windows-x64.zip' : 'WorkPulse-Mac-Universal.dmg';
    const downloadUrl = os === 'mac' ? MAC_RELEASE_URL : WIN_RELEASE_URL;
    
    try {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch (e) {
      window.location.href = downloadUrl;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFBF9] text-[#151A1E] font-sans selection:bg-[#E3F1EE] selection:text-[#0B5548]">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#E4E7E1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="WorkPulse Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="font-bold text-base tracking-tight">WorkPulse</span>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-[10.5px]">
              Enterprise OS v2.4
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-[#5C666E]">
            <a href="#features" className="hover:text-[#0B5548] transition">Platform Features</a>
            <a href="#downloads" className="hover:text-[#0B5548] transition">Workstation Downloads</a>
            <a href="#crm" className="hover:text-[#0B5548] transition">ClickUp CRM</a>
            <a href="#security" className="hover:text-[#0B5548] transition">Security &amp; RBAC</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="#downloads"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F6B5C] hover:bg-[#0B5548] text-white text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Workstation</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E3F1EE] border border-[#BDE3DB] text-[#0B5548] font-semibold text-xs mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Complete Workforce Intelligence &amp; Multi-View CRM Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#151A1E] tracking-tight max-w-4xl mx-auto leading-tight">
            Workstation Telemetry, Live Attendance &amp; <span className="text-[#0F6B5C]">ClickUp CRM</span> in One OS
          </h1>

          <p className="mt-6 text-base sm:text-lg text-[#5C666E] max-w-2xl mx-auto leading-relaxed">
            Eliminate fragmented tools. Deploy zero-latency background agents for employee hardware tracking, attendance shifts, mass calling sheets, and high-velocity sales pipelines.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => triggerDownload('windows')}
              className="px-6 py-3.5 rounded-xl bg-[#0F6B5C] hover:bg-[#0B5548] text-white font-semibold text-sm shadow-md flex items-center gap-2.5 transition"
            >
              <Monitor className="w-4 h-4" />
              <span>Download for Windows (.exe)</span>
            </button>

            <button
              onClick={() => triggerDownload('mac')}
              className="px-6 py-3.5 rounded-xl bg-white border border-[#E4E7E1] hover:border-[#0F6B5C] hover:bg-[#FAFBF9] text-[#151A1E] font-semibold text-sm shadow-sm flex items-center gap-2.5 transition"
            >
              <Apple className="w-4 h-4 text-[#151A1E]" />
              <span>Download for macOS (.dmg)</span>
            </button>
          </div>

          {/* Quick Stats Pill */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left">
            <div className="bg-white border border-[#E4E7E1] rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] text-[#8A939B] font-medium">Tracking Frequency</div>
              <div className="text-xl font-bold font-mono text-[#0F6B5C] mt-0.5">Real-Time (10s)</div>
            </div>
            <div className="bg-white border border-[#E4E7E1] rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] text-[#8A939B] font-medium">CRM Multi-Views</div>
              <div className="text-xl font-bold font-mono text-[#151A1E] mt-0.5">5 ClickUp Modes</div>
            </div>
            <div className="bg-white border border-[#E4E7E1] rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] text-[#8A939B] font-medium">Database Layer</div>
              <div className="text-xl font-bold font-mono text-[#1C469B] mt-0.5">PostgreSQL 16</div>
            </div>
            <div className="bg-white border border-[#E4E7E1] rounded-xl p-3.5 shadow-sm">
              <div className="text-[11px] text-[#8A939B] font-medium">Audit Compliance</div>
              <div className="text-xl font-bold font-mono text-[#0F6B5C] mt-0.5">Zero-Trust Logs</div>
            </div>
          </div>
        </div>
      </section>

      {/* Downloads Section */}
      <section id="downloads" className="py-16 bg-white border-y border-[#E4E7E1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAFBF9] border border-[#E4E7E1] text-[#5C666E] font-semibold text-xs mb-3">
              <Download className="w-3.5 h-3.5 text-[#0F6B5C]" />
              <span>Native Workstation Deployments</span>
            </div>
            <h2 className="text-3xl font-extrabold text-[#151A1E] tracking-tight">
              Download the WorkPulse Desktop Client
            </h2>
            <p className="mt-3 text-sm text-[#5C666E]">
              Install the lightweight Electron &amp; .NET 8 background workstation client for staff check-ins, outbound CRM calling, and hardware telemetry.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Windows Card */}
            <div className="bg-[#FAFBF9] border-2 border-[#E4E7E1] hover:border-[#0F6B5C] rounded-2xl p-6 transition shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#E3F1EE] text-[#0B5548] flex items-center justify-center">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-bold text-xs">
                    64-bit Windows
                  </span>
                </div>

                <h3 className="text-lg font-bold text-[#151A1E] mt-4">WorkPulse for Windows</h3>
                <p className="text-xs text-[#5C666E] mt-1.5">
                  Compatible with Windows 10, Windows 11, and Windows Server 2022. Auto-starts with user login and syncs offline buffer.
                </p>

                <div className="mt-4 space-y-2 text-xs text-[#4A535B]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6B5C]" />
                    <span>Includes .NET 8 Background Agent &amp; Electron UI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6B5C]" />
                    <span>Automated Outbound Softphone Dialer &amp; CRM Sync</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6B5C]" />
                    <span>Hardware enrollment via unique PC machine code</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#EEF0EC] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#8A939B]">Installer Format</div>
                  <div className="font-mono font-semibold text-xs text-[#151A1E]">WorkPulse-Setup-x64.exe</div>
                </div>
                <a
                  href="/downloads/WorkPulse-Setup-x64.exe"
                  download="WorkPulse-Setup-x64.exe"
                  onClick={() => triggerDownload('windows')}
                  className="px-4 py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs flex items-center gap-2 shadow-sm transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .EXE</span>
                </a>
              </div>
            </div>

            {/* macOS Card */}
            <div className="bg-[#FAFBF9] border-2 border-[#E4E7E1] hover:border-[#151A1E] rounded-2xl p-6 transition shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#ECEEEB] text-[#151A1E] flex items-center justify-center">
                    <Apple className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ECEEEB] text-[#151A1E] font-bold text-xs">
                    Universal Binary
                  </span>
                </div>

                <h3 className="text-lg font-bold text-[#151A1E] mt-4">WorkPulse for macOS</h3>
                <p className="text-xs text-[#5C666E] mt-1.5">
                  Universal binary optimized for Apple Silicon (M1/M2/M3/M4) and Intel Macs. macOS 13+ Ventura, Sonoma, &amp; Sequoia.
                </p>

                <div className="mt-4 space-y-2 text-xs text-[#4A535B]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#151A1E]" />
                    <span>Native Apple Silicon ARM64 &amp; x64 Performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#151A1E]" />
                    <span>Low Battery Consumption (&lt; 1% CPU utilization)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#151A1E]" />
                    <span>ClickUp Subtask &amp; Time Tracking Stopwatch</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#EEF0EC] flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#8A939B]">Disk Image Format</div>
                  <div className="font-mono font-semibold text-xs text-[#151A1E]">WorkPulse-Mac-Universal.dmg</div>
                </div>
                <a
                  href="/downloads/WorkPulse-Mac-Universal.dmg"
                  download="WorkPulse-Mac-Universal.dmg"
                  onClick={() => triggerDownload('mac')}
                  className="px-4 py-2 bg-[#151A1E] hover:bg-black text-white rounded-lg font-semibold text-xs flex items-center gap-2 shadow-sm transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .DMG</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-extrabold text-[#151A1E] tracking-tight">
              Enterprise-Grade Capabilities Built for Modern Companies
            </h2>
            <p className="mt-3 text-sm text-[#5C666E]">
              Every tool required to manage employees, monitor productivity, assign calling sheets, and audit actions.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-[#E4E7E1] rounded-xl p-5 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#E3F1EE] text-[#0B5548] flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[#151A1E]">Live Floor Attendance Board</h3>
              <p className="text-xs text-[#5C666E] leading-relaxed">
                Real-time active application telemetry, working shifts, break logs, keystrokes, and mouse activity without intrusive screen capture or keylogging.
              </p>
            </div>

            <div className="bg-white border border-[#E4E7E1] rounded-xl p-5 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#E6EDFB] text-[#1C469B] flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[#151A1E]">ClickUp-Style Multi-View CRM</h3>
              <p className="text-xs text-[#5C666E] leading-relaxed">
                List View, Kanban Pipeline Board, Calling Sheet Matrix, Calendar, and Daily Target Dashboards with subtask checklists and built-in time tracking.
              </p>
            </div>

            <div className="bg-white border border-[#E4E7E1] rounded-xl p-5 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#EEE8FA] text-[#55359C] flex items-center justify-center font-bold">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-[#151A1E]">Zero-Trust Hardware RBAC</h3>
              <p className="text-xs text-[#5C666E] leading-relaxed">
                Multi-tenant tenant isolation, cryptographic device enrollment approval, immutable PostgreSQL audit logs, and strict endpoint permissions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download CTA Banner */}
      <section className="bg-[#0B5548] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">Ready to deploy WorkPulse to your workforce?</h2>
            <p className="text-xs text-white/80 mt-1">
              Download the workstation background agent to start tracking shifts and managing calling leads.
            </p>
          </div>
          <a
            href="#downloads"
            className="px-6 py-3 bg-white text-[#0B5548] hover:bg-[#FAFBF9] rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            <span>Download Workstation Client</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#E4E7E1] py-8 text-xs text-[#8A939B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.jpg" alt="WorkPulse" className="w-5 h-5 rounded object-cover" />
            <span className="font-bold text-[#151A1E]">WorkPulse Company OS</span>
            <span>&bull; © 2026 DEVSYNX. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#downloads" className="hover:underline">Windows &amp; Mac Client</a>
            <span className="font-mono text-[#0F6B5C]">https://roofingclients.us/api/v1</span>
          </div>
        </div>
      </footer>

      {/* Download Modal */}
      {downloadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4E7E1] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {downloadModal === 'windows' ? (
                  <Monitor className="w-5 h-5 text-[#0F6B5C]" />
                ) : (
                  <Apple className="w-5 h-5 text-[#151A1E]" />
                )}
                <h3 className="font-bold text-sm text-[#151A1E]">
                  WorkPulse for {downloadModal === 'windows' ? 'Windows (.exe)' : 'macOS (.dmg)'}
                </h3>
              </div>
              <button
                onClick={() => setDownloadModal(null)}
                className="text-[#8A939B] hover:text-[#151A1E]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#E4F4EB] text-[#14673F] rounded-lg font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Download started! Saving {downloadModal === 'windows' ? 'WorkPulse-Setup-x64.exe' : 'WorkPulse-Mac-Universal.dmg'}</span>
              </div>

              <p className="text-[#5C666E]">
                Once downloaded, open the installer to launch the WorkPulse workstation client on your computer.
              </p>

              {/* Direct fallback download links */}
              <div className="pt-2 border-t border-[#EEF0EC] space-y-2">
                <div className="text-[11px] text-[#8A939B]">If download did not start automatically:</div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={downloadModal === 'windows' ? '/downloads/WorkPulse-Setup-x64.exe' : '/downloads/WorkPulse-Mac-Universal.dmg'}
                    download={downloadModal === 'windows' ? 'WorkPulse-Setup-x64.exe' : 'WorkPulse-Mac-Universal.dmg'}
                    className="px-3.5 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Direct Download {downloadModal === 'windows' ? '.EXE' : '.DMG'}</span>
                  </a>

                  <a
                    href="/downloads/WorkPulse-Mac-Installer.zip"
                    download="WorkPulse-Workstation.zip"
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#4A535B] font-semibold rounded-lg text-xs flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .ZIP</span>
                  </a>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  onClick={() => setDownloadModal(null)}
                  className="px-4 py-1.5 bg-[#151A1E] hover:bg-black text-white rounded-lg font-semibold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
