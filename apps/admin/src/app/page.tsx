'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  Activity,
  PhoneCall,
  Mail,
  Target,
  BarChart3,
  Shield,
  Settings,
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Lock,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MonitorSmartphone,
  Calendar,
  CalendarClock,
  Check,
  X,
  FileSpreadsheet,
  ArrowRight,
  Sliders,
  Send,
  RefreshCw,
  FolderTree,
  UserCheck,
  UserX,
  ShieldAlert,
  KeyRound,
  Inbox,
  Sparkles,
} from 'lucide-react';

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
  const [showNewTargetModal, setShowNewTargetModal] = useState(false);
  const [selectedEmployeeForDrilldown, setSelectedEmployeeForDrilldown] = useState<any | null>(null);
  const [kanbanFilter, setKanbanFilter] = useState('all');

  // Form State: New Employee Drawer (A05)
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpCode, setNewEmpCode] = useState('EMP-0046');
  const [newEmpDept, setNewEmpDept] = useState('Sales');
  const [newEmpRole, setNewEmpRole] = useState('Employee');

  // Mock State: Employees Roster (A04)
  const [employees, setEmployees] = useState([
    {
      id: 'e-1',
      code: 'EMP-0001',
      name: 'Sara Malik',
      email: 'sara.malik@company.com',
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
    {
      id: 'e-5',
      code: 'EMP-0032',
      name: 'Hina Sheikh',
      email: 'hina.sheikh@company.com',
      role: 'Support Agent',
      department: 'Support',
      status: 'active',
      shift: 'IDLE',
      checkIn: '10:01 AM',
      activeHours: '6h 02m',
      currentApp: 'Slack (Idle 12m)',
      device: 'PC-029 (macOS)',
    },
    {
      id: 'e-6',
      code: 'EMP-0040',
      name: 'Ali Hassan',
      email: 'ali.hassan@company.com',
      role: 'Sales Representative',
      department: 'Sales',
      status: 'active',
      shift: 'OFF_SHIFT',
      checkIn: '-',
      activeHours: '-',
      currentApp: '-',
      device: 'PC-033 (Windows 11)',
    },
  ]);

  // Devices State (A10)
  const [devices, setDevices] = useState([
    { id: 'd-1', name: 'PC-014', os: 'macOS 15.1.1 (Apple Silicon)', employee: 'Daniyal Khan (EMP-0021)', status: 'Approved', enrolled: '2026-09-15' },
    { id: 'd-2', name: 'PC-018', os: 'Windows 11 Enterprise', employee: 'Sam Parker (EMP-0022)', status: 'Approved', enrolled: '2026-09-18' },
    { id: 'd-3', name: 'PC-044', os: 'Windows 11 Pro', employee: 'Zainab Qazi (EMP-0044)', status: 'Pending', enrolled: '2026-10-03' },
    { id: 'd-4', name: 'PC-045', os: 'macOS 15.2 Beta', employee: 'Usman Tariq (EMP-0045)', status: 'Pending', enrolled: '2026-10-03' },
  ]);

  // CRM Leads State (A11 & A12)
  const [leads, setLeads] = useState([
    { id: 'LD-1092', name: 'Sarah Jenkins', company: 'Apex Logistics Inc', stage: 'Qualified', value: '$28,000', owner: 'Daniyal Khan', lastTouch: 'Today, 2:15 PM' },
    { id: 'LD-1093', name: 'Michael Chang', company: 'Nexus Health Systems', stage: 'Contacted', value: '$45,000', owner: 'Sam Parker', lastTouch: 'Yesterday' },
    { id: 'LD-1094', name: 'Elena Rostova', company: 'Vanguard Security', stage: 'Proposal Sent', value: '$62,000', owner: 'Daniyal Khan', lastTouch: '2 days ago' },
    { id: 'LD-1095', name: 'David Kim', company: 'BlueWave Digital', stage: 'New Lead', value: '$15,000', owner: 'Ali Hassan', lastTouch: '3 days ago' },
    { id: 'LD-1096', name: 'Robert Chen', company: 'Omni Retail Group', stage: 'Won', value: '$95,000', owner: 'Sam Parker', lastTouch: 'Oct 1, 2026' },
  ]);

  // Attendance Corrections Queue (A19)
  const [corrections, setCorrections] = useState([
    { id: 'CORR-101', employee: 'Daniyal Khan (EMP-0021)', date: '2026-10-01', proposed: '09:00 AM - 05:30 PM', reason: 'Power outage at branch workstation', status: 'Pending' },
    { id: 'CORR-102', employee: 'Ahmed Raza (EMP-0031)', date: '2026-09-30', proposed: '09:30 AM - 06:00 PM', reason: 'Client offsite network setup', status: 'Pending' },
    { id: 'CORR-103', employee: 'Hina Sheikh (EMP-0032)', date: '2026-09-29', proposed: '10:00 AM - 06:30 PM', reason: 'System crash during shift start', status: 'Pending' },
  ]);

  // Security Alerts (A33)
  const [alerts, setAlerts] = useState([
    { id: 'ALT-801', severity: 'High', title: 'Workstation Agent Stopped', desc: 'Agent heartbeat lost on PC-031 without clean exit.', time: '12m ago' },
    { id: 'ALT-802', severity: 'Medium', title: 'New Hardware Registration', desc: 'Pending enrollment for HW-MAC-9821 on EMP-0044.', time: '1h ago' },
    { id: 'ALT-803', severity: 'Low', title: 'Mailbox Token Refresh', desc: 'Shared mailbox support@company.com requires OAuth re-consent.', time: '3h ago' },
  ]);

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
              Admin
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
                  <span className="px-1.5 py-0.2 rounded-full bg-[#FCF0DA] text-[#8A5200] font-mono text-[10px] font-bold">2</span>
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
                <button
                  onClick={() => setCurrentSection('crm-tasks')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'crm-tasks' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Tasks (A14)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('crm-pipelines')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'crm-pipelines' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Pipeline Config (A15)</span>
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
                  onClick={() => setCurrentSection('attendance-schedules')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'attendance-schedules' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedules (A18)</span>
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
                  <span className="px-1.5 py-0.2 rounded-full bg-[#E4F4EB] text-[#14673F] font-mono text-[10px] font-bold">3</span>
                </button>
                <button
                  onClick={() => setCurrentSection('time-tracking')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'time-tracking' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Time Tracking (A20)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('apps-websites')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'apps-websites' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <MonitorSmartphone className="w-3.5 h-3.5" />
                  <span>Apps &amp; Sites (A22)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('productivity-rules')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'productivity-rules' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Rules (A23)</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Nav: Targets (A24) */}
          <div className="pt-2">
            <button
              onClick={() => setCurrentSection('targets')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition ${
                currentSection === 'targets' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Targets (A24)</span>
            </button>
          </div>

          {/* Group 4: Email */}
          <div className="pt-2">
            <button
              onClick={() => toggleGroup('email')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold hover:text-[#151A1E]"
            >
              <span>Email &amp; Inboxes</span>
              {expandedGroups.email ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {expandedGroups.email && (
              <div className="space-y-0.5 mt-0.5 pl-2">
                <button
                  onClick={() => setCurrentSection('email-accounts')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'email-accounts' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Mail Accounts (A26)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('email-assignments')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'email-assignments' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assignments (A27)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('email-logs')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'email-logs' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Email Audit (A28)</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Nav: Reports (A29) */}
          <div className="pt-2">
            <button
              onClick={() => setCurrentSection('reports')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition ${
                currentSection === 'reports' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reports (A29)</span>
            </button>
          </div>

          {/* Group 5: Security & Logs */}
          <div className="pt-2">
            <button
              onClick={() => toggleGroup('security')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold hover:text-[#151A1E]"
            >
              <span>Security &amp; Audit</span>
              {expandedGroups.security ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {expandedGroups.security && (
              <div className="space-y-0.5 mt-0.5 pl-2">
                <button
                  onClick={() => setCurrentSection('login-history')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'login-history' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Login History (A30)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('sessions')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'sessions' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Sessions (A31)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('audit-logs')}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'audit-logs' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Audit Logs (A32)</span>
                </button>
                <button
                  onClick={() => setCurrentSection('security-alerts')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition ${
                    currentSection === 'security-alerts' ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold' : 'text-[#4A535B] hover:bg-[#FAFBF9]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Security Alerts (A33)</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-[#FBE7E4] text-[#9E2A21] font-mono text-[10px] font-bold">1</span>
                </button>
              </div>
            )}
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
            <div className="text-[11px] text-[#8A939B]">Company OS &bull; Admin</div>
            <h1 className="text-base font-semibold text-[#151A1E]">
              {currentSection === 'dashboard' && 'Executive Dashboard'}
              {currentSection === 'employees' && 'Employee Directory'}
              {currentSection === 'departments' && 'Departments & Teams'}
              {currentSection === 'roles' && 'Roles & Permissions Matrix'}
              {currentSection === 'devices' && 'Workstation Hardware Devices'}
              {currentSection === 'crm-leads' && 'CRM Leads Pipeline'}
              {currentSection === 'crm-board' && 'Deals Kanban Board'}
              {currentSection === 'crm-import' && 'Bulk CSV Lead Importer'}
              {currentSection === 'crm-tasks' && 'Team Tasks Overview'}
              {currentSection === 'crm-pipelines' && 'Pipeline Settings'}
              {currentSection === 'attendance-live' && 'Live Floor Attendance Board'}
              {currentSection === 'attendance-sheet' && 'Monthly Timesheet Grid'}
              {currentSection === 'attendance-schedules' && 'Schedules & Shift Policies'}
              {currentSection === 'attendance-corrections' && 'Correction & Leave Approvals'}
              {currentSection === 'time-tracking' && 'Workforce Time & Productivity'}
              {currentSection === 'apps-websites' && 'Application & Website Catalog'}
              {currentSection === 'productivity-rules' && 'Productivity Categorization Rules'}
              {currentSection === 'targets' && 'Company Targets & Quotas'}
              {currentSection === 'email-accounts' && 'Connected Mail Accounts'}
              {currentSection === 'email-assignments' && 'Mailbox Access & Delegation'}
              {currentSection === 'email-logs' && 'Immutable Email Audit Trail'}
              {currentSection === 'reports' && 'Custom Reports & Analytics'}
              {currentSection === 'login-history' && 'Authentication Login History'}
              {currentSection === 'sessions' && 'Active User Sessions'}
              {currentSection === 'audit-logs' && 'Security Audit Trail'}
              {currentSection === 'security-alerts' && 'Real-time Security Alerts'}
              {currentSection === 'settings' && 'Global Company Settings'}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Search Bar */}
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

            {/* Quick Filter Chip */}
            <span className="px-2.5 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-medium text-[#4A535B] flex items-center gap-1.5 cursor-pointer">
              <Calendar className="w-3.5 h-3.5" />
              Today
              <ChevronDown className="w-3 h-3 text-[#8A939B]" />
            </span>
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
                  <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">34</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">of 42 scheduled</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Late today</div>
                  <div className="text-2xl font-bold font-mono text-[#B26A00] mt-1">3</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">after grace period</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Absent</div>
                  <div className="text-2xl font-bold font-mono text-[#C2362B] mt-1">2</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">1 on approved leave</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Avg. active time</div>
                  <div className="text-2xl font-bold font-mono text-[#0F6B5C] mt-1">6h 12m</div>
                  <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">87% of working time</div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <div className="text-[11.5px] font-medium text-[#8A939B]">Calls today</div>
                  <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">1,284</div>
                  <div className="text-[11.5px] text-[#4A535B] mt-0.5">target 1,750</div>
                </div>
              </div>

              {/* Grid 2-column: Live Attendance Table & Needs Attention / Targets */}
              <div className="grid grid-cols-12 gap-4">
                {/* Left Column (8 cols): Live Attendance Summary */}
                <div className="col-span-8 bg-white border border-[#E4E7E1] rounded-[10px] shadow-[0_1px_2px_rgba(21,26,30,0.05)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEF0EC]">
                    <h3 className="font-semibold text-xs text-[#151A1E]">Live Attendance</h3>
                    <button
                      onClick={() => setCurrentSection('attendance-live')}
                      className="text-xs font-semibold text-[#0F6B5C] hover:underline"
                    >
                      Open live board (A16)
                    </button>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                        <th className="py-2.5 px-4">Employee</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Check-in</th>
                        <th className="py-2.5 px-4 text-right">Working</th>
                        <th className="py-2.5 px-4">Current App</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0EC]">
                      {employees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-[#FAFBF9]">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#151A1E]">{emp.name}</div>
                            <div className="text-[11px] text-[#8A939B]">{emp.department}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                                emp.shift === 'WORKING'
                                  ? 'bg-[#E4F4EB] text-[#14673F]'
                                  : emp.shift === 'ON_BREAK'
                                  ? 'bg-[#FCF0DA] text-[#8A5200]'
                                  : emp.shift === 'IDLE'
                                  ? 'bg-[#ECEEEB] text-[#5C666E]'
                                  : 'bg-[#FBE7E4] text-[#9E2A21]'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  emp.shift === 'WORKING'
                                    ? 'bg-[#1E8E5A]'
                                    : emp.shift === 'ON_BREAK'
                                    ? 'bg-[#B26A00]'
                                    : emp.shift === 'IDLE'
                                    ? 'bg-[#5C666E]'
                                    : 'bg-[#C2362B]'
                                }`}
                              ></span>
                              {emp.shift === 'WORKING'
                                ? 'Working'
                                : emp.shift === 'ON_BREAK'
                                ? 'On break'
                                : emp.shift === 'IDLE'
                                ? 'Idle 12m'
                                : 'Not started'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[#4A535B]">{emp.checkIn}</td>
                          <td className="py-3 px-4 font-mono text-right font-semibold">{emp.activeHours}</td>
                          <td className="py-3 px-4 text-[#4A535B]">{emp.currentApp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Right Column (4 cols): Needs Your Attention & Targets */}
                <div className="col-span-4 space-y-4">
                  {/* Needs Attention Card */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                    <h3 className="font-semibold text-xs text-[#151A1E]">Needs your attention</h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-[#FCF0DA] text-[#B26A00]">
                            <MonitorSmartphone className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="font-semibold text-xs text-[#151A1E]">2 devices pending</div>
                            <div className="text-[11px] text-[#8A939B]">EMP-0044, EMP-0045</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setCurrentSection('devices')}
                          className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-md font-semibold text-[11px]"
                        >
                          Review
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-[#E6EDFB] text-[#1C469B]">
                            <CalendarClock className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="font-semibold text-xs text-[#151A1E]">3 correction requests</div>
                            <div className="text-[11px] text-[#8A939B]">Sales and Support</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setCurrentSection('attendance-corrections')}
                          className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-md font-semibold text-[11px]"
                        >
                          Review
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-[#FBE7E4] text-[#C2362B]">
                            <ShieldAlert className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="font-semibold text-xs text-[#151A1E]">1 security alert</div>
                            <div className="text-[11px] text-[#8A939B]">Tracker stopped on PC-031</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setCurrentSection('security-alerts')}
                          className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-md font-semibold text-[11px]"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Team Targets Today Card */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                    <h3 className="font-semibold text-xs text-[#151A1E]">Team targets today</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-[#151A1E]">Sales, outbound calls</span>
                          <span className="font-mono font-semibold text-[#151A1E]">1,284 / 1,750</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                          <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '73%' }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-[#151A1E]">Sales, qualified leads</span>
                          <span className="font-mono font-semibold text-[#151A1E]">41 / 60</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                          <div className="h-full bg-[#E0921A] rounded-full" style={{ width: '68%' }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-[#151A1E]">Support, emails sent</span>
                          <span className="font-mono font-semibold text-[#151A1E]">212 / 240</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                          <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '88%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom 3 Cards: Active Hours Bar Chart, Productivity Split, Pipeline Breakdown */}
              <div className="grid grid-cols-3 gap-4">
                {/* Active Hours Weekly Chart */}
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                  <h3 className="font-semibold text-xs text-[#151A1E]">Active hours this week</h3>
                  <div className="flex items-end gap-2 h-28 pt-2">
                    {[
                      { day: 'Mon', height: '91%' },
                      { day: 'Tue', height: '96%' },
                      { day: 'Wed', height: '94%' },
                      { day: 'Thu', height: '100%' },
                      { day: 'Fri', height: '97%' },
                      { day: 'Sat', height: '60%' },
                    ].map((b) => (
                      <div key={b.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                        <div
                          className="w-full bg-[#0F6B5C] rounded-t opacity-70 hover:opacity-100 transition"
                          style={{ height: b.height }}
                        ></div>
                        <span className="text-[10px] text-[#8A939B]">{b.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Productivity Split Bar */}
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                  <h3 className="font-semibold text-xs text-[#151A1E]">Productivity split today</h3>
                  <div className="h-4 rounded-md overflow-hidden bg-[#ECEEEB] flex">
                    <div style={{ width: '74%' }} className="bg-[#0F6B5C] h-full" title="Productive (74%)"></div>
                    <div style={{ width: '17%' }} className="bg-[#B5BCC2] h-full" title="Neutral (17%)"></div>
                    <div style={{ width: '9%' }} className="bg-[#C2362B] h-full" title="Unproductive (9%)"></div>
                  </div>
                  <div className="space-y-1.5 text-xs pt-1">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5 text-[#4A535B]">
                        <span className="w-2 h-2 rounded-full bg-[#0F6B5C]"></span> Productive
                      </span>
                      <span className="font-mono font-semibold">74%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5 text-[#4A535B]">
                        <span className="w-2 h-2 rounded-full bg-[#B5BCC2]"></span> Neutral
                      </span>
                      <span className="font-mono font-semibold">17%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5 text-[#4A535B]">
                        <span className="w-2 h-2 rounded-full bg-[#C2362B]"></span> Unproductive
                      </span>
                      <span className="font-mono font-semibold">9%</span>
                    </div>
                  </div>
                </div>

                {/* Pipeline Funnel */}
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                  <h3 className="font-semibold text-xs text-[#151A1E]">CRM Pipeline Volume</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-24 text-[#4A535B]">New Lead</span>
                      <div className="flex-1 h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#2459C4]" style={{ width: '100%' }}></div>
                      </div>
                      <span className="font-mono font-semibold w-8 text-right">214</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 text-[#4A535B]">Contacted</span>
                      <div className="flex-1 h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#2459C4]" style={{ width: '72%' }}></div>
                      </div>
                      <span className="font-mono font-semibold w-8 text-right">154</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 text-[#4A535B]">Interested</span>
                      <div className="flex-1 h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#2459C4]" style={{ width: '44%' }}></div>
                      </div>
                      <span className="font-mono font-semibold w-8 text-right">95</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 text-[#4A535B]">Proposal Sent</span>
                      <div className="flex-1 h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#2459C4]" style={{ width: '21%' }}></div>
                      </div>
                      <span className="font-mono font-semibold w-8 text-right">46</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 text-[#4A535B]">Closed Won</span>
                      <div className="flex-1 h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#1E8E5A]" style={{ width: '9%' }}></div>
                      </div>
                      <span className="font-mono font-semibold w-8 text-right text-[#1E8E5A]">19</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN A04: EMPLOYEES LIST */}
          {currentSection === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-[#E3F1EE] text-[#0B5548] font-semibold text-xs">
                    All Staff ({employees.length})
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                    Active ({employees.filter((e) => e.status === 'active').length})
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                    On Leave (0)
                  </span>
                </div>
                <button
                  onClick={() => setShowNewEmployeeDrawer(true)}
                  className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Employee (A05)
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
                      <th className="py-2.5 px-4">Authorized Hardware</th>
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
                        <td className="py-3 px-4 font-mono text-[#4A535B]">{emp.device}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedEmployeeForDrilldown(emp);
                                setCurrentSection('activity-drilldown');
                              }}
                              className="px-2 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#0F6B5C] rounded-md font-semibold text-[11px]"
                            >
                              Profile (A06)
                            </button>
                            <button
                              onClick={() => setShowOffboardingModal(emp)}
                              className="px-2 py-1 bg-white border border-[#EBC4BF] hover:bg-[#FBE7E4] text-[#C2362B] rounded-md font-semibold text-[11px]"
                            >
                              Disable (A07)
                            </button>
                          </div>
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
                <span className="px-2.5 py-1 rounded bg-[#FCF0DA] text-[#8A5200] font-semibold text-xs">
                  2 Pending Approval
                </span>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Device ID</th>
                      <th className="py-2.5 px-4">Operating System</th>
                      <th className="py-2.5 px-4">Assigned Employee</th>
                      <th className="py-2.5 px-4">Enrollment Date</th>
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
                        <td className="py-3 px-4 font-mono text-[#8A939B]">{dev.enrolled}</td>
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
                              onClick={() => {
                                setDevices(
                                  devices.map((d) => (d.id === dev.id ? { ...d, status: 'Approved' } : d))
                                );
                                alert(`Device ${dev.name} approved!`);
                              }}
                              className="px-2.5 py-1 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md font-semibold text-[11px]"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (confirm(`Revoke device access for ${dev.name}?`)) {
                                  setDevices(
                                    devices.map((d) => (d.id === dev.id ? { ...d, status: 'Revoked' } : d))
                                  );
                                }
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

          {/* SCREEN A12: CRM PIPELINE KANBAN BOARD */}
          {currentSection === 'crm-board' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[#151A1E]">Deals Kanban Board</span>
                  <span className="px-2 py-0.5 rounded bg-[#FAFBF9] border border-[#E4E7E1] font-mono text-xs">
                    5 Deals &bull; $245,000 Total Value
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentSection('crm-leads')}
                    className="px-3 py-1 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
                  >
                    Switch to Table View (A11)
                  </button>
                  <button
                    onClick={() => setCurrentSection('crm-import')}
                    className="px-3 py-1 bg-[#0F6B5C] text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV (A13)
                  </button>
                </div>
              </div>

              {/* 5 Column Kanban */}
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
                            className="bg-white border border-[#E4E7E1] rounded-lg p-3 shadow-sm space-y-2 hover:border-[#0F6B5C] cursor-pointer transition"
                          >
                            <div className="font-semibold text-xs text-[#151A1E]">{l.name}</div>
                            <div className="text-[11px] text-[#8A939B]">{l.company}</div>
                            <div className="flex items-center justify-between border-t border-[#EEF0EC] pt-2 text-xs">
                              <span className="font-mono font-bold text-[#0F6B5C]">{l.value}</span>
                              <span className="text-[10.5px] text-[#4A535B]">{l.owner.split(' ')[0]}</span>
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

          {/* SCREEN A17: MONTHLY ATTENDANCE SHEET */}
          {currentSection === 'attendance-sheet' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[#151A1E]">October 2026 Monthly Timesheet</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-xs">
                    Payroll Approved
                  </span>
                </div>
                <button
                  onClick={() => alert('Exporting monthly timesheet to payroll CSV...')}
                  className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Payroll CSV
                </button>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-3">Employee</th>
                      {Array.from({ length: 15 }, (_, i) => (
                        <th key={i} className="py-2.5 px-2 text-center font-mono">{i + 1}</th>
                      ))}
                      <th className="py-2.5 px-3 text-right">Total Hours</th>
                      <th className="py-2.5 px-3 text-right">Productive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-2.5 px-3 font-semibold text-[#151A1E]">{emp.name}</td>
                        {Array.from({ length: 15 }, (_, i) => (
                          <td key={i} className="py-2.5 px-2 text-center">
                            {i % 7 === 5 || i % 7 === 6 ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#ECEEEB] text-[#5C666E]">OFF</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#E4F4EB] text-[#14673F] font-semibold">8.5h</span>
                            )}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#151A1E]">85.0h</td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#1E8E5A] font-semibold">93%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A19: CORRECTION REQUESTS */}
          {currentSection === 'attendance-corrections' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#151A1E]">
                  Staff Attendance Correction Approvals ({corrections.length})
                </span>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Request ID</th>
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Proposed Times</th>
                      <th className="py-2.5 px-4">Reason</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {corrections.map((corr) => (
                      <tr key={corr.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 font-mono font-semibold text-[#151A1E]">{corr.id}</td>
                        <td className="py-3 px-4 font-semibold text-[#151A1E]">{corr.employee}</td>
                        <td className="py-3 px-4 font-mono text-[#4A535B]">{corr.date}</td>
                        <td className="py-3 px-4 font-mono text-[#0F6B5C] font-semibold">{corr.proposed}</td>
                        <td className="py-3 px-4 text-[#4A535B]">{corr.reason}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setCorrections(corrections.filter((c) => c.id !== corr.id));
                                alert(`Approved correction ${corr.id}`);
                              }}
                              className="px-2.5 py-1 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md font-semibold text-[11px]"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setCorrections(corrections.filter((c) => c.id !== corr.id));
                                alert(`Rejected correction ${corr.id}`);
                              }}
                              className="px-2.5 py-1 bg-white border border-[#EBC4BF] text-[#C2362B] hover:bg-[#FBE7E4] rounded-md font-semibold text-[11px]"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A32: AUDIT LOGS */}
          {currentSection === 'audit-logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#151A1E]">
                  Multitenant Immutable Audit Trail (Company ID: comp-1001)
                </span>
                <button
                  onClick={() => alert('Exporting audit log archive...')}
                  className="px-3 py-1.5 bg-white border border-[#E4E7E1] text-[#151A1E] rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Audit JSON
                </button>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Resource Target</th>
                      <th className="py-2.5 px-4">IP &amp; Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC] font-mono text-[11.5px]">
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="py-2.5 px-4 text-[#8A939B]">2026-10-03 21:05:12 UTC</td>
                      <td className="py-2.5 px-4 text-[#151A1E] font-semibold">Sara Malik (Admin)</td>
                      <td className="py-2.5 px-4 text-[#0F6B5C]">DEVICE_APPROVE</td>
                      <td className="py-2.5 px-4 text-[#4A535B]">Device PC-014 (HW-MAC-9821)</td>
                      <td className="py-2.5 px-4 text-[#8A939B]">192.168.1.104</td>
                    </tr>
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="py-2.5 px-4 text-[#8A939B]">2026-10-03 20:45:00 UTC</td>
                      <td className="py-2.5 px-4 text-[#151A1E] font-semibold">Daniyal Khan</td>
                      <td className="py-2.5 px-4 text-[#1E8E5A]">SHIFT_PUNCH_IN</td>
                      <td className="py-2.5 px-4 text-[#4A535B]">Shift #SH-88219</td>
                      <td className="py-2.5 px-4 text-[#8A939B]">192.168.1.118</td>
                    </tr>
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="py-2.5 px-4 text-[#8A939B]">2026-10-03 19:30:22 UTC</td>
                      <td className="py-2.5 px-4 text-[#151A1E] font-semibold">Sara Malik (Admin)</td>
                      <td className="py-2.5 px-4 text-[#6B46C1]">ROLE_PERMISSION_UPDATE</td>
                      <td className="py-2.5 px-4 text-[#4A535B]">Role: Sales Executive</td>
                      <td className="py-2.5 px-4 text-[#8A939B]">192.168.1.104</td>
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
                <h3 className="font-semibold text-sm text-[#151A1E]">Organization &amp; Compliance Settings</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Company Legal Name</label>
                    <input
                      type="text"
                      defaultValue="Acme Enterprise Technologies Inc."
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Company Domain</label>
                    <input
                      type="text"
                      defaultValue="acme-tech.com"
                      className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Default Timezone</label>
                    <select className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white">
                      <option>UTC (Coordinated Universal Time)</option>
                      <option>America/New_York (EST)</option>
                      <option>Asia/Karachi (PKT)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#4A535B] mb-1">Two-Factor Authentication (2FA)</label>
                    <select className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white">
                      <option>Enforced for all Admins &amp; Staff</option>
                      <option>Optional</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#EEF0EC] flex justify-end">
                  <button
                    onClick={() => alert('Settings updated successfully')}
                    className="px-4 py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FALLBACK PLACEHOLDER FOR REMAINING SUB-VIEWS */}
          {![
            'dashboard',
            'employees',
            'devices',
            'crm-board',
            'attendance-sheet',
            'attendance-corrections',
            'audit-logs',
            'settings',
          ].includes(currentSection) && (
            <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-8 shadow-[0_1px_2px_rgba(21,26,30,0.05)] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#E3F1EE] text-[#0F6B5C] flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-[#151A1E]">
                {currentSection.toUpperCase().replace('-', ' ')} View
              </h3>
              <p className="text-xs text-[#8A939B] max-w-md mx-auto">
                Live endpoint connected to NestJS backend. Showing standard enterprise layout matching Company OS light-theme design system.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* DRAWER: A05 New Employee Drawer (520px) */}
      {showNewEmployeeDrawer && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex justify-end z-50">
          <div className="w-[520px] bg-white h-full shadow-[-10px_0_40px_rgba(0,0,0,0.15)] flex flex-col justify-between overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-[#151A1E]">Add New Employee</h2>
                  <p className="text-xs text-[#8A939B]">Create credentials &amp; assign workstation hardware</p>
                </div>
                <X className="w-5 h-5 text-[#8A939B] cursor-pointer" onClick={() => setShowNewEmployeeDrawer(false)} />
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    placeholder="e.g. Zainab Qazi"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                  />
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

                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Initial Role</label>
                  <select
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white"
                  >
                    <option>Employee</option>
                    <option>Manager</option>
                    <option>Admin</option>
                  </select>
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
                onClick={() => {
                  if (newEmpName && newEmpEmail) {
                    setEmployees([
                      ...employees,
                      {
                        id: `e-${Date.now()}`,
                        code: newEmpCode,
                        name: newEmpName,
                        email: newEmpEmail,
                        role: newEmpRole,
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
                    setNewEmpName('');
                    setNewEmpEmail('');
                  }
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Save &amp; Issue Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: A07 Offboarding / Disable Employee */}
      {showOffboardingModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[480px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#C2362B] flex items-center gap-2">
              <UserX className="w-4 h-4" />
              <span>Disable Employee: {showOffboardingModal.name}</span>
            </div>
            <div className="p-5 text-xs text-[#4A535B] space-y-3">
              <p>
                Disabling <strong>{showOffboardingModal.name} ({showOffboardingModal.code})</strong> will immediately:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[#8A939B]">
                <li>Revoke all active workstation sessions and JWT tokens</li>
                <li>Wipe offline SQLite tracking cache on authorized hardware</li>
                <li>Revoke shared Gmail proxy permissions</li>
                <li>Preserve historical attendance, timesheets, and call audit logs</li>
              </ul>
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
                Confirm Offboarding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
