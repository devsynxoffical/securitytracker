import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Contact,
  Target,
  CalendarCheck,
  Upload,
  Settings,
  Clock,
  Activity,
  Mail,
  BarChart3,
  Shield,
  Sliders,
  CheckSquare,
  ListTodo,
  FolderKanban,
  Gauge,
  CalendarDays,
  Plane,
  UserCheck,
  Megaphone,
  Network,
  Timer,
  MonitorSmartphone,
  Globe,
  AlertTriangle,
  Inbox,
  FileText,
  Tags,
  KeyRound,
  ScrollText,
  Bell,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the admin navigation. Module builders add pages at these
 * routes; this file is owned by the shell so parallel work never collides on it.
 * `permission` hides the entry client-side; the server still enforces (05 FR-RBAC-03).
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Any of these permissions shows the item. */
  anyPermission?: string[];
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: 'home',
    label: 'Home',
    items: [{ label: 'Overview', href: '/admin', icon: LayoutDashboard }],
  },
  {
    key: 'crm',
    label: 'CRM',
    items: [
      { label: 'Dashboard', href: '/admin/crm/dashboard', icon: BarChart3, permission: 'crm.deals.view' },
      { label: 'Leads', href: '/admin/crm/leads', icon: Target, permission: 'crm.leads.view' },
      { label: 'Contacts', href: '/admin/crm/contacts', icon: Contact, permission: 'crm.contacts.view' },
      { label: 'Accounts', href: '/admin/crm/accounts', icon: Building2, permission: 'crm.accounts.view' },
      { label: 'Deals', href: '/admin/crm/deals', icon: Briefcase, permission: 'crm.deals.view' },
      { label: 'Activities', href: '/admin/crm/activities', icon: CalendarCheck, permission: 'crm.leads.view' },
      { label: 'Import', href: '/admin/crm/import', icon: Upload, permission: 'crm.leads.view' },
      { label: 'Settings', href: '/admin/crm/settings', icon: Sliders, permission: 'crm.leads.view' },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    items: [
      { label: 'My Tasks', href: '/admin/tasks/my', icon: CheckSquare, permission: 'tasks.view' },
      { label: 'Spaces', href: '/admin/tasks/spaces', icon: FolderKanban, permission: 'tasks.view' },
      { label: 'Workload', href: '/admin/tasks/workload', icon: Gauge, permission: 'tasks.view' },
      { label: 'Calendar', href: '/admin/tasks/calendar', icon: CalendarDays, permission: 'tasks.view' },
      { label: 'Settings', href: '/admin/tasks/settings', icon: Sliders, anyPermission: ['tasks.spaces.manage', 'tasks.manage'] },
    ],
  },
  {
    key: 'people',
    label: 'People',
    items: [
      { label: 'Directory', href: '/admin/people/directory', icon: Users, permission: 'employees.view' },
      { label: 'Live attendance', href: '/admin/people/live', icon: Clock, permission: 'attendance.view' },
      { label: 'Attendance sheet', href: '/admin/people/attendance', icon: CalendarDays, permission: 'attendance.view' },
      { label: 'Corrections', href: '/admin/people/corrections', icon: UserCheck, permission: 'attendance.view' },
      { label: 'Leave', href: '/admin/people/leave', icon: Plane, permission: 'attendance.view' },
      { label: 'Schedules & holidays', href: '/admin/people/schedules', icon: CalendarCheck, permission: 'attendance.manage' },
      { label: 'Onboarding', href: '/admin/people/checklists', icon: ListTodo, permission: 'hr.checklists.manage' },
      { label: 'Announcements', href: '/admin/people/announcements', icon: Megaphone, permission: 'attendance.view' },
      { label: 'Org chart', href: '/admin/people/org-chart', icon: Network, permission: 'employees.view' },
      { label: 'Departments & teams', href: '/admin/people/org', icon: Building2, permission: 'org.manage' },
    ],
  },
  {
    key: 'tracking',
    label: 'Tracking',
    items: [
      { label: 'Team activity', href: '/admin/tracking/team', icon: Activity, permission: 'tracking.view_summary' },
      { label: 'Timesheets', href: '/admin/tracking/timesheets', icon: Timer, permission: 'tracking.view_summary' },
      { label: 'Timeline', href: '/admin/tracking/timeline', icon: Clock, permission: 'tracking.view_detail' },
      { label: 'Apps & URLs', href: '/admin/tracking/usage', icon: Globe, permission: 'tracking.view_detail' },
      { label: 'Uncategorised', href: '/admin/tracking/uncategorised', icon: Tags, permission: 'tracking.manage_rules' },
      { label: 'Rules', href: '/admin/tracking/rules', icon: Sliders, permission: 'tracking.manage_rules' },
      { label: 'Idle & tamper', href: '/admin/tracking/alerts', icon: AlertTriangle, permission: 'tracking.view_detail' },
      { label: 'Settings', href: '/admin/tracking/settings', icon: Settings, permission: 'tracking.manage_rules' },
    ],
  },
  {
    key: 'mail',
    label: 'Mail',
    items: [
      { label: 'Inbox', href: '/admin/mail/inbox', icon: Inbox, permission: 'mail.use' },
      { label: 'Mailboxes', href: '/admin/mail/mailboxes', icon: Mail, anyPermission: ['mail.accounts.manage', 'mail.assign'] },
      { label: 'Templates', href: '/admin/mail/templates', icon: FileText, permission: 'mail.use' },
      { label: 'Labels', href: '/admin/mail/labels', icon: Tags, permission: 'mail.use' },
      { label: 'Logs', href: '/admin/mail/logs', icon: ScrollText, permission: 'mail.logs.view' },
    ],
  },
  {
    key: 'chat',
    label: 'Chat',
    items: [{ label: 'Chat', href: '/admin/chat', icon: MessageSquare, permission: 'chat.use' }],
  },
  {
    key: 'reports',
    label: 'Reports & targets',
    items: [
      { label: 'Reports', href: '/admin/reports', icon: BarChart3, permission: 'reports.view' },
      { label: 'Targets', href: '/admin/targets', icon: Target, permission: 'targets.view' },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    items: [
      { label: 'Roles & permissions', href: '/admin/security/roles', icon: KeyRound, permission: 'roles.view' },
      { label: 'Devices', href: '/admin/security/devices', icon: MonitorSmartphone, permission: 'devices.view' },
      { label: 'Sessions', href: '/admin/security/sessions', icon: Shield, permission: 'sessions.view' },
      { label: 'Login history', href: '/admin/security/logins', icon: ScrollText, permission: 'security.view' },
      { label: 'Audit log', href: '/admin/security/audit', icon: FileText, permission: 'audit.view' },
      { label: 'Alerts', href: '/admin/security/alerts', icon: Bell, permission: 'security.view' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [{ label: 'Company', href: '/admin/settings', icon: Settings, permission: 'settings.manage' }],
  },
];
