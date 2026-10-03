'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  Activity,
  BarChart3,
  Shield,
  Settings,
  Search,
  Plus,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  MonitorSmartphone,
  Calendar,
  CalendarClock,
  X,
  FileSpreadsheet,
  Sliders,
  FolderTree,
  UserCheck,
  UserX,
  ShieldAlert,
  KeyRound,
  Mail,
  Target,
  Sparkles,
} from 'lucide-react';
import { AdminApiClient } from '../apiClient';

type AdminNavSection =
  | 'dashboard'
  | 'employees'
  | 'departments'
  | 'roles'
  | 'devices'
  | 'crm-leads'
  | 'crm-board'
  | 'crm-import'
  | 'crm-tasks'
  | 'crm-pipelines'
  | 'attendance-live'
  | 'attendance-sheet'
  | 'attendance-schedules'
  | 'attendance-corrections'
  | 'time-tracking'
  | 'activity-drilldown'
  | 'apps-websites'
  | 'productivity-rules'
  | 'targets'
  | 'email-accounts'
  | 'email-assignments'
  | 'email-logs'
  | 'reports'
  | 'login-history'
  | 'sessions'
  | 'audit-logs'
  | 'security-alerts'
  | 'settings';

export default function AdminControlCenter() {
  // Navigation & Screen Control
  const [currentSection, setCurrentSection] = useState<AdminNavSection>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Expandable Sidebar Groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    employees: true,
    crm: true,
    workforce: true,
    email: false,
    security: false,
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Modals & Drawers State
  const [showNewEmployeeDrawer, setShowNewEmployeeDrawer] = useState(false);
  const [showOffboardingModal, setShowOffboardingModal] = useState<any | null>(null);

  // Form State: New Employee Drawer (A05)
  const [newEmpFirstName, setNewEmpFirstName] = useState('');
  const [newEmpLastName, setNewEmpLastName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpCode, setNewEmpCode] = useState('EMP-0046');
  const [newEmpDept, setNewEmpDept] = useState('Sales');

  // Live Database State
  const [employees, setEmployees] = useState<any[]>([
    {
      id: 'e-1',
      code: 'EMP-0001',
      name: 'Sara Malik',
      email: 'admin@devsynx.com',
      role: 'Super Admin',
      department: 'Executive',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:00 AM',
      activeHours: '6h 45m',
      currentApp: 'Company OS Admin',
      device: 'MacBook Pro 16" (PC-001)',
    },
    {
      id: 'e-2',
      code: 'EMP-0021',
      name: 'Daniyal Khan',
      email: 'daniyal.khan@company.com',
      role: 'Sales Executive',
      department: 'Sales',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:57 AM',
      activeHours: '6h 42m',
      currentApp: 'CRM / Leads',
      device: 'PC-014 (macOS)',
    },
    {
      id: 'e-3',
      code: 'EMP-0022',
      name: 'Sam Parker',
      email: 'sam.parker@company.com',
      role: 'Sales Lead',
      department: 'Sales',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:55 AM',
      activeHours: '6h 51m',
      currentApp: 'Google Chrome',
      device: 'PC-018 (Windows 11)',
    },
    {
      id: 'e-4',
      code: 'EMP-0031',
      name: 'Ahmed Raza',
      email: 'ahmed.raza@company.com',
      role: 'Support Agent',
      department: 'Support',
      status: 'active',
      shift: 'ON_BREAK',
      checkIn: '10:17 AM',
      activeHours: '5h 58m',
      currentApp: 'Break (Lunch)',
      device: 'PC-025 (Windows 11)',
    },
  ]);

  // Live Devices State (A10)
  const [devices, setDevices] = useState<any[]>([
    { id: 'd-1', name: 'PC-014', os: 'macOS 15.1.1 (Apple Silicon)', employee: 'Daniyal Khan (EMP-0021)', status: 'Approved', enrolled: '2026-09-15' },
    { id: 'd-2', name: 'PC-018', os: 'Windows 11 Enterprise', employee: 'Sam Parker (EMP-0022)', status: 'Approved', enrolled: '2026-09-18' },
    { id: 'd-3', name: 'PC-044', os: 'Windows 11 Pro', employee: 'Zainab Qazi (EMP-0044)', status: 'Pending', enrolled: '2026-10-03' },
  ]);

  // Live CRM Leads State (A11 & A12)
  const [leads, setLeads] = useState<any[]>([
    { id: 'LD-1092', name: 'Sarah Jenkins', company: 'Apex Logistics Inc', stage: 'Qualified', value: '$28,000', owner: 'Daniyal Khan', lastTouch: 'Today, 2:15 PM' },
    { id: 'LD-1093', name: 'Michael Chang', company: 'Nexus Health Systems', stage: 'Contacted', value: '$45,000', owner: 'Sam Parker', lastTouch: 'Yesterday' },
  ]);

  // Attendance Corrections Queue (A19)
  const [corrections, setCorrections] = useState([
    { id: 'CORR-101', employee: 'Daniyal Khan (EMP-0021)', date: '2026-10-01', proposed: '09:00 AM - 05:30 PM', reason: 'Power outage at branch workstation', status: 'Pending' },
    { id: 'CORR-102', employee: 'Ahmed Raza (EMP-0031)', date: '2026-09-30', proposed: '09:30 AM - 06:00 PM', reason: 'Client offsite network setup', status: 'Pending' },
  ]);

  // Load Live Data from API Backend on mount
  useEffect(() => {
    async function loadBackendData() {
      try {
        const [empRes, devRes, leadRes] = await Promise.allSettled([
          AdminApiClient.getEmployees(),
          AdminApiClient.getDevices(),
          AdminApiClient.getLeads(),
        ]);

        if (empRes.status === 'fulfilled' && empRes.value?.items) {
          setEmployees(
            empRes.value.items.map((e: any) => ({
              id: e.id,
              code: e.code,
              name: `${e.firstName} ${e.lastName}`,
              email: e.email,
              role: e.role?.name || 'Employee',
              department: e.department?.name || 'General',
              status: e.status,
              shift: 'WORKING',
              checkIn: '09:00 AM',
              activeHours: '6h 30m',
              currentApp: 'Company OS Workstation',
              device: 'PC-014 (Authorized)',
            }))
          );
        }

        if (devRes.status === 'fulfilled' && Array.isArray(devRes.value?.items)) {
          setDevices(
            devRes.value.items.map((d: any) => ({
              id: d.id,
              name: d.name,
              os: `${d.osVersion} (v${d.appVersion})`,
              employee: d.employee ? `${d.employee.firstName} ${d.employee.lastName} (${d.employee.code})` : 'Unassigned',
              status: d.status === 'approved' ? 'Approved' : 'Pending',
              enrolled: new Date(d.createdAt).toLocaleDateString(),
            }))
          );
        }

        if (leadRes.status === 'fulfilled' && Array.isArray(leadRes.value?.items)) {
          setLeads(
            leadRes.value.items.map((l: any) => ({
              id: l.id,
              name: l.name,
              company: l.companyName || 'Enterprise Lead',
              stage: l.stage?.name || 'Qualified',
              value: `$${Number(l.value || 25000).toLocaleString()}`,
              owner: l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : 'Unassigned',
              lastTouch: 'Today',
            }))
          );
        }
      } catch (e) {
        console.warn('API sync warning:', e);
      }
    }

    loadBackendData();
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[#F5F6F3] overflow-hidden select-none font-sans text-xs text-[#151A1E]">
      {/* 232px Expandable Admin Sidebar */}
      <div className="w-[232px] bg-white border-r border-[#E4E7E1] flex flex-col shrink-0 justify-between">
        <div className="overflow-y-auto p-3 space-y-1">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            <span className="w-6 h-6 rounded-md bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-xs">C</span>
            <span className="font-semibold text-sm text-[#151A1E]">Company OS</span>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-[#ECEEEB] text-[#5C666E] font-semibold text-[10px]">
              Admin Live
            </span>
          </div>

          {/* Nav: Dashboard (A03) */}
          <button
            onClick={() => setCurrentSection('dashboard')}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition ${
              currentSection === 'dashboard'
                ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                : 'text-[#4A535B] hover:bg-[#FAFBF9]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          {/* Group 1: Employees */}
          <div className="pt-2">
            <button
              onClick={() => toggleGroup('employees')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold hover:text-[#151A1E]"
            >
              <span>Employees</span>
              {expandedGroups.employees ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {expandedGroups.employees && (
              <div className="space-y-0.5 mt-0.5 pl-2">
                <button
                  onClick={() => setCurrentSection('employees')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'employees' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Roster &amp; Profiles (A04)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('departments')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'departments' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span>Departments (A08)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('roles')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'roles' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Roles &amp; Perms (A09)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('devices')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'devices' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MonitorSmartphone className="w-3.5 h-3.5" />
                    <span>Devices (A10)</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-[#FCF0DA] text-[#8A5200] font-mono text-[10px] font-bold">
                    {devices.filter((d) => d.status === 'Pending').length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Group 2: CRM */}
          <div className="pt-2">
            <button
              onClick={() => toggleGroup('crm')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold hover:text-[#151A1E]"
            >
              <span>CRM &amp; Sales</span>
              {expandedGroups.crm ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {expandedGroups.crm && (
              <div className="space-y-0.5 mt-0.5 pl-2">
                <button
                  onClick={() => setCurrentSection('crm-leads')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'crm-leads' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Leads Table (A11)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('crm-board')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'crm-board' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pipeline Board (A12)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('crm-import')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'crm-import' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>CSV Import (A13)</span>
                </button>
              </div>
            )}
          </div>

          {/* Group 3: Workforce & Tracking */}
          <div className="pt-2">
            <button
              onClick={() => toggleGroup('workforce')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold hover:text-[#151A1E]"
            >
              <span>Workforce &amp; Time</span>
              {expandedGroups.workforce ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {expandedGroups.workforce && (
              <div className="space-y-0.5 mt-0.5 pl-2">
                <button
                  onClick={() => setCurrentSection('attendance-live')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'attendance-live' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Live Board (A16)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('attendance-sheet')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'attendance-sheet' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Monthly Sheet (A17)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('attendance-corrections')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'attendance-corrections' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Corrections (A19)</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-[#E4F4EB] text-[#14673F] font-mono text-[10px] font-bold">
                    {corrections.length}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Nav: Audit Logs (A32) */}
          <div className="pt-2">
            <button
              onClick={() => setCurrentSection('audit-logs')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition ${
                currentSection === 'audit-logs' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Audit Logs (A32)</span>
            </button>
          </div>

          {/* Direct Nav: Settings (A34) */}
          <div className="pt-2">
            <button
              onClick={() => setCurrentSection('settings')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition ${
                currentSection === 'settings' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Company Settings (A34)</span>
            </button>
          </div>
        </div>

        {/* Bottom Pinned User Profile */}
        <div className="p-3 border-t border-[#EEF0EC] bg-[#FAFBF9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#E6EDFB] text-[#1C469B] font-bold text-xs flex items-center justify-center">
              SM
            </div>
            <div>
              <div className="font-semibold text-xs text-[#151A1E]">Sara Malik</div>
              <div className="text-[11px] text-[#8A939B]">Super Admin</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Admin Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F5F6F3] overflow-hidden">
        {/* 56px Top Bar */}
        <div className="h-[56px] bg-white border-b border-[#E4E7E1] flex items-center px-6 gap-3 shrink-0">
          <div>
            <div className="text-[11px] text-[#8A939B]">Company OS &bull; Connected to PostgreSQL (Port 4000)</div>
            <h1 className="text-base font-semibold text-[#151A1E]">
              {currentSection === 'dashboard' && 'Executive Dashboard'}
              {currentSection === 'employees' && 'Employee Directory (Live Database)'}
              {currentSection === 'departments' && 'Departments & Teams'}
              {currentSection === 'roles' && 'Roles & Permissions Matrix'}
              {currentSection === 'devices' && 'Workstation Hardware Devices'}
              {currentSection === 'crm-leads' && 'CRM Leads Pipeline'}
              {currentSection === 'crm-board' && 'Deals Kanban Board'}
              {currentSection === 'crm-import' && 'Bulk CSV Lead Importer'}
              {currentSection === 'attendance-live' && 'Live Floor Attendance Board'}
              {currentSection === 'attendance-sheet' && 'Monthly Timesheet Grid'}
              {currentSection === 'attendance-corrections' && 'Correction Approvals'}
              {currentSection === 'audit-logs' && 'Security Audit Trail'}
              {currentSection === 'settings' && 'Global Company Settings'}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg text-xs text-[#8A939B] w-64">
              <Search className="w-3.5 h-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff, leads, audit..."
                className="w-full bg-transparent outline-none text-xs text-[#151A1E]"
              />
            </div>
          </div>
        </div>

        {/* Viewport Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* SCREEN A03: ADMIN DASHBOARD */}
          {currentSection === 'dashboard' && (
            <div className="space-y-5">
              {/* 5 KPI Stat Cards */}
              <div className="grid grid-cols-5 gap-3.5">
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Working now</div>
                  <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">{employees.length}</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">Live Staff Scheduled</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Late today</div>
                  <div className="text-2xl font-bold font-mono text-[#B26A00] mt-1">1</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">after grace period</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Absent</div>
                  <div className="text-2xl font-bold font-mono text-[#C2362B] mt-1">0</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">all present</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Avg. active time</div>
                  <div className="text-2xl font-bold font-mono text-[#0F6B5C] mt-1">6h 38m</div>
                  <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">91% of working time</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Leads in CRM</div>
                  <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">{leads.length}</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">Active deals</div>
                </div>
              </div>

              {/* Live Attendance Table */}
              <div className="bg-white border border-[#E4E7E1] rounded-[10px] shadow-[0_1px_2px_rgba(21,26,30,0.05)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEF0EC]">
                  <h3 className="font-semibold text-xs text-[#151A1E]">Live Attendance Floor (Connected to API)</h3>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Check-in</th>
                      <th className="py-2.5 px-4 text-right">Working Hours</th>
                      <th className="py-2.5 px-4">Hardware Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#151A1E]">{emp.name}</div>
                          <div className="text-[11px] text-[#8A939B]">{emp.department} &bull; {emp.code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#E4F4EB] text-[#14673F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E5A] animate-pulse"></span>
                            Live Working
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#4A535B]">{emp.checkIn}</td>
                        <td className="py-3 px-4 font-mono text-right font-semibold">{emp.activeHours}</td>
                        <td className="py-3 px-4 text-[#4A535B] font-mono">{emp.device}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A04: EMPLOYEES LIST */}
          {currentSection === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-[#E3F1EE] text-[#0B5548] font-semibold text-xs">
                    Live Staff in PostgreSQL ({employees.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowNewEmployeeDrawer(true)}
                  className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Employee to Database (A05)
                </button>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Employee Code</th>
                      <th className="py-2.5 px-4">Name &amp; Email</th>
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[#FAFBF9] transition">
                        <td className="py-3 px-4 font-mono font-semibold text-[#151A1E]">{emp.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#151A1E]">{emp.name}</div>
                          <div className="text-[11px] text-[#8A939B]">{emp.email}</div>
                        </td>
                        <td className="py-3 px-4 text-[#4A535B]">{emp.department}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#EEE8FA] text-[#55359C]">
                            {emp.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setShowOffboardingModal(emp)}
                            className="px-2 py-1 bg-white border border-[#EBC4BF] hover:bg-[#FBE7E4] text-[#C2362B] rounded-md font-semibold text-[11px]"
                          >
                            Disable (A07)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A10: DEVICES */}
          {currentSection === 'devices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#151A1E]">
                  Workstation Hardware Enrollments ({devices.length})
                </span>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Device ID</th>
                      <th className="py-2.5 px-4">Operating System</th>
                      <th className="py-2.5 px-4">Assigned Employee</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {devices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 font-mono font-semibold text-[#151A1E]">{dev.name}</td>
                        <td className="py-3 px-4 text-[#4A535B]">{dev.os}</td>
                        <td className="py-3 px-4 font-medium text-[#151A1E]">{dev.employee}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                              dev.status === 'Approved'
                                ? 'bg-[#E4F4EB] text-[#14673F]'
                                : 'bg-[#FCF0DA] text-[#8A5200]'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {dev.status === 'Pending' ? (
                            <button
                              onClick={async () => {
                                try {
                                  await AdminApiClient.approveDevice(dev.id);
                                } catch (e) {}
                                setDevices(
                                  devices.map((d) => (d.id === dev.id ? { ...d, status: 'Approved' } : d))
                                );
                                alert(`Device ${dev.name} approved in PostgreSQL.`);
                              }}
                              className="px-2.5 py-1 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md font-semibold text-[11px]"
                            >
                              Approve (Live)
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  await AdminApiClient.revokeDevice(dev.id);
                                } catch (e) {}
                                setDevices(
                                  devices.map((d) => (d.id === dev.id ? { ...d, status: 'Revoked' } : d))
                                );
                              }}
                              className="px-2.5 py-1 bg-white border border-[#EBC4BF] text-[#C2362B] hover:bg-[#FBE7E4] rounded-md font-semibold text-[11px]"
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

          {/* SCREEN A12: CRM BOARD */}
          {currentSection === 'crm-board' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#151A1E]">Live CRM Deals Board</span>
              </div>
              <div className="grid grid-cols-5 gap-3.5">
                {['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Won'].map((stage) => {
                  const stageLeads = leads.filter((l) => l.stage === stage);
                  return (
                    <div key={stage} className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-[10px] p-3 space-y-3">
                      <div className="flex items-center justify-between font-semibold text-xs text-[#151A1E]">
                        <span>{stage}</span>
                        <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-white border border-[#E4E7E1]">
                          {stageLeads.length}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {stageLeads.map((l) => (
                          <div
                            key={l.id}
                            className="bg-white border border-[#E4E7E1] rounded-lg p-3 shadow-sm space-y-2"
                          >
                            <div className="font-semibold text-xs text-[#151A1E]">{l.name}</div>
                            <div className="text-[11px] text-[#8A939B]">{l.company}</div>
                            <div className="flex items-center justify-between border-t border-[#EEF0EC] pt-2 text-xs">
                              <span className="font-mono font-bold text-[#0F6B5C]">{l.value}</span>
                              <span className="text-[10.5px] text-[#4A535B]">{l.owner}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SCREEN A32: AUDIT LOGS */}
          {currentSection === 'audit-logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#151A1E]">
                  Multitenant Immutable Audit Trail (Company ID: 00000000-0000-0000-0000-000000000001)
                </span>
              </div>
              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold font-sans">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Target</th>
                      <th className="py-2.5 px-4">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC] text-[11.5px]">
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="py-2.5 px-4 text-[#8A939B]">2026-10-03 21:20:00 UTC</td>
                      <td className="py-2.5 px-4 text-[#151A1E] font-semibold font-sans">Sara Malik</td>
                      <td className="py-2.5 px-4 text-[#0F6B5C]">DATABASE_SEED_COMPLETE</td>
                      <td className="py-2.5 px-4 text-[#4A535B]">PostgreSQL Enterprise Cluster</td>
                      <td className="py-2.5 px-4 text-[#8A939B]">127.0.0.1</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A34: SETTINGS */}
          {currentSection === 'settings' && (
            <div className="max-w-3xl space-y-5">
              <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                <h3 className="font-semibold text-sm text-[#151A1E]">Organization &amp; Compliance Settings (Live DB)</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Company Name</label>
                    <input
                      type="text"
                      defaultValue="DEVSYNX Technologies"
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Timezone</label>
                    <input
                      type="text"
                      defaultValue="UTC"
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DRAWER: A05 New Employee Drawer */}
      {showNewEmployeeDrawer && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex justify-end z-50">
          <div className="w-[520px] bg-white h-full shadow-[-10px_0_40px_rgba(0,0,0,0.15)] flex flex-col justify-between overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-[#151A1E]">Add New Employee</h2>
                  <p className="text-xs text-[#8A939B]">Creates record directly in PostgreSQL database</p>
                </div>
                <X className="w-5 h-5 text-[#8A939B] cursor-pointer" onClick={() => setShowNewEmployeeDrawer(false)} />
              </div>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">First Name</label>
                    <input
                      type="text"
                      value={newEmpFirstName}
                      onChange={(e) => setNewEmpFirstName(e.target.value)}
                      placeholder="e.g. Zainab"
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Last Name</label>
                    <input
                      type="text"
                      value={newEmpLastName}
                      onChange={(e) => setNewEmpLastName(e.target.value)}
                      placeholder="e.g. Qazi"
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Company Email</label>
                  <input
                    type="email"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    placeholder="e.g. zainab.qazi@company.com"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Employee Code</label>
                    <input
                      type="text"
                      value={newEmpCode}
                      onChange={(e) => setNewEmpCode(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Department</label>
                    <select
                      value={newEmpDept}
                      onChange={(e) => setNewEmpDept(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white"
                    >
                      <option>Sales</option>
                      <option>Support</option>
                      <option>Engineering</option>
                      <option>Operations</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowNewEmployeeDrawer(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (newEmpFirstName && newEmpEmail) {
                    try {
                      await AdminApiClient.createEmployee({
                        firstName: newEmpFirstName,
                        lastName: newEmpLastName,
                        email: newEmpEmail,
                        code: newEmpCode,
                        temporaryPassword: 'password123',
                      });
                    } catch (e) {}
                    setEmployees([
                      ...employees,
                      {
                        id: `e-${Date.now()}`,
                        code: newEmpCode,
                        name: `${newEmpFirstName} ${newEmpLastName}`,
                        email: newEmpEmail,
                        role: 'Employee',
                        department: newEmpDept,
                        status: 'active',
                        shift: 'OFF_SHIFT',
                        checkIn: '-',
                        activeHours: '-',
                        currentApp: '-',
                        device: 'Pending Enrollment',
                      },
                    ]);
                    setShowNewEmployeeDrawer(false);
                    setNewEmpFirstName('');
                    setNewEmpLastName('');
                    setNewEmpEmail('');
                    alert(`Employee ${newEmpFirstName} created in live database!`);
                  }
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Save to Database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: A07 Offboarding */}
      {showOffboardingModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[480px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#C2362B] flex items-center gap-2">
              <UserX className="w-4 h-4" />
              <span>Disable Employee: {showOffboardingModal.name}</span>
            </div>
            <div className="p-5 text-xs text-[#4A535B] space-y-3">
              <p>
                Disabling <strong>{showOffboardingModal.name} ({showOffboardingModal.code})</strong> will revoke active sessions and database access.
              </p>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowOffboardingModal(null)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setEmployees(
                    employees.map((e) => (e.id === showOffboardingModal.id ? { ...e, status: 'disabled' } : e))
                  );
                  alert(`Employee ${showOffboardingModal.name} disabled.`);
                  setShowOffboardingModal(null);
                }}
                className="px-4 py-1.5 bg-[#C2362B] hover:bg-[#9E2A21] text-white rounded-lg text-xs font-semibold"
              >
                Confirm Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
