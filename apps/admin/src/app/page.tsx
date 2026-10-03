'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Users,
  Clock,
  Activity,
  PhoneCall,
  Mail,
  Target,
  FileSpreadsheet,
  ShieldAlert,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Download,
  Filter,
  Layers,
  Lock,
  Radio,
  Eye,
  UserCheck,
  ChevronRight,
  Sparkles,
  BarChart3,
  Calendar,
} from 'lucide-react';

type Tab =
  | 'dashboard'
  | 'employees'
  | 'devices'
  | 'attendance'
  | 'tracking'
  | 'crm'
  | 'email'
  | 'targets'
  | 'reports'
  | 'audit';

export default function AdminControlCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportType, setSelectedReportType] = useState('attendance');
  const [selectedPeriod, setSelectedPeriod] = useState('daily');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [offboardingEmployee, setOffboardingEmployee] = useState<any | null>(null);

  // Mock initial enterprise data
  const [devices, setDevices] = useState([
    {
      id: 'd-1',
      name: 'DESKTOP-FIN-01',
      os: 'Windows 11 Pro',
      employee: 'Ahmed Khan (EMP-0001)',
      status: 'pending',
      fingerprint: 'ecdsa-p256:8f:92:4a:bc:31:...',
      registeredAt: '2026-10-03 14:20',
    },
    {
      id: 'd-2',
      name: 'MACBOOK-PRO-M3',
      os: 'macOS 15.2',
      employee: 'Sarah Connor (EMP-0002)',
      status: 'approved',
      fingerprint: 'ecdsa-p256:3a:17:e9:12:44:...',
      registeredAt: '2026-10-02 09:15',
    },
    {
      id: 'd-3',
      name: 'WORKSTATION-OPS-9',
      os: 'Windows 10 Enterprise',
      employee: 'Michael Chang (EMP-0003)',
      status: 'approved',
      fingerprint: 'ecdsa-p256:7b:55:01:99:aa:...',
      registeredAt: '2026-10-01 11:30',
    },
  ]);

  const [employees, setEmployees] = useState([
    {
      id: 'e-1',
      code: 'EMP-0001',
      name: 'Ahmed Khan',
      email: 'ahmed.khan@company.com',
      role: 'Super Admin',
      department: 'Executive',
      team: 'Leadership',
      status: 'active',
      shift: 'WORKING',
      activeHours: '6.5h',
    },
    {
      id: 'e-2',
      code: 'EMP-0002',
      name: 'Sarah Connor',
      email: 'sarah.connor@company.com',
      role: 'Sales Rep',
      department: 'Sales',
      team: 'Enterprise Outbound',
      status: 'active',
      shift: 'WORKING',
      activeHours: '7.2h',
    },
    {
      id: 'e-3',
      code: 'EMP-0003',
      name: 'Michael Chang',
      email: 'michael.chang@company.com',
      role: 'Manager',
      department: 'Operations',
      team: 'Logistics',
      status: 'active',
      shift: 'ON_BREAK',
      activeHours: '4.8h',
    },
    {
      id: 'e-4',
      code: 'EMP-0004',
      name: 'Elena Rostova',
      email: 'elena.rostova@company.com',
      role: 'Sales Rep',
      department: 'Sales',
      team: 'Inbound Growth',
      status: 'active',
      shift: 'OFF_SHIFT',
      activeHours: '0.0h',
    },
  ]);

  const approveDevice = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'approved' } : d)),
    );
  };

  const revokeDevice = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'revoked' } : d)),
    );
  };

  const handleDownloadCsv = (type: string) => {
    const csvContent =
      type === 'attendance'
        ? 'Date,Code,Name,Department,Status,Working_Seconds,Break_Seconds\n2026-10-03,EMP-0001,Ahmed Khan,Executive,present,25200,3600\n2026-10-03,EMP-0002,Sarah Connor,Sales,present,27000,1800'
        : type === 'productivity'
          ? 'Date,Code,Name,Productive_Seconds,Neutral_Seconds,Unproductive_Seconds,Score\n2026-10-03,EMP-0001,Ahmed Khan,21600,2400,1200,86%\n2026-10-03,EMP-0002,Sarah Connor,24000,1800,1200,89%'
          : 'Date,Lead,Owner,Direction,Outcome,Duration_Sec\n2026-10-03,Acme Corp,Sarah Connor,outbound,Connected,240\n2026-10-03,Global Logistics,Sarah Connor,outbound,Voicemail,45';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${type}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex min-h-screen bg-[#090d16] text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#0d1322]/80 backdrop-blur flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight leading-none">
                Company OS
              </h1>
              <span className="text-xs text-indigo-400 font-medium">Admin Suite v1.0</span>
            </div>
          </div>

          <nav className="p-4 space-y-1 text-sm font-medium">
            {[
              { id: 'dashboard', label: 'Executive Pulse', icon: BarChart3 },
              { id: 'employees', label: 'Workforce & Org', icon: Users },
              { id: 'devices', label: 'Device Security', icon: Laptop, badge: '1 Pending' },
              { id: 'attendance', label: 'Live Attendance', icon: Clock },
              { id: 'tracking', label: 'Activity & Apps', icon: Activity },
              { id: 'crm', label: 'Leads & Pipelines', icon: PhoneCall },
              { id: 'email', label: 'Google Mailboxes', icon: Mail },
              { id: 'targets', label: 'Targets & KPI', icon: Target },
              { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
              { id: 'audit', label: 'Audit & Compliance', icon: ShieldAlert },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80">
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
              AK
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-white">Ahmed Khan</div>
              <div className="text-[11px] text-slate-400">Super Admin (Scope: All)</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800/80 px-8 flex items-center justify-between bg-[#0d1322]/40 backdrop-blur shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-white capitalize">
              {activeTab === 'dashboard' ? 'Executive Overview' : activeTab.replace('_', ' ')}
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Radio className="w-3 h-3 animate-pulse" /> Live Telemetry
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employees, leads, logs..."
                className="pl-9 pr-4 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
              />
            </div>
          </div>
        </header>

        {/* Tab View Container */}
        <div className="p-8 space-y-6">
          {/* TAB 1: EXECUTIVE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-400">Active Workstations</span>
                    <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                      <Laptop className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-white">3 / 4</div>
                  <div className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> 75% workforce online
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-400">Today's Active Time</span>
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Clock className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-white">18.5 hrs</div>
                  <div className="mt-1 text-xs text-slate-400">Across 3 active shifts</div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-400">Connected Calls</span>
                    <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                      <PhoneCall className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-white">42 / 60</div>
                  <div className="mt-1 text-xs text-amber-400">70% target pace</div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium text-slate-400">Security Health</span>
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-emerald-400">100%</div>
                  <div className="mt-1 text-xs text-slate-400">0 tamper alerts in 24h</div>
                </div>
              </div>

              {/* Live Attendance & Targets Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Live Workforce Presence */}
                <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" /> Live Workforce Status
                    </h3>
                    <span className="text-xs text-slate-400">Real-time attendance board</span>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {employees.map((emp) => (
                      <div key={emp.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <div>
                            <div className="text-sm font-medium text-white">{emp.name}</div>
                            <div className="text-xs text-slate-400">
                              {emp.code} • {emp.department}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              emp.shift === 'WORKING'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : emp.shift === 'ON_BREAK'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {emp.shift.replace('_', ' ')}
                          </span>
                          <div className="text-xs text-slate-400 mt-1">{emp.activeHours} tracked</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* KPI & Target Gauges */}
                <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" /> Daily Enterprise Targets
                    </h3>
                    <span className="text-xs text-slate-400">Aggregated company metrics</span>
                  </div>

                  <div className="space-y-4 pt-2">
                    {[
                      { label: 'Outbound Connected Calls', current: 42, target: 50, color: 'bg-indigo-500' },
                      { label: 'Qualified Leads Created', current: 18, target: 20, color: 'bg-emerald-500' },
                      { label: 'Customer Emails Sent', current: 95, target: 100, color: 'bg-amber-500' },
                      { label: 'CRM Pipeline Tasks Done', current: 28, target: 30, color: 'bg-violet-500' },
                    ].map((item, idx) => {
                      const pct = Math.min(100, Math.round((item.current / item.target) * 100));
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-300">{item.label}</span>
                            <span className="text-slate-400">
                              {item.current} / {item.target} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full ${item.color} transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEES & WORKFORCE */}
          {activeTab === 'employees' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Employee Roster & RBAC</h2>
                  <p className="text-sm text-slate-400">
                    Manage sequential employee codes, roles, and department scoping.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddingEmployee(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Employee
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 backdrop-blur">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/90 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Code</th>
                      <th className="px-6 py-3">Employee</th>
                      <th className="px-6 py-3">Department / Team</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/30">
                        <td className="px-6 py-4 font-mono text-indigo-400 text-xs font-bold">
                          {emp.code}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{emp.name}</div>
                          <div className="text-xs text-slate-400">{emp.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div>{emp.department}</div>
                          <div className="text-xs text-slate-500">{emp.team}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => setOffboardingEmployee(emp)}
                            className="text-xs px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                          >
                            Disable (F16)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DEVICE SECURITY */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Workstation Device Approvals</h2>
                <p className="text-sm text-slate-400">
                  Cryptographically verified ECDSA P-256 hardware bindings (F2 & F17).
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 backdrop-blur">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/90 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Workstation</th>
                      <th className="px-6 py-3">Bound Employee</th>
                      <th className="px-6 py-3">Public Key Fingerprint</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Authorization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {devices.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/30">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <Laptop className="w-4 h-4 text-indigo-400" /> {d.name}
                          </div>
                          <div className="text-xs text-slate-400">{d.os}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-200">{d.employee}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">
                          {d.fingerprint}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              d.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : d.status === 'pending'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {d.status === 'pending' && (
                            <button
                              onClick={() => approveDevice(d.id)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                            >
                              Approve
                            </button>
                          )}
                          {d.status === 'approved' && (
                            <button
                              onClick={() => revokeDevice(d.id)}
                              className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded text-xs font-semibold"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: GOOGLE WORKSPACE MAILBOXES */}
          {activeTab === 'email' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Connected Google Workspace Accounts</h2>
                  <p className="text-sm text-slate-400">
                    Backend-only Gmail proxy with zero employee-held Google passwords (F14).
                  </p>
                </div>
                <button
                  onClick={() => alert('Redirecting to Google OAuth Consent...')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                >
                  <Mail className="w-4 h-4" /> Connect Mailbox
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-white text-lg">sales@company.com</div>
                      <div className="text-xs text-slate-400">Sales Inbound & Outbound Mailbox</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Syncing (Pub/Sub OK)
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 pt-2">
                    <span className="font-semibold text-slate-300">Assigned Staff & Permissions:</span>
                    <div className="mt-2 space-y-2">
                      <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/60 flex justify-between items-center">
                        <span className="font-medium text-white">Sarah Connor</span>
                        <span className="text-[11px] text-indigo-400">read, send, reply, attach, draft</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/60 flex justify-between items-center">
                        <span className="font-medium text-white">Elena Rostova</span>
                        <span className="text-[11px] text-indigo-400">read, send, reply, attach</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-white text-lg">support@company.com</div>
                      <div className="text-xs text-slate-400">Tier 1 & Tier 2 Customer Care</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Syncing (Pub/Sub OK)
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 pt-2">
                    <span className="font-semibold text-slate-300">Assigned Staff & Permissions:</span>
                    <div className="mt-2 space-y-2">
                      <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/60 flex justify-between items-center">
                        <span className="font-medium text-white">Michael Chang</span>
                        <span className="text-[11px] text-indigo-400">read, reply, archive, mark_read</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REPORTS & DATA EXPORT */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Enterprise Reporting & Audit Exports</h2>
                  <p className="text-sm text-slate-400">
                    Comprehensive workforce analytics and immutable activity data.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadCsv(selectedReportType)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" /> Download CSV Export
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-300">Report Domain:</span>
                {['attendance', 'productivity', 'crm', 'calls'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedReportType(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      selectedReportType === type
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Data Preview Table */}
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 backdrop-blur p-6">
                <h3 className="font-semibold text-white mb-4 capitalize">
                  {selectedReportType} Records Preview
                </h3>
                <div className="text-xs text-slate-400 font-mono bg-slate-950 p-4 rounded-lg border border-slate-800">
                  {selectedReportType === 'attendance' && (
                    <pre>
                      {`Date: 2026-10-03 | Employee: EMP-0001 (Ahmed Khan)  | Status: PRESENT | Working: 07h 00m | Break: 01h 00m | Flags: []
Date: 2026-10-03 | Employee: EMP-0002 (Sarah Connor) | Status: PRESENT | Working: 07h 30m | Break: 00h 30m | Flags: []
Date: 2026-10-03 | Employee: EMP-0003 (Michael Chang)| Status: PRESENT | Working: 04h 48m | Break: 01h 12m | Flags: [break_exceeded]`}
                    </pre>
                  )}
                  {selectedReportType === 'productivity' && (
                    <pre>
                      {`Date: 2026-10-03 | EMP-0001 | Productive: 06h 00m | Neutral: 00h 40m | Unproductive: 00h 20m | Score: 86%
Date: 2026-10-03 | EMP-0002 | Productive: 06h 40m | Neutral: 00h 30m | Unproductive: 00h 20m | Score: 89%
Date: 2026-10-03 | EMP-0003 | Productive: 04h 00m | Neutral: 00h 30m | Unproductive: 00h 18m | Score: 83%`}
                    </pre>
                  )}
                  {selectedReportType === 'crm' && (
                    <pre>
                      {`Lead: Acme Corporation   | Owner: Sarah Connor | Stage: Demo Scheduled (open) | Value: $25,000 USD
Lead: Global Logistics   | Owner: Sarah Connor | Stage: Closed Won (won)      | Value: $80,000 USD
Lead: Apex Industries    | Owner: Elena Rostova| Stage: Qualified (open)       | Value: $12,000 USD`}
                    </pre>
                  )}
                  {selectedReportType === 'calls' && (
                    <pre>
                      {`2026-10-03 14:15 | Sarah Connor | Lead: Acme Corp     | Outcome: Connected | Duration: 240s | Note: Demo set
2026-10-03 13:40 | Sarah Connor | Lead: Global Log    | Outcome: Voicemail | Duration: 45s  | Note: Followup scheduled
2026-10-03 11:20 | Elena Rostova| Lead: Apex Tech     | Outcome: Connected | Duration: 180s | Note: Interested in Q4`}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT & COMPLIANCE */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Immutable Audit Trail</h2>
                <p className="text-sm text-slate-400">
                  Every state change is recorded with actor ID, role rank, IP, and device ID (FR-AUD-01).
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 backdrop-blur">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/90 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Timestamp</th>
                      <th className="px-6 py-3">Actor</th>
                      <th className="px-6 py-3">Action</th>
                      <th className="px-6 py-3">Target Entity</th>
                      <th className="px-6 py-3">Network & Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {[
                      {
                        time: '2026-10-03 14:22:10 UTC',
                        actor: 'Ahmed Khan (Super Admin)',
                        action: 'DEVICE_APPROVED',
                        target: 'Device: MACBOOK-PRO-M3',
                        net: '192.168.1.5 (d-2)',
                      },
                      {
                        time: '2026-10-03 14:15:32 UTC',
                        actor: 'Sarah Connor (Sales Rep)',
                        action: 'CALL_LOGGED',
                        target: 'Lead: Acme Corp (call-1)',
                        net: '192.168.1.18 (d-1)',
                      },
                      {
                        time: '2026-10-03 13:50:00 UTC',
                        actor: 'System Watchdog',
                        action: 'TARGET_SNAPSHOT_COMPUTED',
                        target: 'Period: 2026-10-03 Daily',
                        net: '127.0.0.1 (internal)',
                      },
                      {
                        time: '2026-10-03 12:00:15 UTC',
                        actor: 'Sarah Connor (Sales Rep)',
                        action: 'EMAIL_SENT',
                        target: 'sales@company.com -> client@acme.com',
                        net: '192.168.1.18 (d-1)',
                      },
                    ].map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-6 py-3.5 font-mono text-slate-400">{log.time}</td>
                        <td className="px-6 py-3.5 font-medium text-white">{log.actor}</td>
                        <td className="px-6 py-3.5 font-mono text-indigo-400 font-semibold">
                          {log.action}
                        </td>
                        <td className="px-6 py-3.5 text-slate-200">{log.target}</td>
                        <td className="px-6 py-3.5 font-mono text-slate-400">{log.net}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Offboarding Modal (F16) */}
          {offboardingEmployee && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                  <h3 className="font-bold text-lg text-white">Disable & Offboard Employee</h3>
                </div>

                <p className="text-sm text-slate-300">
                  Offboarding <span className="font-semibold text-white">{offboardingEmployee.name}</span> ({offboardingEmployee.code}) executes an atomic transaction (F16):
                </p>

                <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5">
                  <li>Revokes all sessions & refresh tokens immediately</li>
                  <li>Revokes registered devices & stops tracker agent</li>
                  <li>Removes Google Workspace mailbox assignments</li>
                  <li>Auto-closes active shift</li>
                  <li>Reassigns open CRM leads, tasks, and follow-ups</li>
                </ul>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    onClick={() => setOffboardingEmployee(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      alert(`Employee ${offboardingEmployee.code} successfully disabled per F16.`);
                      setOffboardingEmployee(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"
                  >
                    Confirm Offboarding
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
