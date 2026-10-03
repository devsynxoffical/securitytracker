import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Mail,
  Target,
  CalendarCheck,
  Activity,
  Bell,
  User,
  Coffee,
  Play,
  Square,
  PhoneCall,
  Search,
  Shield,
  ShieldAlert,
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  Send,
  Plus,
  Check,
  Eye,
  Lock,
  Minus,
  X,
  Filter,
} from 'lucide-react';
import { ShiftState, CallOutcome } from '@company-os/contracts';

type ScreenId =
  | 'D01-login'
  | 'D02-device-pending'
  | 'D03-change-password'
  | 'D04-consent'
  | 'D05-dashboard'
  | 'D11-my-tasks'
  | 'D12-crm-leads'
  | 'D15-email'
  | 'D17-targets'
  | 'D18-attendance'
  | 'D20-my-activity'
  | 'D21-notifications'
  | 'D22-profile';

type ShiftStateType = (typeof ShiftState)[keyof typeof ShiftState];

export default function App() {
  // Navigation & Auth Flow
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('D05-dashboard');

  // Shift Lifecycle
  const [shiftState, setShiftState] = useState<ShiftStateType>(ShiftState.WORKING);
  const [shiftSeconds, setShiftSeconds] = useState<number>(24155); // 06h 42m 35s
  const [activeSeconds, setActiveSeconds] = useState<number>(21960);
  const [idleSeconds] = useState<number>(2195);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [queuedEventsCount, setQueuedEventsCount] = useState<number>(14);

  // Modals & Drawers
  const [showBreakModal, setShowBreakModal] = useState<boolean>(false);
  const [breakType, setBreakType] = useState<string>('Lunch break');
  const [showIdlePrompt, setShowIdlePrompt] = useState<boolean>(false);
  const [showEndShiftModal, setShowEndShiftModal] = useState<boolean>(false);
  const [showLogCallModal, setShowLogCallModal] = useState<boolean>(false);
  const [showComposeModal, setShowComposeModal] = useState<boolean>(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  // CRM Call Form
  const [callOutcome, setCallOutcome] = useState<string>(CallOutcome.CONNECTED);
  const [callDuration, setCallDuration] = useState<string>('04:15');
  const [callNotes, setCallNotes] = useState<string>('');

  // Email Compose Form
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');

  // Attendance Correction Form
  const [correctionDate, setCorrectionDate] = useState<string>('2026-10-02');
  const [correctionPunchIn, setCorrectionPunchIn] = useState<string>('09:00 AM');
  const [correctionPunchOut, setCorrectionPunchOut] = useState<string>('05:30 PM');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Lead Data
  const [leads, setLeads] = useState([
    {
      id: 'LD-1092',
      name: 'Sarah Jenkins',
      company: 'Apex Logistics Inc',
      title: 'VP of Operations',
      email: 's.jenkins@apexlogistics.com',
      phone: '+1 (555) 234-8901',
      stage: 'Qualified',
      value: '$28,000',
      lastContact: 'Today, 2:15 PM',
      priority: 'High',
      notes: 'Interested in 50 workstation deployment. Requested enterprise SLA details.',
    },
    {
      id: 'LD-1093',
      name: 'Michael Chang',
      company: 'Nexus Health Systems',
      title: 'Chief Information Officer',
      email: 'mchang@nexushealth.org',
      phone: '+1 (555) 872-1140',
      stage: 'Contacted',
      value: '$45,000',
      lastContact: 'Yesterday',
      priority: 'High',
      notes: 'HIPAA compliance audit in progress. Callback scheduled.',
    },
    {
      id: 'LD-1094',
      name: 'Elena Rostova',
      company: 'Vanguard Security',
      title: 'Director of Compliance',
      email: 'elena@vanguardsec.io',
      phone: '+1 (555) 443-9081',
      stage: 'Proposal Sent',
      value: '$62,000',
      lastContact: '2 days ago',
      priority: 'Medium',
      notes: 'Reviewing contract terms with legal team.',
    },
    {
      id: 'LD-1095',
      name: 'David Kim',
      company: 'BlueWave Digital',
      title: 'Operations Manager',
      email: 'dkim@bluewave.co',
      phone: '+1 (555) 319-7720',
      stage: 'New Lead',
      value: '$15,000',
      lastContact: 'Never',
      priority: 'Low',
      notes: 'Inbound web lead from pricing page.',
    },
  ]);

  // Tasks Data
  const [tasks, setTasks] = useState([
    { id: 'T-101', title: 'Follow up with Apex Logistics on SLA agreement', priority: 'High', due: 'Today, 4:00 PM', done: false, lead: 'Apex Logistics' },
    { id: 'T-102', title: 'Send updated enterprise proposal to Elena at Vanguard', priority: 'High', due: 'Today, 5:30 PM', done: false, lead: 'Vanguard Security' },
    { id: 'T-103', title: 'Complete compliance questionnaire for Nexus Health', priority: 'Medium', due: 'Tomorrow', done: false, lead: 'Nexus Health' },
    { id: 'T-104', title: 'Log discovery notes and update CRM deal stage', priority: 'Medium', due: 'Completed', done: true, lead: 'BlueWave Digital' },
    { id: 'T-105', title: 'Review weekly targets quota with sales lead', priority: 'Low', due: 'Completed', done: true, lead: 'Internal' },
  ]);

  // Emails Data
  const [selectedEmail, setSelectedEmail] = useState<number>(0);
  const [emails] = useState([
    {
      id: 'EM-501',
      from: 'Sarah Jenkins <s.jenkins@apexlogistics.com>',
      subject: 'Re: Company OS Enterprise Workstation SLA details',
      time: '2:15 PM',
      snippet: 'Thanks for the quick response! We reviewed the monitoring specs and transparency model...',
      body: 'Hi Daniyal,\n\nThanks for the quick turnaround! We reviewed the monitoring specs and employee transparency model with our executive board. They are very pleased with the zero-keystroke/clipboard architecture.\n\nCould you send over the final pricing schedule for 50 initial seats?\n\nBest regards,\nSarah Jenkins\nVP Operations, Apex Logistics',
      unread: false,
    },
    {
      id: 'EM-502',
      from: 'Michael Chang <mchang@nexushealth.org>',
      subject: 'HIPAA verification questionnaire received',
      time: '11:30 AM',
      snippet: 'Our compliance officer has begun reviewing Section 4. We will have feedback by tomorrow...',
      body: 'Hello Daniyal,\n\nOur compliance officer has begun reviewing Section 4. We will have feedback by tomorrow afternoon regarding the cloud logging retention requirements.\n\nThanks,\nMichael Chang',
      unread: true,
    },
    {
      id: 'EM-503',
      from: 'Internal HR <notifications@company.os>',
      subject: 'Monthly Attendance & Schedule Approved',
      time: 'Yesterday',
      snippet: 'Your attendance record for September has been verified and approved by payroll...',
      body: 'Hi Daniyal Khan,\n\nYour attendance and shift records for September 2026 have been verified and processed by payroll.\n\nTotal Hours: 172.5h | Productive Score: 94%\n\nRegards,\nHuman Resources',
      unread: false,
    },
  ]);

  // Notifications Data
  const [notifications, setNotifications] = useState([
    { id: 'N-1', title: 'Target Milestone: 80% Calls Completed', time: '15m ago', unread: true, type: 'target', desc: 'You completed 32 of 40 calls scheduled for today. Great momentum!' },
    { id: 'N-2', title: 'Correction Request Approved', time: '2h ago', unread: true, type: 'attendance', desc: 'Manager approved your attendance adjustment for Oct 1st (09:00 AM - 05:30 PM).' },
    { id: 'N-3', title: 'Shift Policy Reminder', time: 'Yesterday', unread: false, type: 'system', desc: 'Please ensure to categorize idle intervals exceeding 15 minutes before shift end.' },
  ]);

  // Timer Tick
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (shiftState === ShiftState.WORKING) {
      interval = setInterval(() => {
        setShiftSeconds((s) => s + 1);
        setActiveSeconds((a) => a + 1);
      }, 1000);
    } else if (shiftState === ShiftState.ON_BREAK) {
      interval = setInterval(() => {
        setShiftSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [shiftState]);

  // Format Seconds to HH:MM:SS
  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatHoursMins = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  // Switch Auth Views (for testing full flow)
  if (currentScreen === 'D01-login') {
    return (
      <div className="flex flex-col min-h-screen bg-[#F5F6F3]">
        <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B]">
          <span className="w-5 h-5 rounded bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-[10px]">C</span>
          <span className="font-semibold text-[#151A1E]">Company OS</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><Minus className="w-3.5 h-3.5" /></span>
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><X className="w-3.5 h-3.5" /></span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[420px] bg-white border border-[#E4E7E1] rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-lg bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-sm">C</span>
              <div>
                <h1 className="text-base font-semibold text-[#151A1E]">Sign in to Company OS</h1>
                <p className="text-xs text-[#8A939B]">Use your company-issued credentials</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1.5">Employee ID or Email</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-[#0F6B5C] ring-2 ring-[#E3F1EE] rounded-lg bg-white text-sm">
                  <User className="w-4 h-4 text-[#8A939B]" />
                  <input
                    type="text"
                    defaultValue="EMP-0021"
                    className="w-full outline-none font-mono text-xs text-[#151A1E]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1.5">Password</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-[#E4E7E1] rounded-lg bg-white text-sm">
                  <Lock className="w-4 h-4 text-[#8A939B]" />
                  <input
                    type="password"
                    defaultValue="password123"
                    className="w-full outline-none text-xs text-[#151A1E]"
                  />
                  <Eye className="w-4 h-4 text-[#8A939B] cursor-pointer" />
                </div>
              </div>
              <button
                onClick={() => setCurrentScreen('D04-consent')}
                className="w-full py-2.5 px-4 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition"
              >
                Sign In
              </button>
              <div className="text-center">
                <span
                  onClick={() => setCurrentScreen('D02-device-pending')}
                  className="text-xs text-[#0F6B5C] hover:underline cursor-pointer"
                >
                  Simulate: Device Approval Required
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'D02-device-pending') {
    return (
      <div className="flex flex-col min-h-screen bg-[#F5F6F3]">
        <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B]">
          <span className="w-5 h-5 rounded bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-[10px]">C</span>
          <span className="font-semibold text-[#151A1E]">Company OS</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[440px] bg-white border border-[#E4E7E1] rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FCF0DA] text-[#B26A00] flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-[#151A1E] mb-2">Device Approval Required</h2>
            <p className="text-xs text-[#4A535B] leading-relaxed mb-6">
              This workstation is new or has not been authorized by your company administrator yet.
            </p>
            <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-3 text-left space-y-2 mb-6 text-xs">
              <div className="flex justify-between">
                <span className="text-[#8A939B]">Hardware ID:</span>
                <span className="font-mono text-[#151A1E] font-semibold">HW-MAC-9821-B4</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8A939B]">Platform:</span>
                <span className="font-mono text-[#151A1E]">macOS 15.1.1 (Apple Silicon)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8A939B]">Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-[#FCF0DA] text-[#B26A00] font-semibold text-[11px]">Pending Admin Review</span>
              </div>
            </div>
            <button
              onClick={() => setCurrentScreen('D03-change-password')}
              className="w-full py-2.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition mb-2"
            >
              Simulate: Admin Approved &gt; Next Step
            </button>
            <button
              onClick={() => setCurrentScreen('D01-login')}
              className="w-full py-2 bg-transparent text-[#4A535B] hover:bg-gray-100 rounded-lg font-medium text-xs transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'D03-change-password') {
    return (
      <div className="flex flex-col min-h-screen bg-[#F5F6F3]">
        <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B]">
          <span className="w-5 h-5 rounded bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-[10px]">C</span>
          <span className="font-semibold text-[#151A1E]">Company OS</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[440px] bg-white border border-[#E4E7E1] rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8">
            <h2 className="text-base font-semibold text-[#151A1E] mb-1">Update Temporary Password</h2>
            <p className="text-xs text-[#8A939B] mb-6">You must set a secure personal password before continuing.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Current Temporary Password</label>
                <input
                  type="password"
                  defaultValue="tempPass123!"
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <button
                onClick={() => setCurrentScreen('D04-consent')}
                className="w-full py-2.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition"
              >
                Save &amp; Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'D04-consent') {
    return (
      <div className="flex flex-col min-h-screen bg-[#F5F6F3]">
        <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B]">
          <span className="w-5 h-5 rounded bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-[10px]">C</span>
          <span className="font-semibold text-[#151A1E]">Company OS</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[520px] bg-white border border-[#E4E7E1] rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="p-2 rounded-lg bg-[#E3F1EE] text-[#0F6B5C]">
                <Shield className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[#151A1E]">Privacy &amp; Tracking Transparency</h2>
                <p className="text-xs text-[#8A939B]">Explicit disclosure of monitoring boundaries</p>
              </div>
            </div>
            <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-4 space-y-3 mb-6 text-xs text-[#4A535B]">
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1E8E5A] shrink-0 mt-0.5" />
                <span>
                  <strong>What is tracked:</strong> Active application name, browser tab domain, mouse/keyboard activity count (numbers only), and total shift duration.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <X className="w-4 h-4 text-[#C2362B] shrink-0 mt-0.5" />
                <span>
                  <strong>What is NEVER recorded:</strong> Keystrokes, text typed, clipboard contents, audio, webcam, or private files. Zero invasive surveillance.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1E8E5A] shrink-0 mt-0.5" />
                <span>
                  <strong>Employee Transparency:</strong> You have full visibility into your activity logs, attendance records, and performance scores in the "My Activity" tab.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setCurrentScreen('D05-dashboard');
              }}
              className="w-full py-2.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition"
            >
              I Understand &amp; Agree
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Desktop Shell
  return (
    <div className="flex flex-col h-screen w-screen bg-[#F5F6F3] overflow-hidden select-none font-sans">
      {/* 34px Custom Titlebar */}
      <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B] shrink-0">
        <span className="w-5 h-5 rounded bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-[10px]">C</span>
        <span className="font-semibold text-[#151A1E]">Company OS Workstation</span>
        <span className="text-[11px] text-[#8A939B] ml-2">v1.0.0</span>

        {/* Quick Debug Screen Selector */}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setIsOffline(!isOffline)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
              isOffline
                ? 'bg-[#FCF0DA] border-[#FCF0DA] text-[#B26A00]'
                : 'bg-white border-[#E4E7E1] text-[#4A535B] hover:bg-gray-50'
            }`}
          >
            {isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3 text-[#1E8E5A]" />}
            {isOffline ? 'Offline Mode (D07)' : 'Online'}
          </button>
          <button
            onClick={() => setShowIdlePrompt(true)}
            className="px-2 py-0.5 rounded text-[11px] font-medium text-[#4A535B] bg-gray-100 hover:bg-gray-200"
          >
            Simulate Idle (D09)
          </button>
          <div className="flex items-center gap-1 pl-2 border-l border-[#E4E7E1]">
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><Minus className="w-3.5 h-3.5" /></span>
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><X className="w-3.5 h-3.5" /></span>
          </div>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex flex-1 min-h-0">
        {/* 216px Fixed Sidebar */}
        <div className="w-[216px] bg-white border-r border-[#E4E7E1] flex flex-col p-3.5 shrink-0 justify-between">
          <div className="space-y-1">
            {/* Brand Header */}
            <div className="flex items-center gap-2.5 px-2 py-1 mb-4">
              <span className="w-6 h-6 rounded-md bg-[#0F6B5C] text-white flex items-center justify-center font-bold text-xs">C</span>
              <span className="font-semibold text-sm text-[#151A1E]">Company OS</span>
            </div>

            <div className="text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold px-2 py-1">
              Workspace
            </div>

            {/* Nav Items */}
            <button
              onClick={() => setCurrentScreen('D05-dashboard')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D05-dashboard'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentScreen('D11-my-tasks')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D11-my-tasks'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4" />
                <span>My Tasks</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-[#ECEEEB] text-[#4A535B]">
                {tasks.filter((t) => !t.done).length}
              </span>
            </button>

            <button
              onClick={() => setCurrentScreen('D12-crm-leads')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D12-crm-leads'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>CRM Leads</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-[#ECEEEB] text-[#4A535B]">
                {leads.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentScreen('D15-email')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D15-email'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-[#ECEEEB] text-[#4A535B]">
                {emails.filter((e) => e.unread).length}
              </span>
            </button>

            <button
              onClick={() => setCurrentScreen('D17-targets')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D17-targets'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <Target className="w-4 h-4" />
              <span>Targets &amp; KPIs</span>
            </button>

            <div className="text-[10.5px] uppercase tracking-wider text-[#8A939B] font-semibold px-2 pt-3 pb-1">
              Workforce
            </div>

            <button
              onClick={() => setCurrentScreen('D18-attendance')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D18-attendance'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Attendance</span>
            </button>

            <button
              onClick={() => setCurrentScreen('D20-my-activity')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D20-my-activity'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>My Activity</span>
            </button>

            <button
              onClick={() => setCurrentScreen('D21-notifications')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D21-notifications'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" />
                <span>Notifications</span>
              </div>
              {notifications.some((n) => n.unread) && (
                <span className="w-2 h-2 rounded-full bg-[#1E8E5A]"></span>
              )}
            </button>

            <button
              onClick={() => setCurrentScreen('D22-profile')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D22-profile'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>
          </div>

          {/* Pinned Bottom Shift Box */}
          <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-[10px] p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    shiftState === ShiftState.WORKING
                      ? 'bg-[#1E8E5A] animate-pulse'
                      : shiftState === ShiftState.ON_BREAK
                      ? 'bg-[#B26A00]'
                      : 'bg-[#5C666E]'
                  }`}
                ></span>
                <span className="text-xs font-semibold text-[#151A1E]">
                  {shiftState === ShiftState.WORKING
                    ? 'Working'
                    : shiftState === ShiftState.ON_BREAK
                    ? `Break (${breakType})`
                    : 'Off Shift'}
                </span>
              </div>
              <span className="font-mono text-xs font-semibold text-[#151A1E]">
                {formatTimer(shiftSeconds)}
              </span>
            </div>

            {shiftState === ShiftState.OFF_SHIFT ? (
              <button
                onClick={() => setShiftState(ShiftState.WORKING)}
                className="w-full py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Shift
              </button>
            ) : shiftState === ShiftState.ON_BREAK ? (
              <button
                onClick={() => setShiftState(ShiftState.WORKING)}
                className="w-full py-2 bg-[#1E8E5A] hover:bg-[#14673F] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Work
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowBreakModal(true)}
                  className="py-1.5 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition"
                >
                  <Coffee className="w-3 h-3 text-[#B26A00]" />
                  Break
                </button>
                <button
                  onClick={() => setShowEndShiftModal(true)}
                  className="py-1.5 bg-white border border-[#EBC4BF] hover:bg-[#FBE7E4] text-[#C2362B] rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition"
                >
                  <Square className="w-3 h-3 fill-current" />
                  End Shift
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#F5F6F3] overflow-hidden">
          {/* 56px Top Bar */}
          <div className="h-[56px] bg-white border-b border-[#E4E7E1] flex items-center px-6 gap-3 shrink-0">
            <h1 className="text-base font-semibold text-[#151A1E]">
              {currentScreen === 'D05-dashboard' && 'Workstation Dashboard'}
              {currentScreen === 'D11-my-tasks' && 'My Tasks'}
              {currentScreen === 'D12-crm-leads' && 'CRM Leads & Pipeline'}
              {currentScreen === 'D15-email' && 'Shared Mailbox'}
              {currentScreen === 'D17-targets' && 'Targets & Performance'}
              {currentScreen === 'D18-attendance' && 'Attendance Log'}
              {currentScreen === 'D20-my-activity' && 'My Activity Transparency'}
              {currentScreen === 'D21-notifications' && 'Notifications'}
              {currentScreen === 'D22-profile' && 'Employee Profile'}
            </h1>

            <div className="ml-auto flex items-center gap-3">
              {/* Tracking Active Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E4F4EB] text-[#14673F] text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#1E8E5A] animate-pulse"></span>
                Tracking Active
              </div>

              {/* Offline Badge if applicable */}
              {isOffline && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FCF0DA] text-[#8A5200] text-xs font-semibold">
                  <WifiOff className="w-3.5 h-3.5" />
                  Offline ({queuedEventsCount} queued)
                </div>
              )}

              {/* Notification Icon */}
              <div
                onClick={() => setCurrentScreen('D21-notifications')}
                className="p-2 text-[#4A535B] hover:bg-gray-100 rounded-lg cursor-pointer relative"
              >
                <Bell className="w-4 h-4" />
                {notifications.some((n) => n.unread) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#1E8E5A]"></span>
                )}
              </div>

              {/* Employee Avatar */}
              <div
                onClick={() => setCurrentScreen('D22-profile')}
                className="flex items-center gap-2 pl-2 border-l border-[#E4E7E1] cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-xs flex items-center justify-center">
                  DK
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#151A1E]">Daniyal Khan</div>
                  <div className="text-[11px] font-mono text-[#8A939B]">EMP-0021</div>
                </div>
              </div>
            </div>
          </div>

          {/* Offline Banner if disconnected (D07) */}
          {isOffline && (
            <div className="bg-[#FCF0DA] border-b border-[#E4E7E1] px-6 py-2.5 flex items-center justify-between text-xs text-[#7A4A00] font-medium">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#B26A00]" />
                <span>
                  <strong>Offline Mode:</strong> Internet disconnected. Time tracking and activity counts are running locally. {queuedEventsCount} events buffered in SQLite.
                </span>
              </div>
              <button
                onClick={() => {
                  setIsOffline(false);
                  setQueuedEventsCount(0);
                }}
                className="px-2.5 py-1 bg-white border border-[#E4E7E1] text-[#151A1E] font-semibold rounded-md hover:bg-gray-50 transition"
              >
                Sync Now
              </button>
            </div>
          )}

          {/* Scrollable View Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* SCREEN D05 / D06: DASHBOARD */}
            {currentScreen === 'D05-dashboard' && (
              <div className="space-y-5">
                {/* 5 KPI Stat Cards */}
                <div className="grid grid-cols-5 gap-3.5">
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="text-[11.5px] font-medium text-[#8A939B]">Today's Shift</div>
                    <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">
                      {formatHoursMins(shiftSeconds)}
                    </div>
                    <div className="text-[11.5px] text-[#4A535B] mt-0.5">Target: 08h 00m</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="text-[11.5px] font-medium text-[#8A939B]">Active Time</div>
                    <div className="text-2xl font-bold font-mono text-[#0F6B5C] mt-1">
                      {formatHoursMins(activeSeconds)}
                    </div>
                    <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">91% productive</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="text-[11.5px] font-medium text-[#8A939B]">Idle / Break</div>
                    <div className="text-2xl font-bold font-mono text-[#B26A00] mt-1">
                      {formatHoursMins(idleSeconds)}
                    </div>
                    <div className="text-[11.5px] text-[#4A535B] mt-0.5">36m total break</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="text-[11.5px] font-medium text-[#8A939B]">Calls Logged</div>
                    <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">32</div>
                    <div className="text-[11.5px] text-[#4A535B] mt-0.5">Target: 40 calls</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="text-[11.5px] font-medium text-[#8A939B]">Deals Qualified</div>
                    <div className="text-2xl font-bold font-mono text-[#1E8E5A] mt-1">4</div>
                    <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">Target reached!</div>
                  </div>
                </div>

                {/* Grid 2-column: Tasks & CRM Call Queue */}
                <div className="grid grid-cols-12 gap-4">
                  {/* Left Col (7 cols): Today's Tasks */}
                  <div className="col-span-7 bg-white border border-[#E4E7E1] rounded-[10px] shadow-[0_1px_2px_rgba(21,26,30,0.05)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEF0EC]">
                      <h3 className="font-semibold text-xs text-[#151A1E]">Priority Tasks for Today</h3>
                      <button
                        onClick={() => setCurrentScreen('D11-my-tasks')}
                        className="text-xs font-semibold text-[#0F6B5C] hover:underline"
                      >
                        View all tasks ({tasks.length})
                      </button>
                    </div>
                    <div className="divide-y divide-[#EEF0EC]">
                      {tasks.map((task) => (
                        <div key={task.id} className="p-3.5 flex items-center justify-between hover:bg-[#FAFBF9] transition">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => {
                                setTasks(
                                  tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
                                );
                              }}
                              className="w-4 h-4 rounded text-[#0F6B5C] focus:ring-[#0F6B5C]"
                            />
                            <div>
                              <div className={`text-xs font-medium ${task.done ? 'line-through text-[#8A939B]' : 'text-[#151A1E]'}`}>
                                {task.title}
                              </div>
                              <div className="text-[11px] text-[#8A939B]">{task.lead}</div>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              task.priority === 'High'
                                ? 'bg-[#FBE7E4] text-[#9E2A21]'
                                : 'bg-[#FAFBF9] border border-[#E4E7E1] text-[#4A535B]'
                            }`}
                          >
                            {task.due}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Col (5 cols): Quick Lead Call Launcher */}
                  <div className="col-span-5 bg-white border border-[#E4E7E1] rounded-[10px] shadow-[0_1px_2px_rgba(21,26,30,0.05)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEF0EC]">
                      <h3 className="font-semibold text-xs text-[#151A1E]">Quick Call Queue</h3>
                      <button
                        onClick={() => setCurrentScreen('D12-crm-leads')}
                        className="text-xs font-semibold text-[#0F6B5C] hover:underline"
                      >
                        Open CRM
                      </button>
                    </div>
                    <div className="divide-y divide-[#EEF0EC]">
                      {leads.slice(0, 3).map((lead) => (
                        <div key={lead.id} className="p-3.5 flex items-center justify-between hover:bg-[#FAFBF9] transition">
                          <div>
                            <div className="text-xs font-semibold text-[#151A1E]">{lead.name}</div>
                            <div className="text-[11px] text-[#8A939B]">{lead.company} &bull; {lead.phone}</div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowLogCallModal(true);
                            }}
                            className="px-2.5 py-1 bg-[#E3F1EE] hover:bg-[#0F6B5C] text-[#0B5548] hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            Call (D14)
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Productivity Timeline Preview */}
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-xs text-[#151A1E]">Today's Activity Timeline</h3>
                    <span className="font-mono text-xs text-[#4A535B]">Active: 6h 06m | Idle: 36m</span>
                  </div>
                  {/* Segmented Timeline Bar */}
                  <div className="h-5.5 rounded-md overflow-hidden bg-[#ECEEEB] flex">
                    <div style={{ width: '45%' }} className="bg-[#0F6B5C] h-full" title="Active CRM & Work (09:00 - 12:45)"></div>
                    <div style={{ width: '10%' }} className="bg-[#E0921A] h-full" title="Idle 36m"></div>
                    <div style={{ width: '8%' }} className="bg-[#2459C4] h-full" title="Lunch Break (12:45 - 01:15)"></div>
                    <div style={{ width: '37%' }} className="bg-[#0F6B5C] h-full" title="Active Calls & Tasks (01:15 - Present)"></div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#8A939B]">
                    <span>09:00 AM Check-in</span>
                    <span>01:00 PM</span>
                    <span>Now ({new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN D11: MY TASKS */}
            {currentScreen === 'D11-my-tasks' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-[#E3F1EE] text-[#0B5548] font-semibold text-xs">
                      All Tasks ({tasks.length})
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                      Pending ({tasks.filter((t) => !t.done).length})
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                      Completed ({tasks.filter((t) => t.done).length})
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const title = prompt('Enter task title:');
                      if (title) {
                        setTasks([
                          ...tasks,
                          { id: `T-${Date.now()}`, title, priority: 'Medium', due: 'Today', done: false, lead: 'General' },
                        ]);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Task
                  </button>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                        <th className="py-2.5 px-4 w-10">Done</th>
                        <th className="py-2.5 px-4">Task Description</th>
                        <th className="py-2.5 px-4">Related Lead / Context</th>
                        <th className="py-2.5 px-4">Priority</th>
                        <th className="py-2.5 px-4">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0EC]">
                      {tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-[#FAFBF9] transition">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => {
                                setTasks(
                                  tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
                                );
                              }}
                              className="w-4 h-4 rounded text-[#0F6B5C] focus:ring-[#0F6B5C]"
                            />
                          </td>
                          <td className={`py-3 px-4 font-medium ${task.done ? 'line-through text-[#8A939B]' : 'text-[#151A1E]'}`}>
                            {task.title}
                          </td>
                          <td className="py-3 px-4 text-[#4A535B]">{task.lead}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                                task.priority === 'High'
                                  ? 'bg-[#FBE7E4] text-[#9E2A21]'
                                  : 'bg-[#ECEEEB] text-[#4A535B]'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[#4A535B]">{task.due}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SCREEN D12 & D13: CRM LEADS & DETAIL */}
            {currentScreen === 'D12-crm-leads' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs text-[#8A939B] w-64">
                      <Search className="w-3.5 h-3.5" />
                      <input
                        type="text"
                        placeholder="Search lead name or company..."
                        className="w-full outline-none text-xs text-[#151A1E]"
                      />
                    </div>
                    <span className="px-2.5 py-1 bg-white border border-[#E4E7E1] rounded-lg text-xs font-medium text-[#4A535B] flex items-center gap-1.5">
                      <Filter className="w-3 h-3" />
                      Stage: All Stages
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const name = prompt('Lead contact name:');
                      const company = prompt('Company name:');
                      if (name && company) {
                        setLeads([
                          ...leads,
                          {
                            id: `LD-${Math.floor(1000 + Math.random() * 9000)}`,
                            name,
                            company,
                            title: 'Manager',
                            email: `${name.toLowerCase().replace(' ', '.')}@company.com`,
                            phone: '+1 (555) 000-1122',
                            stage: 'New Lead',
                            value: '$20,000',
                            lastContact: 'Just now',
                            priority: 'Medium',
                            notes: 'Created from desktop workstation.',
                          },
                        ]);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Lead
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  {/* Leads Table (8 cols) */}
                  <div className="col-span-8 bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                          <th className="py-2.5 px-4">Contact</th>
                          <th className="py-2.5 px-4">Company</th>
                          <th className="py-2.5 px-4">Stage</th>
                          <th className="py-2.5 px-4">Est. Value</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0EC]">
                        {leads.map((lead) => (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedLead(lead)}
                            className={`cursor-pointer transition ${
                              selectedLead?.id === lead.id ? 'bg-[#E3F1EE]' : 'hover:bg-[#FAFBF9]'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#151A1E]">{lead.name}</div>
                              <div className="text-[11px] text-[#8A939B]">{lead.title}</div>
                            </td>
                            <td className="py-3 px-4 text-[#4A535B]">{lead.company}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                                  lead.stage === 'Qualified'
                                    ? 'bg-[#E4F4EB] text-[#14673F]'
                                    : lead.stage === 'Proposal Sent'
                                    ? 'bg-[#E6EDFB] text-[#1C469B]'
                                    : 'bg-[#FCF0DA] text-[#8A5200]'
                                }`}
                              >
                                {lead.stage}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-[#151A1E]">{lead.value}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLead(lead);
                                  setShowLogCallModal(true);
                                }}
                                className="px-2 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#0F6B5C] rounded-md font-semibold text-[11px] inline-flex items-center gap-1 shadow-sm"
                              >
                                <PhoneCall className="w-3 h-3" />
                                Call (D14)
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Lead Detail Drawer / Card (4 cols) (D13) */}
                  <div className="col-span-4 bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                    {selectedLead ? (
                      <>
                        <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-3">
                          <div>
                            <h3 className="font-semibold text-sm text-[#151A1E]">{selectedLead.name}</h3>
                            <p className="text-xs text-[#8A939B]">{selectedLead.title} &bull; {selectedLead.company}</p>
                          </div>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#FAFBF9] border border-[#E4E7E1]">
                            {selectedLead.id}
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[#8A939B]">Phone:</span>
                            <span className="font-mono text-[#151A1E] font-semibold">{selectedLead.phone}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8A939B]">Email:</span>
                            <span className="text-[#0F6B5C]">{selectedLead.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8A939B]">Deal Stage:</span>
                            <span className="font-semibold text-[#151A1E]">{selectedLead.stage}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8A939B]">Est. Value:</span>
                            <span className="font-mono font-bold text-[#1E8E5A]">{selectedLead.value}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8A939B]">Last Touch:</span>
                            <span className="text-[#4A535B]">{selectedLead.lastContact}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#EEF0EC]">
                          <label className="block text-xs font-semibold text-[#4A535B] mb-1">Notes &amp; Activity</label>
                          <div className="p-2.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg text-xs text-[#4A535B] leading-relaxed">
                            {selectedLead.notes}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button
                            onClick={() => setShowLogCallModal(true)}
                            className="py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            Log Call
                          </button>
                          <button
                            onClick={() => {
                              setEmailTo(selectedLead.email);
                              setEmailSubject(`Follow up with ${selectedLead.company}`);
                              setShowComposeModal(true);
                            }}
                            className="py-2 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Send Email
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-xs text-[#8A939B]">
                        <Users className="w-8 h-8 text-[#8A939B] mx-auto mb-2 opacity-50" />
                        Select a lead from the list to view full profile &amp; activity timeline
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN D15 & D16: EMAIL */}
            {currentScreen === 'D15-email' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-[#E3F1EE] text-[#0B5548] font-semibold text-xs">
                      Inbox ({emails.length})
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                      Sent
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-white border border-[#E4E7E1] text-[#4A535B] font-medium text-xs">
                      Drafts
                    </span>
                  </div>
                  <button
                    onClick={() => setShowComposeModal(true)}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Compose (D16)
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  {/* Email List (5 cols) */}
                  <div className="col-span-5 bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)] divide-y divide-[#EEF0EC]">
                    {emails.map((em, idx) => (
                      <div
                        key={em.id}
                        onClick={() => setSelectedEmail(idx)}
                        className={`p-3.5 cursor-pointer transition ${
                          selectedEmail === idx ? 'bg-[#E3F1EE]' : 'hover:bg-[#FAFBF9]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs ${em.unread ? 'font-bold text-[#151A1E]' : 'font-medium text-[#4A535B]'}`}>
                            {em.from.split('<')[0]}
                          </span>
                          <span className="font-mono text-[11px] text-[#8A939B]">{em.time}</span>
                        </div>
                        <div className={`text-xs ${em.unread ? 'font-bold text-[#151A1E]' : 'text-[#4A535B]'} truncate mb-0.5`}>
                          {em.subject}
                        </div>
                        <div className="text-[11px] text-[#8A939B] truncate">{em.snippet}</div>
                      </div>
                    ))}
                  </div>

                  {/* Message Viewer (7 cols) */}
                  <div className="col-span-7 bg-white border border-[#E4E7E1] rounded-[10px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] flex flex-col justify-between">
                    <div>
                      <div className="border-b border-[#EEF0EC] pb-4 mb-4">
                        <h2 className="text-sm font-semibold text-[#151A1E] mb-2">
                          {emails[selectedEmail].subject}
                        </h2>
                        <div className="flex items-center justify-between text-xs text-[#8A939B]">
                          <span>From: <strong className="text-[#151A1E]">{emails[selectedEmail].from}</strong></span>
                          <span className="font-mono">{emails[selectedEmail].time}</span>
                        </div>
                      </div>
                      <div className="text-xs text-[#151A1E] leading-relaxed whitespace-pre-line">
                        {emails[selectedEmail].body}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[#EEF0EC] flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEmailTo(emails[selectedEmail].from);
                          setEmailSubject(`Re: ${emails[selectedEmail].subject}`);
                          setShowComposeModal(true);
                        }}
                        className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN D17: TARGETS & PERFORMANCE */}
            {currentScreen === 'D17-targets' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-[#4A535B]">Daily Outbound Calls</span>
                      <span className="font-mono text-xs font-bold text-[#0F6B5C]">32 / 40</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden mb-2">
                      <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '80%' }}></div>
                    </div>
                    <div className="text-[11px] text-[#8A939B]">80% completed (8 calls remaining)</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-[#4A535B]">Weekly Qualified Leads</span>
                      <span className="font-mono text-xs font-bold text-[#1E8E5A]">18 / 20</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden mb-2">
                      <div className="h-full bg-[#1E8E5A] rounded-full" style={{ width: '90%' }}></div>
                    </div>
                    <div className="text-[11px] text-[#8A939B]">90% completed (2 deals to weekly bonus)</div>
                  </div>

                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-[#4A535B]">Monthly Revenue Target</span>
                      <span className="font-mono text-xs font-bold text-[#6B46C1]">$85,000 / $100,000</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden mb-2">
                      <div className="h-full bg-[#6B46C1] rounded-full" style={{ width: '85%' }}></div>
                    </div>
                    <div className="text-[11px] text-[#8A939B]">85% quota achieved for October</div>
                  </div>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                  <h3 className="font-semibold text-xs text-[#151A1E]">Monthly Target History (Q3 - Q4)</h3>
                  <div className="divide-y divide-[#EEF0EC]">
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-[#151A1E]">September 2026 - Sales Target</div>
                        <div className="text-[11px] text-[#8A939B]">Quotas: 800 Calls &bull; 75 Qualified Leads &bull; $90k Closed</div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-xs">
                        104% Achieved (Bonus Earned)
                      </span>
                    </div>
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-[#151A1E]">August 2026 - Sales Target</div>
                        <div className="text-[11px] text-[#8A939B]">Quotas: 750 Calls &bull; 65 Qualified Leads &bull; $80k Closed</div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-xs">
                        98% Achieved
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN D18 & D19: ATTENDANCE & CORRECTION */}
            {currentScreen === 'D18-attendance' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-xs text-[#151A1E]">October 2026 Attendance Log</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-xs">
                      22 Days Present &bull; 0 Absent &bull; 1 Approved Leave
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCorrectionModal(true)}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Request Correction (D19)
                  </button>
                </div>

                <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4">Check-in</th>
                        <th className="py-2.5 px-4">Check-out</th>
                        <th className="py-2.5 px-4">Total Shift</th>
                        <th className="py-2.5 px-4">Active Hours</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0EC]">
                      <tr className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 font-semibold text-[#151A1E]">Today (Oct 3, 2026)</td>
                        <td className="py-3 px-4 font-mono text-[#0F6B5C]">09:57 AM</td>
                        <td className="py-3 px-4 font-mono text-[#8A939B]">In Progress</td>
                        <td className="py-3 px-4 font-mono font-semibold">{formatHoursMins(shiftSeconds)}</td>
                        <td className="py-3 px-4 font-mono text-[#1E8E5A]">{formatHoursMins(activeSeconds)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-[11px]">
                            Present
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 font-semibold text-[#151A1E]">Oct 2, 2026</td>
                        <td className="py-3 px-4 font-mono">09:02 AM</td>
                        <td className="py-3 px-4 font-mono">05:31 PM</td>
                        <td className="py-3 px-4 font-mono">08h 29m</td>
                        <td className="py-3 px-4 font-mono text-[#1E8E5A]">07h 48m</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-[#E4F4EB] text-[#14673F] font-semibold text-[11px]">
                            Present
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#FAFBF9]">
                        <td className="py-3 px-4 font-semibold text-[#151A1E]">Oct 1, 2026</td>
                        <td className="py-3 px-4 font-mono">09:14 AM</td>
                        <td className="py-3 px-4 font-mono">05:30 PM</td>
                        <td className="py-3 px-4 font-mono">08h 16m</td>
                        <td className="py-3 px-4 font-mono text-[#1E8E5A]">07h 35m</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-[#FCF0DA] text-[#8A5200] font-semibold text-[11px]">
                            Late (14m)
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SCREEN D20: MY ACTIVITY TRANSPARENCY */}
            {currentScreen === 'D20-my-activity' && (
              <div className="space-y-5">
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-[#151A1E]">Application &amp; Website Usage Breakdown</h3>
                      <p className="text-xs text-[#8A939B]">Categorized by company productivity rules</p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#1E8E5A] px-2.5 py-1 rounded bg-[#E4F4EB]">
                      91% Productive Overall
                    </span>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-[#151A1E]">Company OS CRM</span>
                        <span className="font-mono font-semibold text-[#0F6B5C]">3h 42m (48%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '48%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-[#151A1E]">Google Chrome (Gmail &amp; Research)</span>
                        <span className="font-mono font-semibold text-[#0F6B5C]">2h 15m (30%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '30%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-[#151A1E]">Slack (Team Communication)</span>
                        <span className="font-mono font-semibold text-[#5C666E]">48m (11%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#5C666E] rounded-full" style={{ width: '11%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-[#151A1E]">Other / Idle</span>
                        <span className="font-mono font-semibold text-[#B26A00]">36m (9%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#E0921A] rounded-full" style={{ width: '9%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN D21: NOTIFICATIONS */}
            {currentScreen === 'D21-notifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xs text-[#151A1E]">Notification Center</h3>
                  <button
                    onClick={() => setNotifications(notifications.map((n) => ({ ...n, unread: false })))}
                    className="text-xs font-semibold text-[#0F6B5C] hover:underline"
                  >
                    Mark all as read
                  </button>
                </div>
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)] divide-y divide-[#EEF0EC]">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="p-4 flex items-start gap-3 hover:bg-[#FAFBF9] transition">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          notif.type === 'target'
                            ? 'bg-[#E3F1EE] text-[#0F6B5C]'
                            : notif.type === 'attendance'
                            ? 'bg-[#E4F4EB] text-[#1E8E5A]'
                            : 'bg-[#ECEEEB] text-[#5C666E]'
                        }`}
                      >
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-[#151A1E]">{notif.title}</span>
                          <span className="font-mono text-[11px] text-[#8A939B]">{notif.time}</span>
                        </div>
                        <p className="text-xs text-[#4A535B]">{notif.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN D22: PROFILE */}
            {currentScreen === 'D22-profile' && (
              <div className="max-w-2xl bg-white border border-[#E4E7E1] rounded-[10px] p-6 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#E3F1EE] text-[#0B5548] font-bold text-lg flex items-center justify-center">
                    DK
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#151A1E]">Daniyal Khan</h2>
                    <p className="text-xs text-[#8A939B]">Senior Sales Executive &bull; Enterprise Outbound</p>
                  </div>
                  <span className="ml-auto font-mono text-xs font-semibold px-2.5 py-1 rounded bg-[#FAFBF9] border border-[#E4E7E1]">
                    EMP-0021
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs border-t border-b border-[#EEF0EC] py-4">
                  <div>
                    <span className="text-[#8A939B] block mb-0.5">Email Address:</span>
                    <span className="font-semibold text-[#151A1E]">daniyal.khan@company.com</span>
                  </div>
                  <div>
                    <span className="text-[#8A939B] block mb-0.5">Assigned Manager:</span>
                    <span className="font-semibold text-[#151A1E]">Sara Malik (Super Admin)</span>
                  </div>
                  <div>
                    <span className="text-[#8A939B] block mb-0.5">Work Schedule:</span>
                    <span className="font-semibold text-[#151A1E]">Mon - Fri, 09:00 AM - 05:00 PM</span>
                  </div>
                  <div>
                    <span className="text-[#8A939B] block mb-0.5">Authorized Device:</span>
                    <span className="font-mono text-[#151A1E]">PC-014 &bull; macOS 15.1</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setCurrentScreen('D03-change-password')}
                    className="px-3 py-1.5 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#151A1E] rounded-lg text-xs font-semibold"
                  >
                    Change Password (D03)
                  </button>
                  <button
                    onClick={() => setCurrentScreen('D01-login')}
                    className="px-3 py-1.5 bg-transparent text-[#C2362B] hover:bg-[#FBE7E4] rounded-lg text-xs font-semibold"
                  >
                    Sign Out (D01)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: D08 Break Dialog */}
      {showBreakModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[440px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center justify-between">
              <span>Take a Break</span>
              <X className="w-4 h-4 text-[#8A939B] cursor-pointer" onClick={() => setShowBreakModal(false)} />
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-xs font-semibold text-[#4A535B]">Select Break Type</label>
              <div className="space-y-2 text-xs">
                {['Lunch break (45m)', 'Short tea break (15m)', 'Prayer break (20m)'].map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      breakType === type.split(' (')[0]
                        ? 'bg-[#E3F1EE] border-[#0F6B5C] font-semibold text-[#0B5548]'
                        : 'border-[#E4E7E1] hover:bg-[#FAFBF9] text-[#151A1E]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="break"
                      checked={breakType === type.split(' (')[0]}
                      onChange={() => setBreakType(type.split(' (')[0])}
                      className="text-[#0F6B5C] focus:ring-[#0F6B5C]"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowBreakModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShiftState(ShiftState.ON_BREAK);
                  setShowBreakModal(false);
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Start Break
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: D09 Long Idle Prompt */}
      {showIdlePrompt && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[460px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-[#B26A00]" />
                <span>You've been idle for 15 minutes</span>
              </div>
              <X className="w-4 h-4 text-[#8A939B] cursor-pointer" onClick={() => setShowIdlePrompt(false)} />
            </div>
            <div className="p-5 text-xs text-[#4A535B] space-y-4">
              <p>
                No mouse or keyboard activity was detected since <strong>02:45 PM</strong>. How would you like this time to be recorded?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => setShowIdlePrompt(false)}
                  className="w-full text-left p-3 rounded-lg border border-[#E4E7E1] hover:border-[#0F6B5C] hover:bg-[#FAFBF9] font-medium"
                >
                  <strong className="text-[#151A1E] block">Working (Offline meeting, phone call, or paperwork)</strong>
                  <span className="text-[11px] text-[#8A939B]">Keep time in active shift hours</span>
                </button>
                <button
                  onClick={() => {
                    setShiftState(ShiftState.ON_BREAK);
                    setShowIdlePrompt(false);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-[#E4E7E1] hover:border-[#0F6B5C] hover:bg-[#FAFBF9] font-medium"
                >
                  <strong className="text-[#151A1E] block">Break Time (Lunch or personal break)</strong>
                  <span className="text-[11px] text-[#8A939B]">Categorize the 15 minutes as break</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: D10 End Shift Summary */}
      {showEndShiftModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[480px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E]">
              End Shift &amp; Punch Out
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8A939B]">Total Shift Duration:</span>
                  <span className="font-mono font-bold text-[#151A1E]">{formatHoursMins(shiftSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A939B]">Active Working Time:</span>
                  <span className="font-mono font-semibold text-[#1E8E5A]">{formatHoursMins(activeSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A939B]">Break &amp; Idle Time:</span>
                  <span className="font-mono text-[#B26A00]">{formatHoursMins(idleSeconds)}</span>
                </div>
                <div className="flex justify-between border-t border-[#EEF0EC] pt-2">
                  <span className="text-[#8A939B]">Calls Logged Today:</span>
                  <span className="font-mono font-semibold text-[#151A1E]">32 calls</span>
                </div>
              </div>
              <p className="text-xs text-[#8A939B]">
                Punch-out will finalize your daily timesheet and submit it for payroll verification.
              </p>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowEndShiftModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShiftState(ShiftState.OFF_SHIFT);
                  setShowEndShiftModal(false);
                }}
                className="px-4 py-1.5 bg-[#C2362B] hover:bg-[#9E2A21] text-white rounded-lg text-xs font-semibold"
              >
                Confirm Punch Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: D14 Log Call Dialog */}
      {showLogCallModal && selectedLead && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[500px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center justify-between">
              <span>Log Call: {selectedLead.name} ({selectedLead.company})</span>
              <X className="w-4 h-4 text-[#8A939B] cursor-pointer" onClick={() => setShowLogCallModal(false)} />
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Call Duration</label>
                  <input
                    type="text"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Outcome</label>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none bg-white"
                  >
                    <option value={CallOutcome.CONNECTED}>Connected (Conversation)</option>
                    <option value={CallOutcome.VOICEMAIL}>Left Voicemail</option>
                    <option value={CallOutcome.NO_ANSWER}>No Answer</option>
                    <option value={CallOutcome.BUSY}>Busy</option>
                    <option value={CallOutcome.WRONG_NUMBER}>Wrong Number</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Call Notes</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Summarize conversation, objections, and next steps..."
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowLogCallModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Call saved for ${selectedLead.name} (${callOutcome})`);
                  setShowLogCallModal(false);
                  setCallNotes('');
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Save Call Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: D16 Email Compose */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[560px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center justify-between">
              <span>Compose Email</span>
              <X className="w-4 h-4 text-[#8A939B] cursor-pointer" onClick={() => setShowComposeModal(false)} />
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">To</label>
                <input
                  type="text"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Message</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowComposeModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Email dispatched to ${emailTo}`);
                  setShowComposeModal(false);
                  setEmailTo('');
                  setEmailSubject('');
                  setEmailBody('');
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: D19 Attendance Correction Request */}
      {showCorrectionModal && (
        <div className="fixed inset-0 bg-[rgba(21,26,30,0.38)] flex items-center justify-center z-50">
          <div className="w-[480px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEF0EC] font-semibold text-sm text-[#151A1E] flex items-center justify-between">
              <span>Attendance Correction Request</span>
              <X className="w-4 h-4 text-[#8A939B] cursor-pointer" onClick={() => setShowCorrectionModal(false)} />
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Date</label>
                <input
                  type="date"
                  value={correctionDate}
                  onChange={(e) => setCorrectionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Correct Check-in Time</label>
                  <input
                    type="text"
                    value={correctionPunchIn}
                    onChange={(e) => setCorrectionPunchIn(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A535B] mb-1">Correct Check-out Time</label>
                  <input
                    type="text"
                    value={correctionPunchOut}
                    onChange={(e) => setCorrectionPunchOut(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg font-mono text-xs outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1">Reason for Adjustment</label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Workstation power outage / offsite client visit..."
                  className="w-full px-3 py-2 border border-[#E4E7E1] rounded-lg text-xs outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Correction request submitted to manager.');
                  setShowCorrectionModal(false);
                  setCorrectionReason('');
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
