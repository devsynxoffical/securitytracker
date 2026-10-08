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
  Star,
  ArrowUpRight,
  ArrowDownRight,
  GraduationCap,
  Building2,
  Settings,
  TrendingUp,
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
    <div className="min-h-screen bg-[#F0F2F5] text-[#1E293B] font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Floating Glass Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10B981] via-[#16A34A] to-[#65A30D] flex items-center justify-center text-white shadow-sm font-bold text-sm">
              WP
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">WorkPulse</span>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[10px] tracking-wide uppercase">
                Enterprise OS v2.4
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600">
            <a href="#features" className="hover:text-emerald-600 transition">Platform Features</a>
            <a href="#downloads" className="hover:text-emerald-600 transition">Workstation Downloads</a>
            <a href="#crm" className="hover:text-emerald-600 transition">ClickUp CRM</a>
            <a href="#security" className="hover:text-emerald-600 transition">Security &amp; RBAC</a>
            <a href="/admin" className="text-[#2563EB] hover:text-blue-700 font-bold transition flex items-center gap-1">
              Admin Portal <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="#downloads"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Workstation</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24">
        {/* Subtle Ambient Background Glows */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-emerald-200/40 via-blue-100/30 to-lime-200/40 blur-3xl -z-10 pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/90 text-emerald-700 font-bold text-xs mb-6 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Complete Workforce Intelligence &amp; Multi-View CRM Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight max-w-4xl mx-auto leading-[1.15]">
            Workstation Telemetry, Live Attendance &amp; <span className="bg-gradient-to-r from-[#10B981] via-[#16A34A] to-[#65A30D] bg-clip-text text-transparent">ClickUp CRM</span> in One OS
          </h1>

          <p className="mt-5 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            Eliminate fragmented tools. Deploy zero-latency background agents for employee hardware tracking, attendance shifts, mass calling sheets, and high-velocity sales pipelines.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={() => triggerDownload('windows')}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#16A34A] to-[#65A30D] hover:opacity-95 text-white font-bold text-xs tracking-wide shadow-md flex items-center gap-2.5 transition"
            >
              <Monitor className="w-4 h-4" />
              <span>Download for Windows (.exe)</span>
            </button>

            <button
              onClick={() => triggerDownload('mac')}
              className="px-6 py-3.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-900 font-bold text-xs tracking-wide shadow-sm flex items-center gap-2.5 transition"
            >
              <Apple className="w-4 h-4 text-slate-900" />
              <span>Download for macOS (.dmg)</span>
            </button>

            <a
              href="/admin"
              className="px-6 py-3.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs tracking-wide shadow-sm flex items-center gap-2 transition"
            >
              <span>Launch Admin Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* KPI Stat Cards Matching Screenshot Theme */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Tracking Rate</div>
              <div className="text-2xl font-black font-mono text-emerald-600 mt-1">Real-Time (10s)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Zero-lag pulse telemetry</div>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">CRM Layouts</div>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">5 ClickUp Modes</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Matrix, Kanban, Table, etc.</div>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Database Engine</div>
              <div className="text-2xl font-black font-mono text-[#2563EB] mt-1">PostgreSQL 16</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Supabase Enterprise Pooler</div>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Hardware RBAC</div>
              <div className="text-2xl font-black font-mono text-emerald-600 mt-1">Zero-Trust Logs</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Cryptographic machine codes</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive UI Showcase: Matches the Screenshot Theme */}
      <section className="py-12 bg-white border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#2563EB] font-bold text-xs mb-3">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Executive Dashboard Design</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              A Unified Control Center for Operations &amp; Growth
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Clean typography, real-time wave telemetry, and full visibility across your entire remote workforce.
            </p>
          </div>

          {/* Interactive Reference-Style Dashboard Mockup */}
          <div className="bg-[#F0F2F5] border border-slate-300/80 rounded-2xl p-5 sm:p-7 shadow-xl max-w-5xl mx-auto">
            {/* Top Dashboard Header Card */}
            <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shadow-sm">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Analytics Dashboard</h3>
                  <p className="text-xs text-slate-400">Enterprise workforce telemetry and high-velocity pipeline analytics.</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 self-end sm:self-center">
                <button className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-sm">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                </button>
                <a
                  href="/admin"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Admin Control</span>
                </a>
              </div>
            </div>

            {/* Variation Subnav */}
            <div className="flex items-center gap-2 mb-4">
              <button className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-bold shadow-sm">
                Variation 1
              </button>
              <button className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold">
                Variation 2
              </button>
            </div>

            {/* Portfolio Performance Card */}
            <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-sm mb-5">
              <div className="flex items-center justify-between mb-5">
                <h4 className="text-sm font-black text-slate-800 tracking-tight">Portfolio Performance</h4>
                <button className="px-3 py-1 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  View All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Cash Deposits */}
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#F59E0B] text-white flex items-center justify-center shadow-md shrink-0">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400">Cash Deposits</div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">1,7M</div>
                    <div className="text-[11px] font-bold text-rose-500 flex items-center gap-0.5 mt-0.5">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      <span>54.1% less earnings</span>
                    </div>
                  </div>
                </div>

                {/* Invested Dividends */}
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-md shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400">Invested Dividends</div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">9M</div>
                    <div className="text-[11px] font-bold text-[#2563EB] flex items-center gap-0.5 mt-0.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Grow Rate: 14.1%</span>
                    </div>
                  </div>
                </div>

                {/* Capital Gains */}
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-md shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400">Capital Gains</div>
                    <div className="text-2xl font-black text-emerald-600 tracking-tight font-mono">$563</div>
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5 mt-0.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Increased by 7.35%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 flex justify-center">
                <a
                  href="/admin"
                  className="px-6 py-2 rounded-full bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>View Complete Report</span>
                </a>
              </div>
            </div>

            {/* Bottom 4 KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                <div className="text-lg font-black text-slate-900 font-mono">$ 874</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">sales last month</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                <div className="text-lg font-black text-slate-900 font-mono">$ 1283</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">sales income</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                <div className="text-lg font-black text-slate-900 font-mono">$ 1286</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">last month sales</div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                <div className="text-lg font-black text-slate-900 font-mono">$ 564</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">total revenue</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Downloads Section */}
      <section id="downloads" className="py-16 bg-[#F0F2F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs mb-3">
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Native Workstation Deployments</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Download the WorkPulse Desktop Client
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Install the lightweight Electron &amp; .NET 8 background workstation client for staff check-ins, outbound CRM calling, and hardware telemetry.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Windows Card */}
            <div className="bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 transition shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                    64-bit Windows
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mt-4">WorkPulse for Windows</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Compatible with Windows 10, Windows 11, and Windows Server 2022. Auto-starts with user login and syncs offline buffer.
                </p>

                <div className="mt-4 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Includes .NET 8 Background Agent &amp; Electron UI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Automated Outbound Softphone Dialer &amp; CRM Sync</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Hardware enrollment via unique PC machine code</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Installer Package</div>
                  <div className="font-mono font-bold text-xs text-slate-800">WorkPulse-Setup-x64.exe</div>
                </div>
                <a
                  href="/downloads/WorkPulse-Setup-x64.exe"
                  download="WorkPulse-Setup-x64.exe"
                  onClick={() => triggerDownload('windows')}
                  className="px-4 py-2 bg-gradient-to-r from-[#10B981] via-[#16A34A] to-[#65A30D] hover:opacity-95 text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .EXE</span>
                </a>
              </div>
            </div>

            {/* macOS Card */}
            <div className="bg-white border border-slate-200 hover:border-slate-800 rounded-2xl p-6 transition shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-bold">
                    <Apple className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 font-bold text-xs">
                    Universal Binary
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mt-4">WorkPulse for macOS</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Universal binary optimized for Apple Silicon (M1/M2/M3/M4) and Intel Macs. macOS 13+ Ventura, Sonoma, &amp; Sequoia.
                </p>

                <div className="mt-4 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                    <span>Native Apple Silicon ARM64 &amp; x64 Performance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                    <span>Low Battery Consumption (&lt; 1% CPU utilization)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                    <span>ClickUp Subtask &amp; Time Tracking Stopwatch</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Disk Image Package</div>
                  <div className="font-mono font-bold text-xs text-slate-800">WorkPulse-Mac-Universal.dmg</div>
                </div>
                <a
                  href="/downloads/WorkPulse-Mac-Universal.dmg"
                  download="WorkPulse-Mac-Universal.dmg"
                  onClick={() => triggerDownload('mac')}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm transition"
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
      <section id="features" className="py-16 bg-white border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Enterprise-Grade Capabilities Built for Modern Companies
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Every tool required to manage employees, monitor productivity, assign calling sheets, and audit actions.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#F8FAFC] border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Live Floor Attendance Board</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Real-time active application telemetry, working shifts, break logs, keystrokes, and mouse activity without intrusive screen capture or keylogging.
              </p>
            </div>

            <div className="bg-[#F8FAFC] border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">ClickUp-Style Multi-View CRM</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                List View, Kanban Pipeline Board, Calling Sheet Matrix, Calendar, and Daily Target Dashboards with subtask checklists and built-in time tracking.
              </p>
            </div>

            <div className="bg-[#F8FAFC] border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Zero-Trust Hardware RBAC</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Multi-tenant tenant isolation, cryptographic device enrollment approval, immutable PostgreSQL audit logs, and strict endpoint permissions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download CTA Banner */}
      <section className="bg-gradient-to-r from-[#10B981] via-[#16A34A] to-[#65A30D] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Ready to deploy WorkPulse to your workforce?</h2>
            <p className="text-xs text-white/90 mt-1">
              Download the workstation background agent to start tracking shifts and managing calling leads.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#downloads"
              className="px-6 py-3 bg-white text-emerald-800 hover:bg-slate-50 rounded-xl font-extrabold text-xs shadow-lg flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              <span>Download Workstation Client</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#10B981] to-[#16A34A] text-white flex items-center justify-center text-[11px] font-bold">
              WP
            </div>
            <span className="font-bold text-slate-900">WorkPulse Company OS</span>
            <span>&bull; © 2026 DEVSYNX. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#downloads" className="hover:underline text-slate-600">Windows &amp; Mac Client</a>
            <a href="/admin" className="font-bold text-[#2563EB] hover:underline">Admin Control</a>
            <span className="font-mono text-emerald-600">https://roofingclients.us/api/v1</span>
          </div>
        </div>
      </footer>

      {/* Download Modal */}
      {downloadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {downloadModal === 'windows' ? (
                  <Monitor className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Apple className="w-5 h-5 text-slate-900" />
                )}
                <h3 className="font-bold text-sm text-slate-900">
                  WorkPulse for {downloadModal === 'windows' ? 'Windows (.exe)' : 'macOS (.dmg)'}
                </h3>
              </div>
              <button
                onClick={() => setDownloadModal(null)}
                className="text-slate-400 hover:text-slate-900 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg font-semibold flex items-center gap-2 border border-emerald-200">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>Download started! Saving {downloadModal === 'windows' ? 'WorkPulse-Setup-x64.exe' : 'WorkPulse-Mac-Universal.dmg'}</span>
              </div>

              <p className="text-slate-500">
                Once downloaded, open the installer to launch the WorkPulse workstation client on your computer.
              </p>

              {/* Direct fallback download links */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] text-slate-400">If download did not start automatically:</div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={downloadModal === 'windows' ? '/downloads/WorkPulse-Setup-x64.exe' : '/downloads/WorkPulse-Mac-Universal.dmg'}
                    download={downloadModal === 'windows' ? 'WorkPulse-Setup-x64.exe' : 'WorkPulse-Mac-Universal.dmg'}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-[#10B981] to-[#16A34A] text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Direct Download {downloadModal === 'windows' ? '.EXE' : '.DMG'}</span>
                  </a>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  onClick={() => setDownloadModal(null)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-xs"
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
