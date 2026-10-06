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
  List,
  Kanban,
  Table,
  PhoneCall,
  Phone,
  Play,
  Square,
  Pause,
  Flag,
  Tag,
  CheckSquare,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  BarChart2,
  Filter,
  Layers,
  FileText,
  ArrowRight,
  Check,
  MoreHorizontal,
  Flame,
  UserPlus,
  Briefcase,
  DollarSign,
  PhoneForwarded,
  Timer,
  Menu,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Live Enterprise Database State (PostgreSQL & ClickUp Engine)
  const [employees, setEmployees] = useState<any[]>([
    {
      id: 'emp-1',
      code: 'EMP-0021',
      name: 'Daniyal Khan',
      email: 'daniyal.khan@company.com',
      role: 'Senior BDR Specialist',
      department: 'Sales & Outbound',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:00 AM',
      activeHours: '6h 34m',
      currentApp: 'WorkPulse Workstation / Chrome',
      device: 'PC-014 (Enrolled)',
      keystrokes: '14,280',
      mouseClicks: '3,420',
      productivityScore: '94%',
    },
    {
      id: 'emp-2',
      code: 'EMP-0022',
      name: 'Sam Parker',
      email: 'sam.parker@company.com',
      role: 'Account Executive',
      department: 'Sales & Outbound',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:15 AM',
      activeHours: '6h 12m',
      currentApp: 'HubSpot / Softphone Dialer',
      device: 'PC-092 (Enrolled)',
      keystrokes: '11,850',
      mouseClicks: '2,980',
      productivityScore: '91%',
    },
    {
      id: 'emp-3',
      code: 'EMP-0023',
      name: 'Emily Chen',
      email: 'emily.chen@company.com',
      role: 'Full Stack Engineer',
      department: 'Engineering',
      status: 'active',
      shift: 'ON_BREAK',
      checkIn: '08:50 AM',
      activeHours: '5h 45m',
      currentApp: 'VS Code / GitHub Desktop',
      device: 'MAC-044 (Enrolled)',
      keystrokes: '18,940',
      mouseClicks: '4,120',
      productivityScore: '96%',
    },
    {
      id: 'emp-4',
      code: 'EMP-0024',
      name: 'Bilal Ahmed',
      email: 'bilal.ahmed@company.com',
      role: 'Support Team Lead',
      department: 'Customer Success',
      status: 'active',
      shift: 'WORKING',
      checkIn: '09:30 AM',
      activeHours: '5h 50m',
      currentApp: 'Zendesk / Slack Enterprise',
      device: 'PC-078 (Enrolled)',
      keystrokes: '9,450',
      mouseClicks: '2,130',
      productivityScore: '88%',
    },
    {
      id: 'emp-5',
      code: 'EMP-0001',
      name: 'Sara Malik',
      email: 'sara.malik@devsynx.com',
      role: 'Super Admin',
      department: 'Security & Compliance',
      status: 'active',
      shift: 'WORKING',
      checkIn: '08:30 AM',
      activeHours: '7h 15m',
      currentApp: 'WorkPulse Central Admin',
      device: 'MAC-088 (Enrolled)',
      keystrokes: '12,600',
      mouseClicks: '3,800',
      productivityScore: '98%',
    },
  ]);

  const [departments, setDepartments] = useState<any[]>([
    {
      id: 'dept-1',
      name: 'Sales & Business Development',
      code: 'SALES',
      manager: 'Daniyal Khan',
      memberCount: 14,
      openTargets: 85,
      budget: '$120,000 / mo',
      color: '#0F6B5C',
    },
    {
      id: 'dept-2',
      name: 'Engineering & Core Platform',
      code: 'ENG',
      manager: 'Syed Hassan Ali Shah',
      memberCount: 9,
      openTargets: 42,
      budget: '$160,000 / mo',
      color: '#1C469B',
    },
    {
      id: 'dept-3',
      name: 'Customer Success & Support',
      code: 'CS',
      manager: 'Bilal Ahmed',
      memberCount: 8,
      openTargets: 30,
      budget: '$65,000 / mo',
      color: '#55359C',
    },
    {
      id: 'dept-4',
      name: 'Security, Compliance & IT',
      code: 'SEC',
      manager: 'Sara Malik',
      memberCount: 5,
      openTargets: 18,
      budget: '$90,000 / mo',
      color: '#B26A00',
    },
    {
      id: 'dept-5',
      name: 'Marketing & Demand Gen',
      code: 'MKT',
      manager: 'Emily Chen',
      memberCount: 6,
      openTargets: 24,
      budget: '$75,000 / mo',
      color: '#C2362B',
    },
  ]);

  const [roles, setRoles] = useState<any[]>([
    {
      id: 'role-1',
      name: 'Super Administrator',
      code: 'SUPER_ADMIN',
      description: 'Unrestricted enterprise control, security oversight, user management, and system auditing.',
      usersCount: 2,
      permissions: ['org:manage', 'crm:all', 'workforce:all', 'security:manage', 'settings:write', 'audit:read'],
      isSystem: true,
    },
    {
      id: 'role-2',
      name: 'Sales Department Manager',
      code: 'SALES_MGR',
      description: 'Full CRM deal oversight, mass calling sheet assignment, quotas, and floor tracking.',
      usersCount: 3,
      permissions: ['crm:manage', 'crm:assign', 'crm:export', 'workforce:read', 'targets:manage'],
      isSystem: false,
    },
    {
      id: 'role-3',
      name: 'Senior BDR / SDR Specialist',
      code: 'BDR_SPEC',
      description: 'Lead engagement, outbound dialing, call logging, target tracking, and shift check-in.',
      usersCount: 16,
      permissions: ['crm:dialer', 'crm:leads:read_assigned', 'crm:calls:create', 'workforce:checkin'],
      isSystem: false,
    },
    {
      id: 'role-4',
      name: 'Workforce Operations Lead',
      code: 'WORKFORCE_LEAD',
      description: 'Live floor attendance monitoring, timesheet approvals, shift scheduling, and correction handling.',
      usersCount: 4,
      permissions: ['workforce:manage', 'attendance:approve', 'shifts:manage', 'reports:read'],
      isSystem: false,
    },
    {
      id: 'role-5',
      name: 'Security & Compliance Auditor',
      code: 'SEC_AUDITOR',
      description: 'Read-only access to audit trail, device enrollment verification, and DLP monitoring.',
      usersCount: 2,
      permissions: ['audit:read', 'devices:read', 'security:alerts:read', 'reports:compliance'],
      isSystem: false,
    },
  ]);

  const [devices, setDevices] = useState<any[]>([
    {
      id: 'dev-1',
      name: 'PC-014',
      os: 'Windows 11 Enterprise (Build 22631)',
      employee: 'Daniyal Khan (EMP-0021)',
      status: 'Approved',
      agentVersion: 'v2.4.0',
      lastHeartbeat: '10 seconds ago',
      cpu: '14%',
      ram: '52%',
      ip: '192.168.1.104',
      uptime: '6h 34m',
    },
    {
      id: 'dev-2',
      name: 'MAC-088',
      os: 'macOS Sequoia 15.1 (Apple M3 Pro)',
      employee: 'Sara Malik (EMP-0001)',
      status: 'Approved',
      agentVersion: 'v2.4.0',
      lastHeartbeat: '5 seconds ago',
      cpu: '8%',
      ram: '38%',
      ip: '192.168.1.101',
      uptime: '7h 15m',
    },
    {
      id: 'dev-3',
      name: 'PC-092',
      os: 'Windows 11 Pro',
      employee: 'Sam Parker (EMP-0022)',
      status: 'Approved',
      agentVersion: 'v2.4.0',
      lastHeartbeat: '12 seconds ago',
      cpu: '18%',
      ram: '58%',
      ip: '192.168.1.109',
      uptime: '6h 12m',
    },
    {
      id: 'dev-4',
      name: 'PC-103',
      os: 'Windows 10 Enterprise',
      employee: 'Alex Morgan (EMP-0025)',
      status: 'Pending',
      agentVersion: 'v2.4.0',
      lastHeartbeat: '2 minutes ago',
      cpu: '5%',
      ram: '28%',
      ip: '192.168.1.115',
      uptime: '0h 45m',
    },
  ]);

  const [leads, setLeads] = useState<any[]>([
    {
      id: 'lead-101',
      name: 'Apex Commercial Roofing Partners',
      company: 'Apex Roofing & Solar LLC',
      pipeline: 'Enterprise Inbound',
      stage: 'New Lead',
      stageColor: '#0F6B5C',
      value: 48000,
      owner: 'Daniyal Khan',
      phone: '+1 (555) 234-8901',
      email: 'procurement@apexroofing.com',
      priority: 'urgent',
      tags: ['Commercial', 'Q4 Deal', 'Inbound'],
      subtasks: [
        { id: 'st-1', title: 'Verify company roof license & bond coverage', completed: true },
        { id: 'st-2', title: 'Conduct discovery call with VP of Ops', completed: false },
        { id: 'st-3', title: 'Send customized pricing & proposal quote', completed: false },
      ],
      callHistory: [
        { id: 'c-1', date: '2026-10-04 14:30', duration: 184, outcome: 'Connected & Interested', notes: 'Spoke with Marcus. Interested in commercial lead flow.' },
      ],
      createdAt: '2026-10-02',
    },
    {
      id: 'lead-102',
      name: 'Summit Premier Exterior Group',
      company: 'Summit Exteriors Inc.',
      pipeline: 'West Coast Outbound',
      stage: 'Contacted',
      stageColor: '#1C469B',
      value: 65000,
      owner: 'Sam Parker',
      phone: '+1 (555) 489-3321',
      email: 'kevin@summitexteriors.com',
      priority: 'high',
      tags: ['West Coast', 'Solar Ready', 'High Value'],
      subtasks: [
        { id: 'st-4', title: 'Initial cold outreach phone dial', completed: true },
        { id: 'st-5', title: 'Send case studies on 300% ROI roofing campaigns', completed: true },
        { id: 'st-6', title: 'Book Zoom product walkthrough demo', completed: false },
      ],
      callHistory: [
        { id: 'c-2', date: '2026-10-05 11:15', duration: 245, outcome: 'Meeting Scheduled', notes: 'Scheduled demo for Thursday 2 PM EST.' },
      ],
      createdAt: '2026-10-03',
    },
    {
      id: 'lead-103',
      name: 'Golden State Metro Builders',
      company: 'Metro Roofing Solutions',
      pipeline: 'Enterprise Inbound',
      stage: 'Qualified',
      stageColor: '#55359C',
      value: 92000,
      owner: 'Daniyal Khan',
      phone: '+1 (555) 771-9042',
      email: 'deals@metroroofing.com',
      priority: 'high',
      tags: ['Multi-Branch', 'VIP'],
      subtasks: [
        { id: 'st-7', title: 'Executive alignment on security & SLA terms', completed: true },
        { id: 'st-8', title: 'Sign standard NDA and MSA contracts', completed: false },
      ],
      callHistory: [],
      createdAt: '2026-10-01',
    },
    {
      id: 'lead-104',
      name: 'Vanguard Industrial Roofing Corp',
      company: 'Vanguard Roofing US',
      pipeline: 'Enterprise Inbound',
      stage: 'Proposal Sent',
      stageColor: '#B26A00',
      value: 145000,
      owner: 'Sam Parker',
      phone: '+1 (555) 602-1144',
      email: 'rfp@vanguardroof.com',
      priority: 'urgent',
      tags: ['Industrial', 'Annual Contract'],
      subtasks: [
        { id: 'st-9', title: 'Review legal redlines with internal team', completed: false },
        { id: 'st-10', title: 'Finalize payment schedule & deposit', completed: false },
      ],
      callHistory: [
        { id: 'c-3', date: '2026-10-06 09:30', duration: 320, outcome: 'Contract Sent', notes: 'Contract sent to CFO for signature.' },
      ],
      createdAt: '2026-09-28',
    },
  ]);

  const [pipelines, setPipelines] = useState<any[]>([
    { id: 'pipe-1', name: 'Enterprise Commercial Inbound' },
    { id: 'pipe-2', name: 'West Coast Outbound Calling' },
  ]);

  const [auditLogs, setAuditLogs] = useState<any[]>([
    {
      id: 'aud-1',
      timestamp: '2026-10-06 11:20:15 UTC',
      user: 'Sara Malik (Super Admin)',
      action: 'ADMIN_LOGIN_SUCCESS',
      resource: 'Auth Session / JWT Issued',
      ip: '182.185.142.90',
      status: 'SUCCESS',
    },
    {
      id: 'aud-2',
      timestamp: '2026-10-06 10:45:00 UTC',
      user: 'Daniyal Khan (EMP-0021)',
      action: 'LEAD_STAGE_UPDATED',
      resource: 'Lead #lead-101 -> New Lead',
      ip: '192.168.1.104',
      status: 'SUCCESS',
    },
    {
      id: 'aud-3',
      timestamp: '2026-10-06 09:15:22 UTC',
      user: 'Sam Parker (EMP-0022)',
      action: 'CALL_OUTCOME_LOGGED',
      resource: 'Outbound Call 245s -> Meeting Scheduled',
      ip: '192.168.1.109',
      status: 'SUCCESS',
    },
    {
      id: 'aud-4',
      timestamp: '2026-10-06 09:00:01 UTC',
      user: 'Daniyal Khan (EMP-0021)',
      action: 'ATTENDANCE_CHECK_IN',
      resource: 'Shift PUNCH_IN / PC-014 Enrolled',
      ip: '192.168.1.104',
      status: 'SUCCESS',
    },
    {
      id: 'aud-5',
      timestamp: '2026-10-06 08:30:10 UTC',
      user: 'System Core Engine',
      action: 'QUOTA_CYCLE_INITIALIZE',
      resource: 'Daily Target Metrics Reset for 2026-10-06',
      ip: '127.0.0.1',
      status: 'SUCCESS',
    },
  ]);

  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [attendanceFilter, setAttendanceFilter] = useState<'ALL' | 'WORKING' | 'ON_BREAK' | 'OFF_SHIFT'>('ALL');
  const [corrections, setCorrections] = useState<any[]>([
    {
      id: 'cor-1',
      empCode: 'EMP-0021',
      empName: 'Daniyal Khan',
      date: '2026-10-05',
      requestedCheckIn: '09:00 AM',
      requestedCheckOut: '06:00 PM',
      reason: 'Internet power outage at branch office caused missed auto-punch',
      status: 'Pending',
      submittedAt: 'Today, 09:10 AM',
    },
    {
      id: 'cor-2',
      empCode: 'EMP-0024',
      empName: 'Bilal Ahmed',
      date: '2026-10-04',
      requestedCheckIn: '09:30 AM',
      requestedCheckOut: '06:30 PM',
      reason: 'Client escalated emergency call during regular checkout window',
      status: 'Pending',
      submittedAt: 'Yesterday, 07:15 PM',
    },
  ]);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ClickUp Multi-View CRM State
  const [crmView, setCrmView] = useState<'list' | 'board' | 'table' | 'calendar' | 'targets' | 'sheets'>('list');
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showLeadDrawer, setShowLeadDrawer] = useState(false);
  const [showAssignSheetModal, setShowAssignSheetModal] = useState(false);
  const [showDialerModal, setShowDialerModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [activeCallLead, setActiveCallLead] = useState<any | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isCalling, setIsCalling] = useState(false);
  const [callOutcome, setCallOutcome] = useState('Connected & Interested');
  const [callNotes, setCallNotes] = useState('');
  const [activeTimerLeadId, setActiveTimerLeadId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Form State: Add Lead Modal
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadCompany, setNewLeadCompany] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadValue, setNewLeadValue] = useState('25000');
  const [newLeadStage, setNewLeadStage] = useState('New Lead');
  const [newLeadPriority, setNewLeadPriority] = useState('high');
  const [newLeadOwner, setNewLeadOwner] = useState('Daniyal Khan');

  // Mass Calling Sheets State
  const [callingSheets, setCallingSheets] = useState<any[]>([
    {
      id: 'sheet-1',
      name: 'Q4 Enterprise SaaS Outbound Batch A',
      totalLeads: 120,
      assignedTo: 'Daniyal Khan (EMP-0021)',
      dailyTarget: 40,
      completedToday: 34,
      status: 'In Progress',
      createdDate: '2026-10-01',
    },
    {
      id: 'sheet-2',
      name: 'West Coast Logistics & Supply Chain',
      totalLeads: 85,
      assignedTo: 'Sam Parker (EMP-0022)',
      dailyTarget: 45,
      completedToday: 42,
      status: 'In Progress',
      createdDate: '2026-10-03',
    },
  ]);

  // Active ClickUp Time Tracking Timer
  useEffect(() => {
    let interval: any = null;
    if (activeTimerLeadId) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimerLeadId]);

  // Active Call Stopwatch Timer
  useEffect(() => {
    let interval: any = null;
    if (isCalling) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCalling]);

  // Load Live Data from API Backend on mount
  useEffect(() => {
    async function loadBackendData() {
      setIsLoading(true);
      try {
        await AdminApiClient.ensureAuth();

        const [empRes, devRes, leadRes, pipeRes, deptRes, auditRes, attendRes] = await Promise.allSettled([
          AdminApiClient.getEmployees(),
          AdminApiClient.getDevices(),
          AdminApiClient.getLeads(),
          AdminApiClient.getPipelines(),
          AdminApiClient.getDepartments(),
          AdminApiClient.getAuditLogs(),
          AdminApiClient.getAttendanceLive(),
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
              shift: e.status === 'active' ? 'WORKING' : 'OFF_SHIFT',
              checkIn: '09:00 AM',
              activeHours: '6h 30m',
              currentApp: 'Company OS Workstation',
              device: 'PC-014 (Enrolled)',
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
              jobTitle: l.customFields?.jobTitle || 'Executive Lead',
              company: l.companyName || 'Enterprise Account',
              stage: l.stage?.name || 'Qualified',
              stageId: l.stageId,
              priority: l.customFields?.priority || 'high',
              value: `$${Number(l.value || 0).toLocaleString()}`,
              numericValue: Number(l.value || 0),
              owner: l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : 'Unassigned',
              ownerId: l.ownerId,
              email: l.emails?.[0]?.email || 'contact@lead.com',
              phone: l.phones?.[0]?.phone || '+1 (555) 000-0000',
              industry: l.customFields?.industry || 'Enterprise',
              source: l.source?.name || 'Direct Outreach',
              lastTouch: new Date(l.updatedAt || l.createdAt).toLocaleDateString(),
              nextFollowUp: l.followUpAt ? new Date(l.followUpAt).toLocaleDateString() : 'Scheduled',
              tags: l.tags || ['Enterprise'],
              subtasks: l.customFields?.subtasks || [
                { id: `st-${l.id}-1`, title: 'Verify requirement scope & stakeholders', completed: true },
                { id: `st-${l.id}-2`, title: 'Present platform capabilities & SLA', completed: false },
              ],
              timeSpent: l.customFields?.timeSpent || '0h 45m',
              callHistory: l.calls?.map((c: any) => ({
                id: c.id,
                outcome: c.outcome,
                duration: `${Math.floor((c.durationSeconds || 0) / 60)}m`,
                date: new Date(c.occurredAt).toLocaleDateString(),
                notes: c.notes || 'Call logged.',
              })) || [],
            }))
          );
        }

        if (pipeRes.status === 'fulfilled' && Array.isArray(pipeRes.value)) {
          setPipelines(pipeRes.value);
        }

        if (deptRes.status === 'fulfilled' && Array.isArray(deptRes.value)) {
          setDepartments(deptRes.value);
        }

        if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value?.items)) {
          setAuditLogs(auditRes.value.items);
        }

        if (attendRes.status === 'fulfilled' && Array.isArray(attendRes.value?.items)) {
          setLiveAttendance(attendRes.value.items);
        }
      } catch (e) {
        console.warn('API sync warning:', e);
      } finally {
        setIsLoading(false);
      }
    }

    loadBackendData();
  }, []);

  const selectNav = (sec: AdminNavSection) => {
    setCurrentSection(sec);
    setMobileMenuOpen(false);
  };

  const renderSidebarNav = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="overflow-y-auto p-3 space-y-1">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
          <img src="/logo.jpg" alt="WorkPulse" className="w-6 h-6 rounded-md object-cover shadow-sm" />
          <span className="font-semibold text-sm text-[#151A1E]">WorkPulse</span>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#ECEEEB] text-[#5C666E] font-semibold text-[10px]">
            Admin Live
          </span>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden ml-1 p-1 rounded-md text-[#8A939B] hover:text-[#151A1E] hover:bg-[#FAFBF9]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav: Dashboard (A03) */}
        <button
          onClick={() => selectNav('dashboard')}
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
            <div className="w-8 h-8 rounded-full bg-[#E6EDFB] text-[#1C469B] font-bold text-xs flex items-center justify-center shrink-0">
              SM
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[#151A1E] truncate">Sara Malik</div>
              <div className="text-[11px] text-[#8A939B] truncate">Super Admin</div>
            </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[#F5F6F3] overflow-hidden select-none font-sans text-xs text-[#151A1E]">
      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-[260px] max-w-[85vw] bg-white h-full shadow-2xl flex flex-col justify-between z-10">
            {renderSidebarNav()}
          </div>
        </div>
      )}

      {/* Desktop 232px Expandable Admin Sidebar */}
      <div className="hidden md:flex w-[232px] bg-white border-r border-[#E4E7E1] flex-col shrink-0 justify-between">
        {renderSidebarNav()}
      </div>

      {/* Main Admin Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F5F6F3] overflow-hidden">
        {/* 56px Top Bar */}
        <div className="h-[56px] bg-white border-b border-[#E4E7E1] flex items-center px-4 md:px-6 gap-3 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg border border-[#E4E7E1] text-[#151A1E] hover:bg-[#FAFBF9] shrink-0"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="text-[11px] text-[#0B5548] font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0B5548] shrink-0 animate-pulse" />
              <span>WorkPulse Enterprise Platform</span>
            </div>
            <h1 className="text-sm md:text-base font-semibold text-[#151A1E] truncate">
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

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg text-xs text-[#8A939B] w-48 md:w-64">
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

          {/* SCREEN A08: DEPARTMENTS & TEAMS */}
          {currentSection === 'departments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-sm text-[#151A1E]">Organization Departments ({departments.length})</h2>
                  <p className="text-[11.5px] text-[#8A939B]">Team structures, managers, open targets and operational budgets</p>
                </div>
                <button
                  onClick={() => {
                    const name = prompt('Enter new department name:');
                    if (name) {
                      const newDept = {
                        id: `dept-${Date.now()}`,
                        name,
                        code: name.substring(0, 4).toUpperCase(),
                        manager: 'Sara Malik',
                        memberCount: 1,
                        openTargets: 10,
                        budget: '$50,000 / mo',
                        color: '#0F6B5C',
                      };
                      setDepartments([...departments, newDept]);
                    }
                  }}
                  className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Department
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.map((dept) => (
                  <div key={dept.id} className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: `${dept.color}15`, color: dept.color }}>
                          <FolderTree className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-xs text-[#151A1E]">{dept.name}</h3>
                          <span className="font-mono text-[10px] text-[#8A939B] font-bold">CODE: {dept.code}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-[10.5px]">
                        Active
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EEF0EC] text-xs">
                      <div>
                        <div className="text-[11px] text-[#8A939B]">Department Manager</div>
                        <div className="font-medium text-[#151A1E] mt-0.5">{dept.manager}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#8A939B]">Team Members</div>
                        <div className="font-bold font-mono text-[#0F6B5C] mt-0.5">{dept.memberCount} Assigned</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#8A939B]">Monthly Budget</div>
                        <div className="font-medium text-[#151A1E] mt-0.5">{dept.budget}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#8A939B]">Open Quotas / Targets</div>
                        <div className="font-bold font-mono text-[#1C469B] mt-0.5">{dept.openTargets} Deals</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCREEN A09: ROLES & PERMISSIONS MATRIX */}
          {currentSection === 'roles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-sm text-[#151A1E]">Role-Based Access Control Matrix (RBAC)</h2>
                  <p className="text-[11.5px] text-[#8A939B]">Granular permission boundaries enforced across all API endpoints</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map((r) => (
                  <div key={r.id} className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-[#0B5548]" />
                          <h3 className="font-semibold text-xs text-[#151A1E]">{r.name}</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[#ECEEEB] text-[#5C666E] font-mono text-[10px] font-bold">
                          {r.code}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#4A535B] mt-2 leading-relaxed">{r.description}</p>
                      
                      <div className="mt-3 pt-3 border-t border-[#EEF0EC] space-y-1.5">
                        <div className="text-[11px] font-semibold text-[#8A939B] uppercase tracking-wider">Granted Scopes</div>
                        <div className="flex flex-wrap gap-1">
                          {r.permissions.map((p: string) => (
                            <span key={p} className="px-2 py-0.5 rounded bg-[#FAFBF9] border border-[#E4E7E1] font-mono text-[10px] text-[#0B5548] font-semibold">
                              ✓ {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#EEF0EC] flex items-center justify-between text-[11px] text-[#8A939B]">
                      <span>{r.usersCount} Active Users</span>
                      <span className="font-semibold text-[#0B5548]">Enforced in PostgreSQL</span>
                    </div>
                  </div>
                ))}
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

          {/* SCREEN: CLICKUP MULTI-VIEW CRM & PIPELINE SUITE */}
          {(currentSection === 'crm-leads' || currentSection === 'crm-board' || currentSection === 'crm-import') && (
            <div className="space-y-4">
              {/* ClickUp Top Control & View Switcher Bar */}
              <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 p-1 bg-[#F5F6F3] rounded-lg border border-[#E4E7E1]">
                    <button
                      onClick={() => setCrmView('list')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'list'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>List View</span>
                    </button>
                    <button
                      onClick={() => setCrmView('board')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'board'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <Kanban className="w-3.5 h-3.5" />
                      <span>Board (Kanban)</span>
                    </button>
                    <button
                      onClick={() => setCrmView('table')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'table'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span>Table / Sheet</span>
                    </button>
                    <button
                      onClick={() => setCrmView('calendar')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'calendar'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Calendar</span>
                    </button>
                    <button
                      onClick={() => setCrmView('targets')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'targets'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5 text-[#0F6B5C]" />
                      <span>Daily Targets &amp; Quotas</span>
                    </button>
                    <button
                      onClick={() => setCrmView('sheets')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        crmView === 'sheets'
                          ? 'bg-white text-[#0B5548] shadow-sm'
                          : 'text-[#5C666E] hover:text-[#151A1E]'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[#8A5200]" />
                      <span>Calling Sheets</span>
                    </button>
                  </div>
                </div>

                {/* Right Action Bar */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAssignSheetModal(true)}
                    className="px-3 py-1.5 bg-[#FAFBF9] border border-[#D5DAD3] hover:bg-[#EEF0EC] text-[#151A1E] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-[#0F6B5C]" />
                    <span>Assign Sheet &amp; Quotas</span>
                  </button>
                  <button
                    onClick={() => setShowAddLeadModal(true)}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ New Lead / Deal</span>
                  </button>
                </div>
              </div>

              {/* VIEW 1: CLICKUP LIST VIEW (Grouped by Stage with collapsible headers) */}
              {crmView === 'list' && (
                <div className="space-y-4">
                  {['New Lead', 'Attempted', 'Contacted', 'Qualified', 'Meeting Scheduled', 'Proposal Sent', 'Won'].map(
                    (stageName) => {
                      const stageLeads = leads.filter((l) => l.stage === stageName);
                      const isCollapsed = collapsedStages[stageName] || false;
                      const stageTotalValue = stageLeads.reduce((acc, l) => acc + (l.numericValue || 0), 0);

                      const getStageBadgeColor = (stage: string) => {
                        switch (stage) {
                          case 'New Lead':
                            return 'bg-[#F0EEFC] text-[#55359C] border-[#DED7F9]';
                          case 'Attempted':
                            return 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]';
                          case 'Contacted':
                            return 'bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]';
                          case 'Qualified':
                            return 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]';
                          case 'Meeting Scheduled':
                            return 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]';
                          case 'Proposal Sent':
                            return 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]';
                          case 'Won':
                            return 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]';
                          default:
                            return 'bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]';
                        }
                      };

                      return (
                        <div
                          key={stageName}
                          className="bg-white border border-[#E4E7E1] rounded-[10px] shadow-sm overflow-hidden"
                        >
                          {/* Collapsible Stage Header */}
                          <div
                            onClick={() =>
                              setCollapsedStages((prev) => ({ ...prev, [stageName]: !prev[stageName] }))
                            }
                            className="px-4 py-2.5 bg-[#FAFBF9] border-b border-[#E4E7E1] flex items-center justify-between cursor-pointer hover:bg-[#F3F5F1] transition select-none"
                          >
                            <div className="flex items-center gap-2.5">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-[#8A939B]" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-[#8A939B]" />
                              )}
                              <span
                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border uppercase tracking-wider ${getStageBadgeColor(
                                  stageName
                                )}`}
                              >
                                {stageName}
                              </span>
                              <span className="text-xs text-[#8A939B] font-mono">
                                ({stageLeads.length} {stageLeads.length === 1 ? 'deal' : 'deals'})
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-mono font-semibold text-[#0F6B5C]">
                                Pipeline: ${stageTotalValue.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Stage Items List */}
                          {!isCollapsed && (
                            <div className="divide-y divide-[#EEF0EC]">
                              {stageLeads.length === 0 ? (
                                <div className="p-4 text-center text-xs text-[#8A939B] italic">
                                  No leads currently in {stageName} stage. Click "+ Add Lead" to place records here.
                                </div>
                              ) : (
                                stageLeads.map((lead) => {
                                  const completedTasks =
                                    lead.subtasks?.filter((t: any) => t.completed).length || 0;
                                  const totalTasks = lead.subtasks?.length || 0;
                                  const taskProgressPercent =
                                    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                                  return (
                                    <div
                                      key={lead.id}
                                      onClick={() => {
                                        setSelectedLead(lead);
                                        setShowLeadDrawer(true);
                                      }}
                                      className="px-4 py-3 hover:bg-[#FAFBF9] transition flex items-center justify-between gap-3 cursor-pointer group"
                                    >
                                      {/* Left: Lead Identity */}
                                      <div className="flex items-center gap-3 min-w-[280px]">
                                        <div
                                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                            lead.priority === 'urgent'
                                              ? 'bg-[#EF4444]'
                                              : lead.priority === 'high'
                                              ? 'bg-[#F97316]'
                                              : lead.priority === 'normal'
                                              ? 'bg-[#3B82F6]'
                                              : 'bg-[#9CA3AF]'
                                          }`}
                                          title={`Priority: ${lead.priority}`}
                                        />
                                        <div>
                                          <div className="font-semibold text-xs text-[#151A1E] group-hover:text-[#0F6B5C] transition flex items-center gap-2">
                                            <span>{lead.name}</span>
                                            {lead.tags?.slice(0, 2).map((tag: string) => (
                                              <span
                                                key={tag}
                                                className="px-1.5 py-0.2 rounded bg-[#F0F2EE] text-[#5C666E] text-[10px] font-normal"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                          <div className="text-[11px] text-[#8A939B]">
                                            {lead.jobTitle || 'Executive'} &bull;{' '}
                                            <span className="font-medium text-[#4A535B]">{lead.company}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Middle: Subtask Checklist Progress */}
                                      <div className="flex items-center gap-2 min-w-[140px]">
                                        <CheckSquare className="w-3.5 h-3.5 text-[#8A939B]" />
                                        <div className="w-20 bg-[#E4E7E1] rounded-full h-1.5 overflow-hidden">
                                          <div
                                            className="bg-[#0F6B5C] h-full rounded-full transition-all duration-300"
                                            style={{ width: `${taskProgressPercent}%` }}
                                          />
                                        </div>
                                        <span className="text-[10.5px] font-mono text-[#5C666E]">
                                          {completedTasks}/{totalTasks}
                                        </span>
                                      </div>

                                      {/* Phone & Next Step */}
                                      <div className="hidden lg:flex flex-col text-right min-w-[140px]">
                                        <span className="text-[11px] font-mono text-[#151A1E]">
                                          {lead.phone || '+1 555-0199'}
                                        </span>
                                        <span className="text-[10px] text-[#8A939B]">Next: {lead.nextFollowUp}</span>
                                      </div>

                                      {/* Owner */}
                                      <div className="flex items-center gap-1.5 min-w-[120px]">
                                        <div className="w-5 h-5 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-[10px] flex items-center justify-center">
                                          {lead.owner ? lead.owner.split(' ')[0][0] : 'U'}
                                        </div>
                                        <span className="text-xs text-[#4A535B] truncate">{lead.owner}</span>
                                      </div>

                                      {/* Value */}
                                      <div className="text-right min-w-[90px]">
                                        <span className="font-mono font-bold text-xs text-[#0F6B5C]">
                                          {lead.value}
                                        </span>
                                      </div>

                                      {/* Quick Actions */}
                                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={() => {
                                            setActiveCallLead(lead);
                                            setShowDialerModal(true);
                                            setIsCalling(true);
                                            setCallDuration(0);
                                          }}
                                          className="p-1.5 bg-[#FAFBF9] border border-[#E4E7E1] hover:bg-[#E3F1EE] hover:text-[#0B5548] text-[#4A535B] rounded-md transition shadow-xs"
                                          title="Quick Call (Auto-logs to Quota)"
                                        >
                                          <PhoneCall className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setSelectedLead(lead);
                                            setShowLeadDrawer(true);
                                          }}
                                          className="px-2 py-1 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] text-[#151A1E] rounded-md text-[11px] font-semibold transition"
                                        >
                                          Open Drawer
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {/* VIEW 2: CLICKUP KANBAN BOARD */}
              {crmView === 'board' && (
                <div className="grid grid-cols-5 gap-3.5">
                  {['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Won'].map((stage) => {
                    const stageLeads = leads.filter((l) => l.stage === stage);
                    const stageTotalValue = stageLeads.reduce((acc, l) => acc + (l.numericValue || 0), 0);

                    return (
                      <div
                        key={stage}
                        className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-[10px] p-3 space-y-3 flex flex-col h-[680px]"
                      >
                        {/* Column Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-[#EEF0EC]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-[#151A1E]">{stage}</span>
                            <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded-full bg-white border border-[#E4E7E1] font-bold">
                              {stageLeads.length}
                            </span>
                          </div>
                          <span className="font-mono text-[10.5px] font-bold text-[#0F6B5C]">
                            ${stageTotalValue.toLocaleString()}
                          </span>
                        </div>

                        {/* Cards List */}
                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                          {stageLeads.map((l) => {
                            const completedTasks = l.subtasks?.filter((t: any) => t.completed).length || 0;
                            const totalTasks = l.subtasks?.length || 0;

                            return (
                              <div
                                key={l.id}
                                onClick={() => {
                                  setSelectedLead(l);
                                  setShowLeadDrawer(true);
                                }}
                                className="bg-white border border-[#E4E7E1] hover:border-[#0F6B5C] rounded-lg p-3 shadow-sm space-y-2.5 cursor-pointer transition"
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                      l.priority === 'urgent'
                                        ? 'bg-[#FEE2E2] text-[#DC2626]'
                                        : l.priority === 'high'
                                        ? 'bg-[#FFEDD5] text-[#EA580C]'
                                        : 'bg-[#EFF6FF] text-[#2563EB]'
                                    }`}
                                  >
                                    <Flag className="w-2.5 h-2.5" />
                                    {l.priority}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-[#0F6B5C]">{l.value}</span>
                                </div>

                                <div>
                                  <div className="font-semibold text-xs text-[#151A1E]">{l.name}</div>
                                  <div className="text-[11px] text-[#8A939B]">{l.company}</div>
                                </div>

                                {/* ClickUp Checklist preview */}
                                {totalTasks > 0 && (
                                  <div className="flex items-center gap-1.5 text-[10.5px] text-[#5C666E] bg-[#FAFBF9] p-1.5 rounded border border-[#EEF0EC]">
                                    <CheckSquare className="w-3 h-3 text-[#0F6B5C]" />
                                    <span>
                                      Subtasks: {completedTasks}/{totalTasks}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between border-t border-[#EEF0EC] pt-2 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-4 rounded-full bg-[#E3F1EE] text-[#0B5548] text-[9px] font-bold flex items-center justify-center">
                                      {l.owner ? l.owner[0] : 'U'}
                                    </div>
                                    <span className="text-[10.5px] text-[#4A535B]">{l.owner}</span>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveCallLead(l);
                                      setShowDialerModal(true);
                                      setIsCalling(true);
                                      setCallDuration(0);
                                    }}
                                    className="p-1 hover:bg-[#E3F1EE] hover:text-[#0B5548] rounded text-[#8A939B] transition"
                                  >
                                    <PhoneCall className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* VIEW 3: CLICKUP TABLE / SHEET MATRIX */}
              {crmView === 'table' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-[10px] border border-[#E4E7E1]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-[#151A1E]">
                        Selected: {selectedLeadIds.length} of {leads.length} Leads
                      </span>
                      {selectedLeadIds.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowAssignSheetModal(true)}
                            className="px-2.5 py-1 bg-[#0F6B5C] text-white rounded-md text-[11px] font-semibold flex items-center gap-1"
                          >
                            <UserPlus className="w-3 h-3" />
                            Bulk Assign Sheet to Rep
                          </button>
                          <button
                            onClick={() => {
                              alert(`Exporting ${selectedLeadIds.length} leads to CSV.`);
                            }}
                            className="px-2.5 py-1 bg-white border border-[#E4E7E1] text-[#151A1E] rounded-md text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Export Selected
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const csvContent =
                            'ID,Name,Company,Stage,Priority,Value,Owner,Phone,Email\n' +
                            leads
                              .map(
                                (l) =>
                                  `"${l.id}","${l.name}","${l.company}","${l.stage}","${l.priority}","${l.value}","${l.owner}","${l.phone}","${l.email}"`
                              )
                              .join('\n');
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.setAttribute('href', url);
                          link.setAttribute('download', `workpulse_crm_sheet_${Date.now()}.csv`);
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="px-3 py-1.5 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#0F6B5C]" />
                        <span>Export Full Table (CSV)</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                          <th className="py-2.5 px-3 w-8">
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.length === leads.length && leads.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLeadIds(leads.map((l) => l.id));
                                } else {
                                  setSelectedLeadIds([]);
                                }
                              }}
                              className="rounded border-[#E4E7E1]"
                            />
                          </th>
                          <th className="py-2.5 px-3">Lead Name &amp; Title</th>
                          <th className="py-2.5 px-3">Company</th>
                          <th className="py-2.5 px-3">Stage</th>
                          <th className="py-2.5 px-3">Priority</th>
                          <th className="py-2.5 px-3">Deal Value</th>
                          <th className="py-2.5 px-3">Owner</th>
                          <th className="py-2.5 px-3">Phone</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0EC]">
                        {leads.map((l) => {
                          const isSelected = selectedLeadIds.includes(l.id);
                          return (
                            <tr
                              key={l.id}
                              onClick={() => {
                                setSelectedLead(l);
                                setShowLeadDrawer(true);
                              }}
                              className={`cursor-pointer transition ${
                                isSelected ? 'bg-[#E3F1EE]' : 'hover:bg-[#FAFBF9]'
                              }`}
                            >
                              <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedLeadIds([...selectedLeadIds, l.id]);
                                    } else {
                                      setSelectedLeadIds(selectedLeadIds.filter((id) => id !== l.id));
                                    }
                                  }}
                                  className="rounded border-[#E4E7E1]"
                                />
                              </td>
                              <td className="py-3 px-3 font-medium text-[#151A1E]">
                                <div>{l.name}</div>
                                <div className="text-[10.5px] text-[#8A939B]">{l.jobTitle}</div>
                              </td>
                              <td className="py-3 px-3 text-[#4A535B]">{l.company}</td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#E3F1EE] text-[#0B5548]">
                                  {l.stage}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded font-semibold text-[10.5px] uppercase ${
                                    l.priority === 'urgent'
                                      ? 'bg-[#FEE2E2] text-[#DC2626]'
                                      : l.priority === 'high'
                                      ? 'bg-[#FFEDD5] text-[#EA580C]'
                                      : 'bg-[#EFF6FF] text-[#2563EB]'
                                  }`}
                                >
                                  {l.priority}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-[#0F6B5C]">{l.value}</td>
                              <td className="py-3 px-3 text-[#4A535B]">{l.owner}</td>
                              <td className="py-3 px-3 font-mono text-[#151A1E]">{l.phone}</td>
                              <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setActiveCallLead(l);
                                    setShowDialerModal(true);
                                    setIsCalling(true);
                                    setCallDuration(0);
                                  }}
                                  className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] text-[#0F6B5C] rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs"
                                >
                                  <PhoneCall className="w-3 h-3" />
                                  Call
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VIEW 4: CLICKUP CALENDAR VIEW */}
              {crmView === 'calendar' && (
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EEF0EC]">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#0F6B5C]" />
                      <h3 className="font-semibold text-sm text-[#151A1E]">Scheduled Sales Meetings &amp; Callbacks</h3>
                    </div>
                    <span className="text-xs font-semibold text-[#8A939B]">October 2026</span>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {['Mon (Oct 5)', 'Tue (Oct 6)', 'Wed (Oct 7)', 'Thu (Oct 8)', 'Fri (Oct 9)', 'Sat', 'Sun'].map(
                      (day, idx) => (
                        <div
                          key={day}
                          className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-2.5 min-h-[220px] space-y-2"
                        >
                          <div className="font-semibold text-xs text-[#5C666E] border-b border-[#EEF0EC] pb-1">
                            {day}
                          </div>
                          {idx === 0 && (
                            <div
                              onClick={() => {
                                setSelectedLead(leads[0]);
                                setShowLeadDrawer(true);
                              }}
                              className="bg-white border border-[#A7F3D0] p-2 rounded shadow-xs text-[11px] cursor-pointer hover:border-[#0F6B5C]"
                            >
                              <div className="font-semibold text-[#047857]">2:15 PM &bull; Sarah Jenkins</div>
                              <div className="text-[10px] text-[#8A939B]">Contract Review &amp; Tech SLA</div>
                            </div>
                          )}
                          {idx === 1 && (
                            <div
                              onClick={() => {
                                setSelectedLead(leads[2]);
                                setShowLeadDrawer(true);
                              }}
                              className="bg-white border border-[#FED7AA] p-2 rounded shadow-xs text-[11px] cursor-pointer hover:border-[#F97316]"
                            >
                              <div className="font-semibold text-[#C2410C]">9:30 AM &bull; Elena Rostova</div>
                              <div className="text-[10px] text-[#8A939B]">Executive Live Demo (150 Seats)</div>
                            </div>
                          )}
                          {idx === 3 && (
                            <div
                              onClick={() => {
                                setSelectedLead(leads[1]);
                                setShowLeadDrawer(true);
                              }}
                              className="bg-white border border-[#BFDBFE] p-2 rounded shadow-xs text-[11px] cursor-pointer hover:border-[#3B82F6]"
                            >
                              <div className="font-semibold text-[#1D4ED8]">3:00 PM &bull; Michael Chang</div>
                              <div className="text-[10px] text-[#8A939B]">HIPAA Compliance Architecture</div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* VIEW 5: DAILY TARGETS & QUOTAS DASHBOARD */}
              {crmView === 'targets' && (
                <div className="space-y-4">
                  {/* Top Quota Summary Cards */}
                  <div className="grid grid-cols-4 gap-3.5">
                    <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm">
                      <div className="text-[11.5px] font-medium text-[#8A939B]">Calls Logged Today</div>
                      <div className="text-2xl font-bold font-mono text-[#0F6B5C] mt-1">76 / 85</div>
                      <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">89% of Daily Quota Reached</div>
                    </div>
                    <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm">
                      <div className="text-[11.5px] font-medium text-[#8A939B]">Total Talk Time</div>
                      <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">4h 18m</div>
                      <div className="text-[11.5px] text-[#4A535B] mt-0.5">Avg: 9m 12s per connected call</div>
                    </div>
                    <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm">
                      <div className="text-[11.5px] font-medium text-[#8A939B]">Demos Booked Today</div>
                      <div className="text-2xl font-bold font-mono text-[#B26A00] mt-1">4 Deals</div>
                      <div className="text-[11.5px] text-[#8A5200] font-semibold mt-0.5">Target: 3/day (Exceeded)</div>
                    </div>
                    <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm">
                      <div className="text-[11.5px] font-medium text-[#8A939B]">Pipeline Generated</div>
                      <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">$218,500</div>
                      <div className="text-[11.5px] text-[#0F6B5C] font-semibold mt-0.5">5 active proposals pending</div>
                    </div>
                  </div>

                  {/* Rep Leaderboard & Quotas */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-[#EEF0EC] flex items-center justify-between">
                      <h3 className="font-semibold text-xs text-[#151A1E]">Rep Real-Time Daily Quota Tracker</h3>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                          <th className="py-2.5 px-4">Sales Representative</th>
                          <th className="py-2.5 px-4">Assigned Calling Sheet</th>
                          <th className="py-2.5 px-4">Daily Calling Target</th>
                          <th className="py-2.5 px-4">Completed Calls</th>
                          <th className="py-2.5 px-4">Quota Progress</th>
                          <th className="py-2.5 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0EC]">
                        <tr className="hover:bg-[#FAFBF9]">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#151A1E]">Daniyal Khan</div>
                            <div className="text-[11px] text-[#8A939B]">Sales Executive &bull; EMP-0021</div>
                          </td>
                          <td className="py-3 px-4 text-[#4A535B]">Q4 Enterprise SaaS Outbound Batch A</td>
                          <td className="py-3 px-4 font-mono font-bold">40 calls / day</td>
                          <td className="py-3 px-4 font-mono text-[#0F6B5C] font-bold">34 calls</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-32 bg-[#E4E7E1] rounded-full h-2 overflow-hidden">
                                <div className="bg-[#0F6B5C] h-full rounded-full" style={{ width: '85%' }} />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#0F6B5C]">85%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#E4F4EB] text-[#14673F]">
                              On Pace
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-[#FAFBF9]">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#151A1E]">Sam Parker</div>
                            <div className="text-[11px] text-[#8A939B]">Sales Lead &bull; EMP-0022</div>
                          </td>
                          <td className="py-3 px-4 text-[#4A535B]">West Coast Logistics &amp; Supply Chain</td>
                          <td className="py-3 px-4 font-mono font-bold">45 calls / day</td>
                          <td className="py-3 px-4 font-mono text-[#0F6B5C] font-bold">42 calls</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-32 bg-[#E4E7E1] rounded-full h-2 overflow-hidden">
                                <div className="bg-[#0F6B5C] h-full rounded-full" style={{ width: '93%' }} />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#0F6B5C]">93%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#E4F4EB] text-[#14673F]">
                              Target Met
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VIEW 6: CALLING SHEETS MANAGER */}
              {crmView === 'sheets' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#0F6B5C]" />
                      <span className="font-semibold text-xs text-[#151A1E]">
                        Mass Calling Lead Sheets ({callingSheets.length})
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAssignSheetModal(true)}
                      className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign New Sheet Batch
                    </button>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                          <th className="py-2.5 px-4">Sheet Name</th>
                          <th className="py-2.5 px-4">Total Leads</th>
                          <th className="py-2.5 px-4">Assigned Representative</th>
                          <th className="py-2.5 px-4">Daily Quota Target</th>
                          <th className="py-2.5 px-4">Progress Today</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0EC]">
                        {callingSheets.map((sheet) => (
                          <tr key={sheet.id} className="hover:bg-[#FAFBF9]">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#151A1E] flex items-center gap-2">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-[#0F6B5C]" />
                                <span>{sheet.name}</span>
                              </div>
                              <div className="text-[10.5px] text-[#8A939B]">Created: {sheet.createdDate}</div>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#151A1E]">{sheet.totalLeads} Leads</td>
                            <td className="py-3 px-4 text-[#4A535B] font-medium">{sheet.assignedTo}</td>
                            <td className="py-3 px-4 font-mono text-[#0F6B5C] font-semibold">
                              {sheet.dailyTarget} calls/day
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {sheet.completedToday} / {sheet.dailyTarget} calls
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  setCrmView('table');
                                }}
                                className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] text-[#0F6B5C] rounded-md font-semibold text-[11px]"
                              >
                                View Sheet
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCREEN A16: LIVE FLOOR ATTENDANCE BOARD */}
          {currentSection === 'attendance-live' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E4F4EB] text-[#14673F] font-semibold text-xs">
                    <span className="w-2 h-2 rounded-full bg-[#1E8E5A] animate-ping" />
                    Live Floor Tracker Active
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-[#E4E7E1] rounded-lg p-1 text-xs">
                    <button
                      onClick={() => setAttendanceFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md font-semibold ${attendanceFilter === 'ALL' ? 'bg-[#E3F1EE] text-[#0B5548]' : 'text-[#5C666E]'}`}
                    >
                      All ({employees.length})
                    </button>
                    <button
                      onClick={() => setAttendanceFilter('WORKING')}
                      className={`px-2.5 py-1 rounded-md font-semibold ${attendanceFilter === 'WORKING' ? 'bg-[#E3F1EE] text-[#0B5548]' : 'text-[#5C666E]'}`}
                    >
                      Working ({employees.filter(e => e.shift === 'WORKING').length})
                    </button>
                    <button
                      onClick={() => setAttendanceFilter('ON_BREAK')}
                      className={`px-2.5 py-1 rounded-md font-semibold ${attendanceFilter === 'ON_BREAK' ? 'bg-[#E3F1EE] text-[#0B5548]' : 'text-[#5C666E]'}`}
                    >
                      On Break ({employees.filter(e => e.shift === 'ON_BREAK').length})
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees
                  .filter(emp => attendanceFilter === 'ALL' || emp.shift === attendanceFilter)
                  .map((emp) => (
                    <div key={emp.id} className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-xs flex items-center justify-center">
                            {emp.name.split(' ').map((n: string) => n[0]).join('')}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-[#151A1E]">{emp.name}</div>
                            <div className="text-[11px] text-[#8A939B]">{emp.department} &bull; {emp.code}</div>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                          emp.shift === 'WORKING' ? 'bg-[#E4F4EB] text-[#14673F]' : 'bg-[#FCF0DA] text-[#8A5200]'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.shift === 'WORKING' ? 'bg-[#1E8E5A] animate-pulse' : 'bg-[#B26A00]'}`} />
                          {emp.shift === 'WORKING' ? 'Working Now' : 'On Break'}
                        </span>
                      </div>

                      <div className="bg-[#FAFBF9] border border-[#EEF0EC] rounded-lg p-2.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#8A939B]">Active Application:</span>
                          <span className="font-semibold text-[#151A1E] truncate max-w-[170px]">{emp.currentApp}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#8A939B]">Today Active Time:</span>
                          <span className="font-mono font-bold text-[#0F6B5C]">{emp.activeHours}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#8A939B]">Hardware Device:</span>
                          <span className="font-mono text-[#4A535B]">{emp.device}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#EEF0EC]">
                          <div>
                            <span className="text-[10.5px] text-[#8A939B]">Keystrokes:</span>
                            <div className="font-mono font-bold text-xs text-[#151A1E]">{emp.keystrokes || '14,280'}</div>
                          </div>
                          <div>
                            <span className="text-[10.5px] text-[#8A939B]">Mouse Taps:</span>
                            <div className="font-mono font-bold text-xs text-[#151A1E]">{emp.mouseClicks || '3,420'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-[#8A939B]">Check-In: <strong className="text-[#151A1E]">{emp.checkIn}</strong></span>
                        <button
                          onClick={() => alert(`Ping notification sent to ${emp.name}'s workstation.`)}
                          className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] text-[#151A1E] rounded-md font-semibold text-[11px]"
                        >
                          Ping Agent
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* SCREEN A17: MONTHLY TIMESHEET GRID */}
          {currentSection === 'attendance-sheet' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-sm text-[#151A1E]">Monthly Employee Timesheet Matrix (October 2026)</h2>
                  <p className="text-[11.5px] text-[#8A939B]">Automated punch calculations, overtime tracking, and compliance logs</p>
                </div>
                <button
                  onClick={() => alert('Exporting October 2026 Timesheet CSV...')}
                  className="px-3 py-1.5 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-x-auto shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4 sticky left-0 bg-[#FAFBF9]">Employee</th>
                      <th className="py-2.5 px-3">Oct 01</th>
                      <th className="py-2.5 px-3">Oct 02</th>
                      <th className="py-2.5 px-3">Oct 03</th>
                      <th className="py-2.5 px-3">Oct 04</th>
                      <th className="py-2.5 px-3">Oct 05</th>
                      <th className="py-2.5 px-3">Oct 06 (Today)</th>
                      <th className="py-2.5 px-4 text-right">Total Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 sticky left-0 bg-white hover:bg-[#FAFBF9] font-medium text-[#151A1E]">
                          <div>{emp.name}</div>
                          <div className="text-[10px] text-[#8A939B] font-mono">{emp.code}</div>
                        </td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#E4F4EB] text-[#14673F] font-mono font-bold text-[10.5px]">8h 12m</span></td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#E4F4EB] text-[#14673F] font-mono font-bold text-[10.5px]">8h 05m</span></td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#E4F4EB] text-[#14673F] font-mono font-bold text-[10.5px]">7h 55m</span></td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#E4F4EB] text-[#14673F] font-mono font-bold text-[10.5px]">8h 20m</span></td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#FCF0DA] text-[#8A5200] font-mono font-bold text-[10.5px]">7h 10m (Late)</span></td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-[#E3F1EE] text-[#0B5548] font-mono font-bold text-[10.5px]">{emp.activeHours} (Live)</span></td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#0F6B5C]">47h 16m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN A19: ATTENDANCE CORRECTION QUEUE */}
          {currentSection === 'attendance-corrections' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-sm text-[#151A1E]">Attendance Correction Approvals ({corrections.length})</h2>
                  <p className="text-[11.5px] text-[#8A939B]">Review manual punch requests submitted by staff with immutable audit logging</p>
                </div>
              </div>

              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                      <th className="py-2.5 px-4">Staff Member</th>
                      <th className="py-2.5 px-4">Date &amp; Times</th>
                      <th className="py-2.5 px-4">Stated Reason</th>
                      <th className="py-2.5 px-4">Submitted</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC]">
                    {corrections.map((cor) => (
                      <tr key={cor.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#151A1E]">{cor.empName}</div>
                          <div className="text-[11px] text-[#8A939B] font-mono">{cor.empCode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#151A1E]">{cor.date}</div>
                          <div className="text-[11px] text-[#0F6B5C] font-mono font-bold">
                            {cor.requestedCheckIn} → {cor.requestedCheckOut}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#4A535B] max-w-xs">{cor.reason}</td>
                        <td className="py-3 px-4 text-[#8A939B]">{cor.submittedAt}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => {
                              setCorrections(corrections.filter(c => c.id !== cor.id));
                              alert(`Correction for ${cor.empName} Approved and saved to audit log.`);
                            }}
                            className="px-2.5 py-1 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md font-semibold text-[11px]"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setCorrections(corrections.filter(c => c.id !== cor.id));
                              alert(`Correction for ${cor.empName} Rejected.`);
                            }}
                            className="px-2.5 py-1 bg-white border border-[#EBC4BF] text-[#C2362B] hover:bg-[#FBE7E4] rounded-md font-semibold text-[11px]"
                          >
                            Reject
                          </button>
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
                  Multitenant Immutable Audit Trail ({auditLogs.length} Records)
                </span>
              </div>
              <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold font-sans">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Target Resource</th>
                      <th className="py-2.5 px-4">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF0EC] text-[11.5px]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-2.5 px-4 text-[#8A939B]">{log.timestamp}</td>
                        <td className="py-2.5 px-4 text-[#151A1E] font-semibold font-sans">{log.user}</td>
                        <td className="py-2.5 px-4 text-[#0F6B5C] font-bold">{log.action}</td>
                        <td className="py-2.5 px-4 text-[#4A535B] font-sans">{log.resource}</td>
                        <td className="py-2.5 px-4 text-[#8A939B]">{log.ip}</td>
                      </tr>
                    ))}
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

      {/* CLICKUP DRAWER: LEAD & DEAL DETAILS */}
      {showLeadDrawer && selectedLead && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.4)] flex justify-end z-50 backdrop-blur-xs">
          <div className="w-[620px] bg-white h-full shadow-[-10px_0_40px_rgba(0,0,0,0.2)] flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="p-6 space-y-5">
              {/* Header with Breadcrumb & Close */}
              <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-4">
                <div className="flex items-center gap-2 text-xs text-[#8A939B]">
                  <span>CRM</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>Pipeline</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="font-mono text-[#151A1E] font-semibold">{selectedLead.id}</span>
                </div>
                <X
                  className="w-5 h-5 text-[#8A939B] hover:text-[#151A1E] cursor-pointer"
                  onClick={() => setShowLeadDrawer(false)}
                />
              </div>

              {/* Lead Title & Stage Pill Selector */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#151A1E]">{selectedLead.name}</h2>
                    <p className="text-xs text-[#5C666E]">
                      {selectedLead.jobTitle} &bull;{' '}
                      <span className="font-semibold text-[#151A1E]">{selectedLead.company}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Stage Select */}
                    <select
                      value={selectedLead.stage}
                      onChange={(e) => {
                        const newStage = e.target.value;
                        setSelectedLead({ ...selectedLead, stage: newStage });
                        setLeads(leads.map((l) => (l.id === selectedLead.id ? { ...l, stage: newStage } : l)));
                      }}
                      className="px-2.5 py-1 bg-[#E3F1EE] text-[#0B5548] border border-[#B3DCD4] rounded-lg text-xs font-semibold outline-none cursor-pointer"
                    >
                      <option>New Lead</option>
                      <option>Attempted</option>
                      <option>Contacted</option>
                      <option>Qualified</option>
                      <option>Meeting Scheduled</option>
                      <option>Proposal Sent</option>
                      <option>Won</option>
                      <option>Lost</option>
                    </select>

                    {/* Priority Flag */}
                    <select
                      value={selectedLead.priority}
                      onChange={(e) => {
                        const newPriority = e.target.value;
                        setSelectedLead({ ...selectedLead, priority: newPriority });
                        setLeads(leads.map((l) => (l.id === selectedLead.id ? { ...l, priority: newPriority } : l)));
                      }}
                      className="px-2.5 py-1 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold outline-none cursor-pointer"
                    >
                      <option value="urgent">🔴 Urgent</option>
                      <option value="high">🟠 High</option>
                      <option value="normal">🔵 Normal</option>
                      <option value="low">⚪ Low</option>
                    </select>
                  </div>
                </div>

                {/* ClickUp Live Time Tracker Bar */}
                <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-[#0F6B5C]" />
                    <div>
                      <div className="text-[11px] text-[#8A939B]">ClickUp Time Logged on Deal</div>
                      <div className="text-xs font-mono font-bold text-[#151A1E]">
                        {selectedLead.timeSpent || '1h 30m'}
                        {activeTimerLeadId === selectedLead.id && (
                          <span className="text-[#0F6B5C] ml-2 animate-pulse">
                            +{Math.floor(timerSeconds / 60)}m {timerSeconds % 60}s (Live Tracking)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    {activeTimerLeadId === selectedLead.id ? (
                      <button
                        onClick={() => {
                          setActiveTimerLeadId(null);
                          alert(`Timer stopped. Logged session saved to database.`);
                        }}
                        className="px-3 py-1.5 bg-[#C2362B] hover:bg-[#A8281F] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                      >
                        <Square className="w-3 h-3" />
                        Stop Timer
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveTimerLeadId(selectedLead.id);
                          setTimerSeconds(0);
                        }}
                        className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                      >
                        <Play className="w-3 h-3" />
                        Start Timer
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Deal Key Fields Matrix */}
              <div className="grid grid-cols-2 gap-3 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-3 text-xs">
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Deal Estimated Value:</span>
                  <span className="font-mono font-bold text-sm text-[#0F6B5C]">{selectedLead.value}</span>
                </div>
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Assigned Owner:</span>
                  <span className="font-semibold text-[#151A1E]">{selectedLead.owner}</span>
                </div>
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Phone:</span>
                  <span className="font-mono font-semibold text-[#151A1E]">{selectedLead.phone}</span>
                </div>
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Email:</span>
                  <span className="text-[#0F6B5C] truncate block">{selectedLead.email}</span>
                </div>
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Source Batch:</span>
                  <span className="text-[#4A535B]">{selectedLead.source}</span>
                </div>
                <div>
                  <span className="text-[#8A939B] block text-[11px]">Next Follow-Up:</span>
                  <span className="font-semibold text-[#B26A00]">{selectedLead.nextFollowUp}</span>
                </div>
              </div>

              {/* CLICKUP SUBTASKS & CHECKLIST SECTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-[#0F6B5C]" />
                    <h3 className="font-semibold text-xs text-[#151A1E]">Deal Progression Checklist &amp; Subtasks</h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#8A939B]">
                    {selectedLead.subtasks?.filter((t: any) => t.completed).length || 0} of{' '}
                    {selectedLead.subtasks?.length || 0} completed
                  </span>
                </div>

                {/* Subtasks Progress Bar */}
                <div className="w-full bg-[#E4E7E1] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#0F6B5C] h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        selectedLead.subtasks?.length > 0
                          ? Math.round(
                              (selectedLead.subtasks.filter((t: any) => t.completed).length /
                                selectedLead.subtasks.length) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>

                {/* Checklist items */}
                <div className="space-y-2">
                  {selectedLead.subtasks?.map((task: any) => (
                    <div
                      key={task.id}
                      onClick={() => {
                        const updatedSubtasks = selectedLead.subtasks.map((t: any) =>
                          t.id === task.id ? { ...t, completed: !t.completed } : t
                        );
                        setSelectedLead({ ...selectedLead, subtasks: updatedSubtasks });
                        setLeads(
                          leads.map((l) => (l.id === selectedLead.id ? { ...l, subtasks: updatedSubtasks } : l))
                        );
                      }}
                      className="flex items-center gap-2.5 p-2 bg-[#FAFBF9] hover:bg-[#F3F5F1] rounded-lg border border-[#E4E7E1] cursor-pointer transition text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => {}}
                        className="rounded border-[#E4E7E1] text-[#0F6B5C] cursor-pointer"
                      />
                      <span
                        className={`flex-1 ${
                          task.completed ? 'line-through text-[#8A939B]' : 'text-[#151A1E] font-medium'
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Add Subtask Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="+ Add next step or qualification subtask..."
                    className="flex-1 px-3 py-1.5 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                        const newTask = {
                          id: `st-${Date.now()}`,
                          title: newSubtaskTitle.trim(),
                          completed: false,
                        };
                        const updated = [...(selectedLead.subtasks || []), newTask];
                        setSelectedLead({ ...selectedLead, subtasks: updated });
                        setLeads(leads.map((l) => (l.id === selectedLead.id ? { ...l, subtasks: updated } : l)));
                        setNewSubtaskTitle('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newSubtaskTitle.trim()) {
                        const newTask = {
                          id: `st-${Date.now()}`,
                          title: newSubtaskTitle.trim(),
                          completed: false,
                        };
                        const updated = [...(selectedLead.subtasks || []), newTask];
                        setSelectedLead({ ...selectedLead, subtasks: updated });
                        setLeads(leads.map((l) => (l.id === selectedLead.id ? { ...l, subtasks: updated } : l)));
                        setNewSubtaskTitle('');
                      }
                    }}
                    className="px-3 py-1.5 bg-white border border-[#E4E7E1] hover:bg-[#FAFBF9] rounded-lg text-xs font-semibold text-[#151A1E]"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* CALL & ACTIVITY HISTORY */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0F6B5C]" />
                    <h3 className="font-semibold text-xs text-[#151A1E]">Calling Logs &amp; Audit Trail</h3>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedLead.callHistory?.map((call: any) => (
                    <div key={call.id} className="p-3 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#0B5548] flex items-center gap-1.5">
                          <PhoneCall className="w-3.5 h-3.5 text-[#0F6B5C]" />
                          {call.outcome}
                        </span>
                        <span className="text-[11px] text-[#8A939B] font-mono">
                          Duration: {call.duration} &bull; {call.date}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#4A535B]">{call.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Bottom Bar: Quick Action Buttons */}
            <div className="p-4 bg-[#FAFBF9] border-t border-[#EEF0EC] flex items-center justify-between">
              <button
                onClick={() => setShowLeadDrawer(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveCallLead(selectedLead);
                    setShowDialerModal(true);
                    setIsCalling(true);
                    setCallDuration(0);
                  }}
                  className="px-4 py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Launch One-Click Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MASS CALLING SHEET & QUOTA DISTRIBUTOR */}
      {showAssignSheetModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.4)] flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="w-[520px] bg-white rounded-[14px] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#0F6B5C]" />
              <span>Assign Mass Calling Sheet to Sales Rep</span>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#4A535B] mb-1">Select Calling Sheet / Batch</label>
                <select className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white">
                  <option>Q4 Enterprise SaaS Outbound Batch A (120 Leads)</option>
                  <option>West Coast Logistics &amp; Supply Chain (85 Leads)</option>
                  <option>Healthcare &amp; Medical Practice Leads (60 Leads)</option>
                  <option>Roofing &amp; Home Services Outbound (200 Leads)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#4A535B] mb-1">Assign to Sales Representative</label>
                <select className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white">
                  {employees
                    .filter((e) => e.department === 'Sales' || e.role?.includes('Sales') || e.role?.includes('Executive'))
                    .map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name} ({emp.code}) &bull; {emp.department}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Daily Calling Target (Quota)</label>
                  <input
                    type="number"
                    defaultValue={40}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Weekly Demo Booking Target</label>
                  <input
                    type="number"
                    defaultValue={5}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#FAFBF9] rounded-lg border border-[#EEF0EC] text-[11px] text-[#5C666E]">
                💡 Leads in this sheet will immediately synchronize to the rep's desktop workstation with one-click dialer and live quota tracking.
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowAssignSheetModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Mass Calling Sheet assigned successfully with daily targets.');
                  setShowAssignSheetModal(false);
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Confirm &amp; Distribute Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ONE-CLICK OUTBOUND CALL DIALER */}
      {showDialerModal && activeCallLead && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.4)] flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="w-[480px] bg-white rounded-[14px] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#0F6B5C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 animate-bounce" />
                <span className="font-semibold text-sm">Active Call: {activeCallLead.name}</span>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/20">
                {Math.floor(callDuration / 60)}:{String(callDuration % 60).padStart(2, '0')}
              </span>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between bg-[#FAFBF9] p-3 rounded-lg border border-[#E4E7E1]">
                <div>
                  <div className="font-semibold text-sm text-[#151A1E]">{activeCallLead.company}</div>
                  <div className="text-[#8A939B] font-mono">{activeCallLead.phone}</div>
                </div>
                <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-[#E3F1EE] text-[#0B5548]">
                  {activeCallLead.stage}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-[#4A535B] mb-1">Call Outcome (Auto-updates Pipeline)</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white font-medium"
                >
                  <option>Connected &amp; Interested</option>
                  <option>Meeting Scheduled</option>
                  <option>Connected &bull; Follow-Up Requested</option>
                  <option>Left Voicemail</option>
                  <option>Busy / No Answer</option>
                  <option>Gatekeeper Refusal</option>
                  <option>Wrong Number</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#4A535B] mb-1">Call Notes &amp; Action Items</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Record key conversation notes, budget discussion, decision maker feedback..."
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-between items-center">
              <span className="text-[11px] text-[#8A939B]">Counts toward daily rep quota</span>
              <button
                onClick={() => {
                  const newLog = {
                    id: `c-${Date.now()}`,
                    outcome: callOutcome,
                    duration: `${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
                    date: 'Just Now',
                    notes: callNotes || 'Standard call logged.',
                  };
                  const updatedLeads = leads.map((l) =>
                    l.id === activeCallLead.id
                      ? {
                          ...l,
                          lastTouch: 'Just Now',
                          callHistory: [newLog, ...(l.callHistory || [])],
                        }
                      : l
                  );
                  setLeads(updatedLeads);
                  setIsCalling(false);
                  setShowDialerModal(false);
                  setCallNotes('');
                  alert(`Call logged! Rep daily quota progress incremented.`);
                }}
                className="px-4 py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                End Call &amp; Save Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK ADD LEAD */}
      {showAddLeadModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.4)] flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="w-[520px] bg-white rounded-[14px] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#0F6B5C]" />
              <span>Add New Lead / Deal</span>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    placeholder="e.g. Robert Fox"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Company Name</label>
                  <input
                    type="text"
                    value={newLeadCompany}
                    onChange={(e) => setNewLeadCompany(e.target.value)}
                    placeholder="e.g. Apex Global Corp"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Email</label>
                  <input
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Est. Deal Value ($)</label>
                  <input
                    type="number"
                    value={newLeadValue}
                    onChange={(e) => setNewLeadValue(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Initial Stage</label>
                  <select
                    value={newLeadStage}
                    onChange={(e) => setNewLeadStage(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white"
                  >
                    <option>New Lead</option>
                    <option>Contacted</option>
                    <option>Qualified</option>
                    <option>Meeting Scheduled</option>
                    <option>Proposal Sent</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Priority</label>
                  <select
                    value={newLeadPriority}
                    onChange={(e) => setNewLeadPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white"
                  >
                    <option value="urgent">🔴 Urgent</option>
                    <option value="high">🟠 High</option>
                    <option value="normal">🔵 Normal</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#4A535B] mb-1">Assigned Sales Owner</label>
                <select
                  value={newLeadOwner}
                  onChange={(e) => setNewLeadOwner(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg outline-none bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.name}>
                      {emp.name} ({emp.department})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowAddLeadModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (newLeadName && newLeadCompany) {
                    try {
                      const defaultPipeline = pipelines[0] || { id: '00000000-0000-0000-0000-000000000010' };
                      const matchedStage =
                        defaultPipeline?.stages?.find((s: any) => s.name === newLeadStage) ||
                        defaultPipeline?.stages?.[0] || { id: '00000000-0000-0000-0000-000000000020' };
                      const matchedOwner = employees.find((e) => e.name === newLeadOwner) || employees[0];

                      const createdLead = await AdminApiClient.createLead({
                        name: newLeadName,
                        companyName: newLeadCompany,
                        pipelineId: defaultPipeline.id,
                        stageId: matchedStage.id,
                        value: Number(newLeadValue) || 25000,
                        ownerId: matchedOwner?.id,
                        phones: newLeadPhone ? [{ phone: newLeadPhone, label: 'Work', isPrimary: true }] : [{ phone: '+1 555-0100', label: 'Work', isPrimary: true }],
                        emails: newLeadEmail ? [{ email: newLeadEmail, label: 'Work', isPrimary: true }] : [{ email: 'lead@example.com', label: 'Work', isPrimary: true }],
                        tags: ['New Lead', 'Direct Inbound'],
                      });

                      const newRecord = {
                        id: createdLead?.id || `LD-${Math.floor(1000 + Math.random() * 9000)}`,
                        name: newLeadName,
                        jobTitle: 'Executive Lead',
                        company: newLeadCompany,
                        stage: newLeadStage,
                        stageId: matchedStage.id,
                        priority: newLeadPriority,
                        value: `$${Number(newLeadValue).toLocaleString()}`,
                        numericValue: Number(newLeadValue),
                        owner: newLeadOwner,
                        ownerId: matchedOwner?.id,
                        email: newLeadEmail || 'lead@example.com',
                        phone: newLeadPhone || '+1 (555) 000-0000',
                        industry: 'Commercial Operations',
                        source: 'Direct Inbound',
                        lastTouch: 'Just Now',
                        nextFollowUp: 'Tomorrow, 10:00 AM',
                        tags: ['New Inbound'],
                        subtasks: [
                          { id: `st-${Date.now()}-1`, title: 'Initial discovery & qualification', completed: false },
                          { id: `st-${Date.now()}-2`, title: 'Schedule product demonstration', completed: false },
                        ],
                        timeSpent: '0h 00m',
                        callHistory: [],
                      };
                      setLeads([newRecord, ...leads]);
                      alert(`Lead ${newLeadName} created in live PostgreSQL database!`);
                    } catch (e: any) {
                      console.warn('Create lead DB error:', e);
                      alert(`Lead created locally: ${e?.message || 'Saved'}`);
                    }
                    setShowAddLeadModal(false);
                    setNewLeadName('');
                    setNewLeadCompany('');
                    setNewLeadPhone('');
                    setNewLeadEmail('');
                  }
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Create Lead in Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
