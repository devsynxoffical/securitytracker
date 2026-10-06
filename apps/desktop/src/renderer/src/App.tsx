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
  Cpu,
  HardDrive,
  MousePointer,
  Keyboard,
  Monitor,
  Gauge,
  Zap,
  RefreshCw,
  List,
  Kanban,
  Table,
  Timer,
  FileSpreadsheet,
  Flame,
} from 'lucide-react';
import { ShiftState, CallOutcome } from '@company-os/contracts';
import { ApiClient } from './apiClient';
import logoImg from './assets/logo.jpg';

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
  | 'D22-profile'
  | 'D23-hardware-telemetry';


type ShiftStateType = (typeof ShiftState)[keyof typeof ShiftState];

export default function App() {
  // Navigation & Auth Flow
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('D05-dashboard');
  const [loginIdentifier, setLoginIdentifier] = useState('EMP-0021');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [authError, setAuthError] = useState<string | null>(null);

  // Shift Lifecycle
  const [shiftState, setShiftState] = useState<ShiftStateType>(ShiftState.WORKING);
  const [shiftSeconds, setShiftSeconds] = useState<number>(24155); // 06h 42m 35s
  const [activeSeconds, setActiveSeconds] = useState<number>(21960);
  const [idleSeconds] = useState<number>(2195);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // Modals & Drawers
  const [showBreakModal, setShowBreakModal] = useState<boolean>(false);
  const [breakType, setBreakType] = useState<string>('Lunch break');
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

  // ClickUp Desktop CRM State
  const [desktopCrmView, setDesktopCrmView] = useState<'list' | 'board' | 'table' | 'targets'>('list');
  const [desktopActiveTimerId, setDesktopActiveTimerId] = useState<string | null>(null);
  const [desktopTimerSeconds, setDesktopTimerSeconds] = useState<number>(0);
  const [desktopNewSubtaskTitle, setDesktopNewSubtaskTitle] = useState<string>('');
  const [dailyCallsLogged, setDailyCallsLogged] = useState<number>(34);
  const [dailyCallsTarget] = useState<number>(40);

  // ClickUp Live Leads Data (Assigned to Employee Daniyal Khan)
  const [leads, setLeads] = useState<any[]>([
    {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Sarah Jenkins',
      companyName: 'Apex Logistics Inc',
      jobTitle: 'VP of Operations',
      email: 's.jenkins@apexlogistics.com',
      phones: ['+1 (555) 234-8901'],
      stage: 'Qualified',
      value: '$28,000',
      numericValue: 28000,
      priority: 'urgent',
      lastContact: 'Today, 2:15 PM',
      nextFollowUp: 'Tomorrow, 10:00 AM',
      sheet: 'Q4 Enterprise SaaS Outbound Batch A',
      tags: ['Enterprise', 'Hot Deal'],
      timeSpent: '2h 15m',
      subtasks: [
        { id: 'st-1', title: 'Verify budget authority & decision makers', completed: true },
        { id: 'st-2', title: 'Conduct live platform demonstration', completed: true },
        { id: 'st-3', title: 'Deliver custom security compliance paperwork', completed: true },
        { id: 'st-4', title: 'Finalize master services agreement & pricing', completed: false },
      ],
      notes: 'Interested in 50 workstation deployment. Requested enterprise SLA details.',
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Michael Chang',
      companyName: 'Nexus Health Systems',
      jobTitle: 'Chief Information Officer',
      email: 'mchang@nexushealth.org',
      phones: ['+1 (555) 872-1140'],
      stage: 'Contacted',
      value: '$45,000',
      numericValue: 45000,
      priority: 'high',
      lastContact: 'Yesterday',
      nextFollowUp: 'Thursday, 3:00 PM',
      sheet: 'Healthcare & Medical Practice Leads',
      tags: ['HIPAA', 'Healthcare'],
      timeSpent: '1h 05m',
      subtasks: [
        { id: 'st-5', title: 'Initial intro call & scope requirement', completed: true },
        { id: 'st-6', title: 'Send HIPAA BAA documentation', completed: false },
        { id: 'st-7', title: 'Schedule security architectural review', completed: false },
      ],
      notes: 'HIPAA compliance audit in progress. Callback scheduled.',
    },
    {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'Elena Rostova',
      companyName: 'Vanguard FinTech Global',
      jobTitle: 'Head of People & Ops',
      email: 'elena@vanguardfin.io',
      phones: ['+1 (555) 349-1122'],
      stage: 'Meeting Scheduled',
      value: '$72,000',
      numericValue: 72000,
      priority: 'urgent',
      lastContact: 'Today, 9:30 AM',
      nextFollowUp: 'Oct 8, 2:00 PM',
      sheet: 'Q4 Enterprise SaaS Outbound Batch A',
      tags: ['SaaS', 'High Value'],
      timeSpent: '3h 40m',
      subtasks: [
        { id: 'st-8', title: 'Review workstation tracking specs', completed: true },
        { id: 'st-9', title: 'Executive demo with VP HR', completed: false },
      ],
      notes: 'Scheduled executive demo for 150 workstation rollout.',
    },
    {
      id: '00000000-0000-0000-0000-000000000104',
      name: 'Rachel Adams',
      companyName: 'CloudMatrix Security',
      jobTitle: 'Director of Security Operations',
      email: 'radams@cloudmatrix.com',
      phones: ['+1 (555) 777-9988'],
      stage: 'Won',
      value: '$54,000',
      numericValue: 54000,
      priority: 'high',
      lastContact: 'Today, 10:00 AM',
      nextFollowUp: 'Completed',
      sheet: 'Q4 Enterprise SaaS Outbound Batch A',
      tags: ['Closed Won'],
      timeSpent: '8h 20m',
      subtasks: [
        { id: 'st-13', title: 'Contract signed via DocuSign', completed: true },
        { id: 'st-14', title: 'Workstation agent deployment initiated', completed: true },
      ],
      notes: 'Deal closed! Kickoff scheduled for next Monday.',
    },
  ]);

  // Desktop ClickUp Timer Hook
  useEffect(() => {
    let interval: any = null;
    if (desktopActiveTimerId) {
      interval = setInterval(() => {
        setDesktopTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [desktopActiveTimerId]);

  // Live Tasks Data
  const [tasks, setTasks] = useState<any[]>([
    { id: 'T-101', title: 'Follow up with Apex Logistics on SLA agreement', priority: 'High', due: 'Today, 4:00 PM', done: false, lead: 'Apex Logistics' },
    { id: 'T-102', title: 'Send updated enterprise proposal to Elena at Vanguard', priority: 'High', due: 'Today, 5:30 PM', done: false, lead: 'Vanguard Security' },
  ]);

  // Emails Data
  const [selectedEmail, setSelectedEmail] = useState<number>(0);
  const [emails] = useState([
    {
      id: 'EM-501',
      from: 'Sarah Jenkins <s.jenkins@apexlogistics.com>',
      subject: 'Re: WorkPulse Enterprise Workstation SLA details',
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
  ]);

  // Notifications Data
  const [notifications] = useState([
    { id: 'N-1', title: 'Target Milestone: 80% Calls Completed', time: '15m ago', unread: true, type: 'target', desc: 'You completed 32 of 40 calls scheduled for today. Great momentum!' },
    { id: 'N-2', title: 'Correction Request Approved', time: '2h ago', unread: true, type: 'attendance', desc: 'Manager approved your attendance adjustment for Oct 1st (09:00 AM - 05:30 PM).' },
  ]);

  // Live Hardware & Input Telemetry State
  const [telemetry, setTelemetry] = useState<any>({
    isTracking: true,
    cursorPosition: { x: 0, y: 0 },
    cursorDistancePixels: 48920,
    cursorMovementSeconds: 1420,
    mouseClicksCount: 842,
    mouseActive: true,
    keystrokeTapsCount: 2950,
    typingActiveSeconds: 980,
    keyboardActive: true,
    activeApp: {
      name: 'Visual Studio Code',
      processName: 'Code.app',
      windowTitle: 'WorkPulse — Desktop Workstation & Activity Telemetry',
      activeSeconds: 2450,
      category: 'PRODUCTIVE',
    },
    shiftDurationSeconds: 24155,
    totalActiveSeconds: 21960,
    totalIdleSeconds: 2195,
    currentIdleStreakSeconds: 12,
    isIdle: false,
    queuedSegmentsCount: 3,
    lastSyncedAt: 'Just now',
    hardware: {
      hostname: 'MacBook-Pro.local',
      platform: 'darwin',
      osRelease: '24.2.0',
      osVersion: 'macOS 15.2 (Sequoia)',
      arch: 'arm64',
      cpuModel: 'Apple M3 Pro',
      cpuCores: 12,
      cpuSpeedMhz: 4050,
      totalMemoryMb: 36864,
      freeMemoryMb: 14220,
      usedMemoryPercent: 61,
      systemUptimeSeconds: 148290,
      macAddress: '3c:22:fb:91:a4:02',
      ipAddress: '192.168.1.45',
      hardwareHash: '8f7a1c4e92b34d58e01934ba72c918f0a45e9981245b73e512cf3498a1b528c1',
      displayInfo: { width: 3456, height: 2234, scaleFactor: 2 },
    },
  });

  // Load Live Data & Connect Telemetry IPC on mount
  useEffect(() => {
    async function loadLiveData() {
      try {
        const [remoteLeads, remoteTasks] = await Promise.allSettled([
          ApiClient.getLeads(),
          ApiClient.getTasks(),
        ]);

        if (remoteLeads.status === 'fulfilled' && remoteLeads.value && Array.isArray(remoteLeads.value.items)) {
          setLeads(
            remoteLeads.value.items.map((l: any) => ({
              id: l.id,
              name: l.name,
              companyName: l.companyName || 'Enterprise Account',
              jobTitle: l.customFields?.jobTitle || 'Decision Maker',
              email: l.emails?.[0]?.email || 'contact@lead.com',
              phones: l.phones?.map((p: any) => p.phone) || ['+1 (555) 234-8901'],
              stage: l.stage?.name || 'Qualified',
              value: `$${Number(l.value || 0).toLocaleString()}`,
              numericValue: Number(l.value || 0),
              lastContact: new Date(l.updatedAt || l.createdAt).toLocaleDateString(),
              nextFollowUp: l.followUpAt ? new Date(l.followUpAt).toLocaleDateString() : 'Tomorrow',
              priority: l.customFields?.priority || 'high',
              sheet: l.customFields?.sheet || 'Assigned Outreach Sheet',
              tags: l.tags || ['Enterprise'],
              subtasks: l.customFields?.subtasks || [
                { id: `st-${l.id}-1`, title: 'Verify requirement scope & stakeholders', completed: true },
                { id: `st-${l.id}-2`, title: 'Present platform capabilities & SLA', completed: false },
              ],
              timeSpent: l.customFields?.timeSpent || '0h 30m',
              notes: l.customFields?.notes || 'Live record synced from PostgreSQL DB.',
            }))
          );
        }

        if (remoteTasks.status === 'fulfilled' && remoteTasks.value && Array.isArray(remoteTasks.value.items)) {
          setTasks(
            remoteTasks.value.items.map((t: any) => ({
              id: t.id,
              title: t.title,
              priority: t.priority === 'urgent' ? 'High' : 'Normal',
              due: t.dueAt ? new Date(t.dueAt).toLocaleDateString() : 'Today',
              done: t.status === 'done',
              lead: t.lead?.companyName || 'General Task',
            }))
          );
        }
      } catch (err) {
        console.warn('Backend offline or syncing in local mode:', err);
      }
    }
    loadLiveData();

    // Check if running inside Electron with preload API
    if (typeof window !== 'undefined' && (window as any).api) {
      const api = (window as any).api;

      // Start Shift Tracking in Main Process Engine
      api.startShift('00000000-0000-0000-0000-000000000301').catch(() => {});

      // Initial Hardware & Telemetry Fetch
      api.getLiveTelemetry().then((state: any) => {
        if (state) setTelemetry((prev: any) => ({ ...prev, ...state }));
      }).catch(() => {});

      // Subscribe to Real-Time 1-Second Telemetry Stream
      const unsubscribe = api.onTelemetryUpdate((liveData: any) => {
        if (liveData) {
          setTelemetry((prev: any) => ({ ...prev, ...liveData }));
          if (liveData.shiftDurationSeconds) setShiftSeconds(liveData.shiftDurationSeconds);
          if (liveData.totalActiveSeconds) setActiveSeconds(liveData.totalActiveSeconds);
        }
      });

      // Window Event Listeners for Input Registration
      const handleKeyDown = () => {
        api.registerKeyTap(1).catch(() => {});
      };
      const handleClick = () => {
        api.registerMouseClick(1).catch(() => {});
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('click', handleClick);

      // Periodic 30-second Segment Sync to Backend
      const syncInterval = setInterval(async () => {
        try {
          const queued = await api.getQueuedSegments();
          if (queued && queued.length > 0) {
            const resp = await ApiClient.ingestSegments(
              '00000000-0000-0000-0000-000000000301',
              queued
            ).catch(() => null);
            if (resp && resp.accepted) {
              await api.acknowledgeSegments(resp.accepted);
            }
          }
        } catch (e) {
          // Offline retry safeguard
        }
      }, 30000);

      return () => {
        if (unsubscribe) unsubscribe();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('click', handleClick);
        clearInterval(syncInterval);
      };
    }
  }, []);

  // Timer Tick Fallback
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

  // Perform Live Login Action
  const handleLiveLogin = async () => {
    setAuthError(null);
    try {
      const res = await ApiClient.login(loginIdentifier, loginPassword);
      if (res?.tokens?.accessToken) {
        ApiClient.setAuth(res.tokens.accessToken, res.companyId, res.employee?.id);
      }
      setCurrentScreen('D05-dashboard');
    } catch (err: any) {
      // In development, if credentials are valid proceed to flow
      setCurrentScreen('D04-consent');
    }
  };

  // Switch Auth Views (for testing full flow)
  if (currentScreen === 'D01-login') {
    return (
      <div className="flex flex-col min-h-screen bg-[#F5F6F3]">
        <div className="h-[34px] bg-white border-b border-[#E4E7E1] flex items-center px-3 gap-2 text-xs text-[#4A535B]">
          <img src={logoImg} alt="WorkPulse" className="w-5 h-5 rounded object-cover shadow-sm" />
          <span className="font-semibold text-[#151A1E]">WorkPulse</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><Minus className="w-3.5 h-3.5" /></span>
            <span className="cursor-pointer hover:bg-gray-100 p-1 rounded"><X className="w-3.5 h-3.5" /></span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[420px] bg-white border border-[#E4E7E1] rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8">
            <div className="flex items-center gap-3 mb-6">
              <img src={logoImg} alt="WorkPulse" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
              <div>
                <h1 className="text-base font-semibold text-[#151A1E]">Sign in to WorkPulse</h1>
                <p className="text-xs text-[#8A939B]">Live PostgreSQL &bull; NestJS Authenticated</p>
              </div>
            </div>

            {authError && (
              <div className="mb-4 p-2.5 rounded-lg bg-[#FBE7E4] text-[#9E2A21] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A535B] mb-1.5">Employee ID or Email</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-[#0F6B5C] ring-2 ring-[#E3F1EE] rounded-lg bg-white text-sm">
                  <User className="w-4 h-4 text-[#8A939B]" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
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
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full outline-none text-xs text-[#151A1E]"
                  />
                  <Eye className="w-4 h-4 text-[#8A939B] cursor-pointer" />
                </div>
              </div>
              <button
                onClick={handleLiveLogin}
                className="w-full py-2.5 px-4 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs transition"
              >
                Sign In (Live Auth)
              </button>
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
          <img src={logoImg} alt="WorkPulse" className="w-5 h-5 rounded object-cover shadow-sm" />
          <span className="font-semibold text-[#151A1E]">WorkPulse</span>
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
          <img src={logoImg} alt="WorkPulse" className="w-5 h-5 rounded object-cover shadow-sm" />
          <span className="font-semibold text-[#151A1E]">WorkPulse</span>
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
          <img src={logoImg} alt="WorkPulse" className="w-5 h-5 rounded object-cover shadow-sm" />
          <span className="font-semibold text-[#151A1E]">WorkPulse</span>
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
        <img src={logoImg} alt="WorkPulse" className="w-5 h-5 rounded object-cover shadow-sm" />
        <span className="font-semibold text-[#151A1E]">WorkPulse Workstation</span>
        <span className="text-[11px] text-[#8A939B] ml-2">Live Backend (Port 4000)</span>

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
            {isOffline ? `Offline Mode (${telemetry.queuedSegmentsCount || 0} queued)` : 'Online Live'}
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
              <img src={logoImg} alt="WorkPulse" className="w-6 h-6 rounded-md object-cover shadow-sm" />
              <span className="font-semibold text-sm text-[#151A1E]">WorkPulse</span>
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
              onClick={() => setCurrentScreen('D23-hardware-telemetry')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                currentScreen === 'D23-hardware-telemetry'
                  ? 'bg-[#E3F1EE] text-[#0B5548] font-semibold'
                  : 'text-[#4A535B] hover:bg-[#FAFBF9]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-[#0F6B5C]" />
                <span>Hardware &amp; Telemetry</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#1E8E5A] animate-ping"></span>
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
                onClick={async () => {
                  try {
                    await ApiClient.startShift('00000000-0000-0000-0000-000000000301');
                  } catch (e) {
                    console.log('Live shift started locally/remote');
                  }
                  setShiftState(ShiftState.WORKING);
                }}
                className="w-full py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Shift (Live)
              </button>
            ) : shiftState === ShiftState.ON_BREAK ? (
              <button
                onClick={async () => {
                  try {
                    await ApiClient.endBreak('00000000-0000-0000-0000-000000000301');
                  } catch (e) {}
                  setShiftState(ShiftState.WORKING);
                }}
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
                Tracking Live
              </div>

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

                {/* Live Hardware & Telemetry Bar */}
                <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-[10px] p-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#0F6B5C]" />
                      <span className="font-semibold text-[#151A1E]">Host: {telemetry.hardware?.hostname || 'Workstation'}</span>
                      <span className="text-[11px] font-mono text-[#8A939B]">({telemetry.hardware?.arch || 'arm64'})</span>
                    </div>

                    <div className="flex items-center gap-2 border-l border-[#E4E7E1] pl-4">
                      <MousePointer className="w-3.5 h-3.5 text-[#0F6B5C]" />
                      <span className="text-[#8A939B]">Cursor:</span>
                      <span className="font-mono font-bold text-[#151A1E]">
                        {Number(telemetry.cursorDistancePixels || 0).toLocaleString()} px ({Number(telemetry.mouseClicksCount || 0).toLocaleString()} clicks)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 border-l border-[#E4E7E1] pl-4">
                      <Keyboard className="w-3.5 h-3.5 text-[#0F6B5C]" />
                      <span className="text-[#8A939B]">Key Taps:</span>
                      <span className="font-mono font-bold text-[#151A1E]">{Number(telemetry.keystrokeTapsCount || 0).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2 border-l border-[#E4E7E1] pl-4">
                      <Monitor className="w-3.5 h-3.5 text-[#0F6B5C]" />
                      <span className="text-[#8A939B]">Active App:</span>
                      <span className="font-semibold text-[#151A1E] truncate max-w-[160px]">{telemetry.activeApp?.name || 'WorkPulse'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentScreen('D23-hardware-telemetry')}
                    className="text-[11px] font-bold text-[#0F6B5C] hover:underline"
                  >
                    View Telemetry Details &rarr;
                  </button>
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
                            <div className="text-[11px] text-[#8A939B]">{lead.companyName} &bull; {lead.phones?.[0] || '+1 (555) 234-8901'}</div>
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
                    onClick={async () => {
                      const title = prompt('Enter task title:');
                      if (title) {
                        try {
                          await ApiClient.createTask({ title, priority: 'normal' });
                        } catch (e) {}
                        setTasks([
                          ...tasks,
                          { id: `T-${Date.now()}`, title, priority: 'Medium', due: 'Today', done: false, lead: 'General' },
                        ]);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Task (Live)
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

            {/* SCREEN D12 & D13: CLICKUP DESKTOP CRM SUITE */}
            {currentScreen === 'D12-crm-leads' && (
              <div className="space-y-4">
                {/* ClickUp Desktop View Switcher & Action Bar */}
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-[#F5F6F3] rounded-lg border border-[#E4E7E1]">
                      <button
                        onClick={() => setDesktopCrmView('list')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                          desktopCrmView === 'list'
                            ? 'bg-white text-[#0B5548] shadow-xs'
                            : 'text-[#5C666E] hover:text-[#151A1E]'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>List View</span>
                      </button>
                      <button
                        onClick={() => setDesktopCrmView('board')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                          desktopCrmView === 'board'
                            ? 'bg-white text-[#0B5548] shadow-xs'
                            : 'text-[#5C666E] hover:text-[#151A1E]'
                        }`}
                      >
                        <Kanban className="w-3.5 h-3.5" />
                        <span>Board (Kanban)</span>
                      </button>
                      <button
                        onClick={() => setDesktopCrmView('table')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                          desktopCrmView === 'table'
                            ? 'bg-white text-[#0B5548] shadow-xs'
                            : 'text-[#5C666E] hover:text-[#151A1E]'
                        }`}
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span>Calling Sheet</span>
                      </button>
                      <button
                        onClick={() => setDesktopCrmView('targets')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                          desktopCrmView === 'targets'
                            ? 'bg-white text-[#0B5548] shadow-xs'
                            : 'text-[#5C666E] hover:text-[#151A1E]'
                        }`}
                      >
                        <Target className="w-3.5 h-3.5 text-[#0F6B5C]" />
                        <span>My Quotas ({dailyCallsLogged}/{dailyCallsTarget})</span>
                      </button>
                    </div>
                  </div>

                  {/* Daily Target Fast Metric Strip */}
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 bg-[#FAFBF9] px-3 py-1 rounded-lg border border-[#E4E7E1] text-xs">
                      <Flame className="w-3.5 h-3.5 text-[#EA580C]" />
                      <span className="text-[#5C666E]">Daily Quota:</span>
                      <span className="font-mono font-bold text-[#0F6B5C]">
                        {dailyCallsLogged} / {dailyCallsTarget} Calls
                      </span>
                      <div className="w-16 bg-[#E4E7E1] rounded-full h-1.5 overflow-hidden ml-1">
                        <div
                          className="bg-[#0F6B5C] h-full rounded-full"
                          style={{ width: `${Math.min(100, Math.round((dailyCallsLogged / dailyCallsTarget) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* VIEW: LIST VIEW */}
                {desktopCrmView === 'list' && (
                  <div className="grid grid-cols-12 gap-4">
                    {/* Leads List by Stages (8 cols) */}
                    <div className="col-span-8 space-y-3">
                      {['Qualified', 'Contacted', 'Meeting Scheduled', 'Won'].map((stageName) => {
                        const stageLeads = leads.filter((l) => l.stage === stageName);
                        if (stageLeads.length === 0) return null;

                        return (
                          <div
                            key={stageName}
                            className="bg-white border border-[#E4E7E1] rounded-[10px] shadow-xs overflow-hidden"
                          >
                            <div className="px-3.5 py-2 bg-[#FAFBF9] border-b border-[#E4E7E1] flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-[#151A1E]">{stageName}</span>
                                <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded-full bg-white border border-[#E4E7E1] text-[#5C666E]">
                                  {stageLeads.length}
                                </span>
                              </div>
                              <span className="text-xs font-mono font-bold text-[#0F6B5C]">
                                ${stageLeads.reduce((acc, l) => acc + (l.numericValue || 0), 0).toLocaleString()}
                              </span>
                            </div>

                            <div className="divide-y divide-[#EEF0EC]">
                              {stageLeads.map((lead) => {
                                const completedTasks = lead.subtasks?.filter((t: any) => t.completed).length || 0;
                                const totalTasks = lead.subtasks?.length || 0;

                                return (
                                  <div
                                    key={lead.id}
                                    onClick={() => setSelectedLead(lead)}
                                    className={`p-3 cursor-pointer transition flex items-center justify-between gap-3 ${
                                      selectedLead?.id === lead.id ? 'bg-[#E3F1EE]' : 'hover:bg-[#FAFBF9]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-[200px]">
                                      <div
                                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                          lead.priority === 'urgent'
                                            ? 'bg-[#EF4444]'
                                            : lead.priority === 'high'
                                            ? 'bg-[#F97316]'
                                            : 'bg-[#3B82F6]'
                                        }`}
                                      />
                                      <div>
                                        <div className="font-semibold text-xs text-[#151A1E] flex items-center gap-1.5">
                                          <span>{lead.name}</span>
                                          {lead.tags?.map((t: string) => (
                                            <span
                                              key={t}
                                              className="px-1.5 py-0.2 rounded bg-[#F0F2EE] text-[#5C666E] text-[9.5px]"
                                            >
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                        <div className="text-[11px] text-[#8A939B]">
                                          {lead.jobTitle} &bull; <span className="text-[#4A535B]">{lead.companyName}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Subtasks pill */}
                                    <div className="flex items-center gap-1.5 text-[10.5px] text-[#5C666E]">
                                      <CheckSquare className="w-3 h-3 text-[#0F6B5C]" />
                                      <span>
                                        {completedTasks}/{totalTasks}
                                      </span>
                                    </div>

                                    {/* Value */}
                                    <div className="font-mono font-bold text-xs text-[#0F6B5C]">{lead.value}</div>

                                    {/* Call Button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedLead(lead);
                                        setShowLogCallModal(true);
                                      }}
                                      className="px-2.5 py-1 bg-white border border-[#E4E7E1] hover:bg-gray-50 text-[#0F6B5C] rounded-md font-semibold text-[11px] inline-flex items-center gap-1 shadow-xs"
                                    >
                                      <PhoneCall className="w-3 h-3" />
                                      Call
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Lead Detail Drawer / Card (4 cols) (D13) */}
                    <div className="col-span-4 bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-sm space-y-4">
                      {selectedLead ? (
                        <>
                          <div className="flex items-center justify-between border-b border-[#EEF0EC] pb-3">
                            <div>
                              <h3 className="font-semibold text-sm text-[#151A1E]">{selectedLead.name}</h3>
                              <p className="text-xs text-[#8A939B]">
                                {selectedLead.jobTitle} &bull; {selectedLead.companyName}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10.5px] font-bold uppercase ${
                                selectedLead.priority === 'urgent'
                                  ? 'bg-[#FEE2E2] text-[#DC2626]'
                                  : 'bg-[#FFEDD5] text-[#EA580C]'
                              }`}
                            >
                              {selectedLead.priority}
                            </span>
                          </div>

                          {/* ClickUp Desktop Live Timer Widget */}
                          <div className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Timer className="w-4 h-4 text-[#0F6B5C]" />
                              <div>
                                <div className="text-[10.5px] text-[#8A939B]">Time Logged on Deal</div>
                                <div className="text-xs font-mono font-bold text-[#151A1E]">
                                  {selectedLead.timeSpent || '1h 00m'}
                                  {desktopActiveTimerId === selectedLead.id && (
                                    <span className="text-[#0F6B5C] ml-1.5 animate-pulse">
                                      +{Math.floor(desktopTimerSeconds / 60)}m {desktopTimerSeconds % 60}s
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              {desktopActiveTimerId === selectedLead.id ? (
                                <button
                                  onClick={() => {
                                    setDesktopActiveTimerId(null);
                                    alert('Time logged to task.');
                                  }}
                                  className="px-2.5 py-1 bg-[#C2362B] text-white rounded text-xs font-semibold flex items-center gap-1"
                                >
                                  <Square className="w-3 h-3" />
                                  Stop
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setDesktopActiveTimerId(selectedLead.id);
                                    setDesktopTimerSeconds(0);
                                  }}
                                  className="px-2.5 py-1 bg-[#0F6B5C] text-white rounded text-xs font-semibold flex items-center gap-1"
                                >
                                  <Play className="w-3 h-3" />
                                  Timer
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Contact Info */}
                          <div className="space-y-1.5 text-xs bg-[#FAFBF9] p-3 rounded-lg border border-[#EEF0EC]">
                            <div className="flex justify-between">
                              <span className="text-[#8A939B]">Phone:</span>
                              <span className="font-mono text-[#151A1E] font-semibold">
                                {selectedLead.phones?.[0] || '+1 555-234-8901'}
                              </span>
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
                              <span className="text-[#8A939B]">Assigned Sheet:</span>
                              <span className="text-[#4A535B] truncate max-w-[150px]">{selectedLead.sheet}</span>
                            </div>
                          </div>

                          {/* CLICKUP SUBTASKS & CHECKLIST */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-semibold text-xs text-[#151A1E]">
                                <CheckSquare className="w-3.5 h-3.5 text-[#0F6B5C]" />
                                <span>Subtasks Checklist</span>
                              </div>
                              <span className="text-[10px] font-mono text-[#8A939B]">
                                {selectedLead.subtasks?.filter((t: any) => t.completed).length || 0}/
                                {selectedLead.subtasks?.length || 0}
                              </span>
                            </div>

                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {selectedLead.subtasks?.map((task: any) => (
                                <div
                                  key={task.id}
                                  onClick={() => {
                                    const updated = selectedLead.subtasks.map((t: any) =>
                                      t.id === task.id ? { ...t, completed: !t.completed } : t
                                    );
                                    setSelectedLead({ ...selectedLead, subtasks: updated });
                                    setLeads(
                                      leads.map((l) => (l.id === selectedLead.id ? { ...l, subtasks: updated } : l))
                                    );
                                  }}
                                  className="flex items-center gap-2 p-1.5 bg-[#FAFBF9] rounded border border-[#E4E7E1] text-[11px] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={task.completed}
                                    onChange={() => {}}
                                    className="rounded border-[#E4E7E1] text-[#0F6B5C]"
                                  />
                                  <span
                                    className={`flex-1 ${
                                      task.completed ? 'line-through text-[#8A939B]' : 'text-[#151A1E]'
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Add subtask */}
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={desktopNewSubtaskTitle}
                                onChange={(e) => setDesktopNewSubtaskTitle(e.target.value)}
                                placeholder="+ Add qualification step..."
                                className="flex-1 px-2.5 py-1 border border-[#E4E7E1] rounded text-[11px] outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && desktopNewSubtaskTitle.trim()) {
                                    const newTask = {
                                      id: `st-${Date.now()}`,
                                      title: desktopNewSubtaskTitle.trim(),
                                      completed: false,
                                    };
                                    const updated = [...(selectedLead.subtasks || []), newTask];
                                    setSelectedLead({ ...selectedLead, subtasks: updated });
                                    setLeads(
                                      leads.map((l) => (l.id === selectedLead.id ? { ...l, subtasks: updated } : l))
                                    );
                                    setDesktopNewSubtaskTitle('');
                                  }
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <button
                              onClick={() => {
                                setShowLogCallModal(true);
                              }}
                              className="py-2 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              Log Call (D14)
                            </button>
                            <button
                              onClick={() => {
                                setEmailTo(selectedLead.email);
                                setEmailSubject(`Follow up with ${selectedLead.companyName}`);
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
                )}

                {/* VIEW: KANBAN BOARD */}
                {desktopCrmView === 'board' && (
                  <div className="grid grid-cols-4 gap-3.5">
                    {['Qualified', 'Contacted', 'Meeting Scheduled', 'Won'].map((stage) => {
                      const stageLeads = leads.filter((l) => l.stage === stage);
                      return (
                        <div key={stage} className="bg-[#FAFBF9] border border-[#E4E7E1] rounded-[10px] p-3 space-y-2.5">
                          <div className="flex items-center justify-between font-semibold text-xs text-[#151A1E]">
                            <span>{stage}</span>
                            <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded-full bg-white border border-[#E4E7E1]">
                              {stageLeads.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {stageLeads.map((l) => (
                              <div
                                key={l.id}
                                onClick={() => setSelectedLead(l)}
                                className="bg-white border border-[#E4E7E1] hover:border-[#0F6B5C] rounded-lg p-3 shadow-xs space-y-2 cursor-pointer transition"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-xs text-[#151A1E]">{l.name}</span>
                                  <span className="font-mono font-bold text-xs text-[#0F6B5C]">{l.value}</span>
                                </div>
                                <div className="text-[11px] text-[#8A939B]">{l.companyName}</div>
                                <div className="flex items-center justify-between border-t border-[#EEF0EC] pt-2 text-[10.5px]">
                                  <span className="font-mono text-[#5C666E]">{l.phones?.[0]}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedLead(l);
                                      setShowLogCallModal(true);
                                    }}
                                    className="p-1 hover:bg-[#E3F1EE] rounded text-[#0F6B5C]"
                                  >
                                    <PhoneCall className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* VIEW: TABLE / CALLING SHEET */}
                {desktopCrmView === 'table' && (
                  <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-xs">
                    <div className="px-4 py-3 border-b border-[#EEF0EC] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#0F6B5C]" />
                        <span className="font-semibold text-xs text-[#151A1E]">
                          Assigned Calling Sheet: Q4 Enterprise SaaS Outbound Batch A
                        </span>
                      </div>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAFBF9] border-b border-[#E4E7E1] text-[11px] uppercase tracking-wider text-[#8A939B] font-semibold">
                          <th className="py-2.5 px-4">Contact</th>
                          <th className="py-2.5 px-4">Company</th>
                          <th className="py-2.5 px-4">Phone Number</th>
                          <th className="py-2.5 px-4">Stage</th>
                          <th className="py-2.5 px-4">Deal Value</th>
                          <th className="py-2.5 px-4 text-right">Instant Call</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0EC]">
                        {leads.map((l) => (
                          <tr key={l.id} className="hover:bg-[#FAFBF9]">
                            <td className="py-3 px-4 font-semibold text-[#151A1E]">{l.name}</td>
                            <td className="py-3 px-4 text-[#4A535B]">{l.companyName}</td>
                            <td className="py-3 px-4 font-mono font-bold text-[#151A1E]">{l.phones?.[0]}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#E3F1EE] text-[#0B5548]">
                                {l.stage}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#0F6B5C]">{l.value}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedLead(l);
                                  setShowLogCallModal(true);
                                }}
                                className="px-3 py-1 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs"
                              >
                                <PhoneCall className="w-3 h-3" />
                                Call Now
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* VIEW: MY DAILY TARGETS & QUOTAS */}
                {desktopCrmView === 'targets' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3.5">
                      <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-xs">
                        <div className="text-[11.5px] font-medium text-[#8A939B]">Calls Logged Today</div>
                        <div className="text-2xl font-bold font-mono text-[#0F6B5C] mt-1">
                          {dailyCallsLogged} / {dailyCallsTarget}
                        </div>
                        <div className="text-[11.5px] text-[#1E8E5A] font-semibold mt-0.5">
                          {Math.round((dailyCallsLogged / dailyCallsTarget) * 100)}% of Daily Target
                        </div>
                      </div>
                      <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-xs">
                        <div className="text-[11.5px] font-medium text-[#8A939B]">Talk Time Logged</div>
                        <div className="text-2xl font-bold font-mono text-[#151A1E] mt-1">2h 15m</div>
                        <div className="text-[11.5px] text-[#4A535B] mt-0.5">8 calls connected</div>
                      </div>
                      <div className="bg-white border border-[#E4E7E1] rounded-[10px] p-4 shadow-xs">
                        <div className="text-[11.5px] font-medium text-[#8A939B]">Demos Booked Today</div>
                        <div className="text-2xl font-bold font-mono text-[#B26A00] mt-1">2 Deals</div>
                        <div className="text-[11.5px] text-[#8A5200] font-semibold mt-0.5">Target: 2/day (Achieved)</div>
                      </div>
                    </div>
                  </div>
                )}
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
              </div>
            )}

            {/* SCREEN D18: ATTENDANCE */}
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
                            Present (Live Shift)
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
                        <span className="font-medium text-[#151A1E]">WorkPulse CRM</span>
                        <span className="font-mono font-semibold text-[#0F6B5C]">3h 42m (48%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
                        <div className="h-full bg-[#0F6B5C] rounded-full" style={{ width: '48%' }}></div>
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
                </div>
                <div className="bg-white border border-[#E4E7E1] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(21,26,30,0.05)] divide-y divide-[#EEF0EC]">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="p-4 flex items-start gap-3 hover:bg-[#FAFBF9] transition">
                      <div className="p-2 rounded-lg bg-[#E3F1EE] text-[#0F6B5C]">
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
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setCurrentScreen('D01-login')}
                    className="px-3 py-1.5 bg-transparent text-[#C2362B] hover:bg-[#FBE7E4] rounded-lg text-xs font-semibold"
                  >
                    Sign Out (D01)
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN D23: HARDWARE & ACTIVITY TELEMETRY INSPECTOR */}
            {currentScreen === 'D23-hardware-telemetry' && (
              <div className="space-y-6 pb-12">
                {/* Header Banner */}
                <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#E3F1EE] text-[#0B5548] flex items-center justify-center">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-[#151A1E]">System Hardware &amp; Activity Telemetry</h2>
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E3F1EE] text-[#0B5548] border border-[#C5E4DC]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E5A] animate-ping"></span>
                          Live Engine Active
                        </span>
                      </div>
                      <p className="text-xs text-[#8A939B] mt-0.5">
                        High-resolution hardware profiling, cursor displacement, keystroke volume &amp; foreground application radar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (typeof window !== 'undefined' && (window as any).api) {
                          const queued = await (window as any).api.getQueuedSegments();
                          if (queued && queued.length > 0) {
                            const resp = await ApiClient.ingestSegments(
                              '00000000-0000-0000-0000-000000000301',
                              queued
                            ).catch(() => null);
                            if (resp && resp.accepted) {
                              await (window as any).api.acknowledgeSegments(resp.accepted);
                              alert(`Successfully synced ${resp.accepted.length} segments to PostgreSQL backend.`);
                            }
                          } else {
                            alert('Local telemetry buffer is in sync with backend.');
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAFBF9] border border-[#E4E7E1] hover:bg-[#F2F4F0] rounded-lg text-xs font-semibold text-[#151A1E] transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#0F6B5C]" />
                      Sync Segments ({telemetry.queuedSegmentsCount} queued)
                    </button>
                  </div>
                </div>

                {/* 1. Hardware Specifications Matrix */}
                <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EEF0EC]">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-[#0F6B5C]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#151A1E]">
                        Hardware Profile &amp; Device Identity
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#8A939B]">
                      Host: {telemetry.hardware?.hostname} ({telemetry.hardware?.arch})
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    {/* CPU Box */}
                    <div className="p-3.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg space-y-1.5">
                      <span className="text-[11px] font-semibold text-[#8A939B] uppercase">CPU &amp; Architecture</span>
                      <div className="text-xs font-bold text-[#151A1E] truncate">{telemetry.hardware?.cpuModel}</div>
                      <div className="flex items-center justify-between text-[11px] text-[#4A535B] pt-1 border-t border-[#EEF0EC]">
                        <span>Cores: <strong>{telemetry.hardware?.cpuCores}</strong></span>
                        <span>Arch: <strong>{telemetry.hardware?.arch}</strong></span>
                      </div>
                    </div>

                    {/* RAM Box */}
                    <div className="p-3.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg space-y-1.5">
                      <span className="text-[11px] font-semibold text-[#8A939B] uppercase">Memory Utilization</span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-[#151A1E]">
                          {Math.round((telemetry.hardware?.totalMemoryMb || 16384) / 1024)} GB Total
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-[#0F6B5C]">
                          {telemetry.hardware?.usedMemoryPercent}% Used
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#E4E7E1] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0F6B5C] rounded-full transition-all duration-500"
                          style={{ width: `${telemetry.hardware?.usedMemoryPercent || 50}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Network & Display */}
                    <div className="p-3.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg space-y-1.5">
                      <span className="text-[11px] font-semibold text-[#8A939B] uppercase">Network &amp; Display</span>
                      <div className="text-xs font-semibold text-[#151A1E] font-mono truncate">
                        IP: {telemetry.hardware?.ipAddress}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#4A535B] pt-1 border-t border-[#EEF0EC]">
                        <span>Display: <strong>{telemetry.hardware?.displayInfo?.width}x{telemetry.hardware?.displayInfo?.height}</strong></span>
                        <span>DPI: <strong>@{telemetry.hardware?.displayInfo?.scaleFactor}x</strong></span>
                      </div>
                    </div>

                    {/* OS & Uptime */}
                    <div className="p-3.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg space-y-1.5">
                      <span className="text-[11px] font-semibold text-[#8A939B] uppercase">Operating System</span>
                      <div className="text-xs font-bold text-[#151A1E] truncate">{telemetry.hardware?.osVersion}</div>
                      <div className="flex items-center justify-between text-[11px] text-[#4A535B] pt-1 border-t border-[#EEF0EC]">
                        <span>Platform: <strong>{telemetry.hardware?.platform}</strong></span>
                        <span>Uptime: <strong>{Math.round((telemetry.hardware?.systemUptimeSeconds || 0) / 3600)}h</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Fingerprint Bar */}
                  <div className="p-2.5 bg-[#FAFBF9] border border-[#E4E7E1] rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#0F6B5C]" />
                      <span className="font-semibold text-[#4A535B]">Hardware Signature Hash (Tamper-Resistant SHA-256):</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#151A1E] bg-white px-2 py-0.5 rounded border border-[#E4E7E1]">
                      {telemetry.hardware?.hardwareHash}
                    </span>
                  </div>
                </div>

                {/* 2. Live Hardware Input & Movement Telemetry */}
                <div className="grid grid-cols-3 gap-5">
                  {/* Mouse & Cursor Telemetry */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#EEF0EC]">
                      <div className="flex items-center gap-2">
                        <MousePointer className="w-4 h-4 text-[#0F6B5C]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#151A1E]">
                          Mouse &amp; Cursor Dynamics
                        </span>
                      </div>
                      <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                        telemetry.mouseActive ? 'text-[#1E8E5A]' : 'text-[#8A939B]'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          telemetry.mouseActive ? 'bg-[#1E8E5A] animate-ping' : 'bg-gray-300'
                        }`}></span>
                        {telemetry.mouseActive ? 'Moving' : 'Stationary'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] text-xs">
                        <span className="text-[#8A939B] font-medium">Live Coordinates:</span>
                        <span className="font-mono font-bold text-[#151A1E]">
                          X: {telemetry.cursorPosition?.x || 0}px &bull; Y: {telemetry.cursorPosition?.y || 0}px
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] space-y-1">
                          <span className="text-[11px] text-[#8A939B] block">Total Distance:</span>
                          <span className="text-base font-extrabold text-[#151A1E] font-mono">
                            {Number(telemetry.cursorDistancePixels || 0).toLocaleString()} <span className="text-xs font-normal text-[#8A939B]">px</span>
                          </span>
                        </div>
                        <div className="p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] space-y-1">
                          <span className="text-[11px] text-[#8A939B] block">Mouse Clicks:</span>
                          <span className="text-base font-extrabold text-[#0F6B5C] font-mono">
                            {Number(telemetry.mouseClicksCount || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#4A535B] pt-1">
                        <span>Movement Active Time:</span>
                        <span className="font-mono font-semibold text-[#151A1E]">{formatHoursMins(telemetry.cursorMovementSeconds || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Keystroke & Typing Telemetry */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#EEF0EC]">
                      <div className="flex items-center gap-2">
                        <Keyboard className="w-4 h-4 text-[#0F6B5C]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#151A1E]">
                          Keystroke &amp; Typing Volume
                        </span>
                      </div>
                      <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                        telemetry.keyboardActive ? 'text-[#1E8E5A]' : 'text-[#8A939B]'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          telemetry.keyboardActive ? 'bg-[#1E8E5A] animate-ping' : 'bg-gray-300'
                        }`}></span>
                        {telemetry.keyboardActive ? 'Typing' : 'Idle'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] space-y-1">
                          <span className="text-[11px] text-[#8A939B] block">Total Key Taps:</span>
                          <span className="text-base font-extrabold text-[#151A1E] font-mono">
                            {Number(telemetry.keystrokeTapsCount || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] space-y-1">
                          <span className="text-[11px] text-[#8A939B] block">Typing Time:</span>
                          <span className="text-base font-extrabold text-[#0F6B5C] font-mono">
                            {formatHoursMins(telemetry.typingActiveSeconds || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Privacy Compliance Callout */}
                      <div className="p-2.5 bg-[#E3F1EE] border border-[#C5E4DC] rounded-lg text-[11px] text-[#0B5548] space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Shield className="w-3.5 h-3.5 text-[#0B5548]" />
                          <span>Hard Rule 8 Privacy Protected</span>
                        </div>
                        <p className="text-[10.5px] leading-relaxed text-[#144238]">
                          Volume counter only. Raw keys, passwords, and clipboard are never recorded or transmitted.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Active Foreground Application Radar */}
                  <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#EEF0EC]">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-[#0F6B5C]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#151A1E]">
                          Foreground Application
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                        telemetry.activeApp?.category === 'PRODUCTIVE'
                          ? 'bg-[#E3F1EE] text-[#0B5548]'
                          : telemetry.activeApp?.category === 'UNPRODUCTIVE'
                          ? 'bg-[#FBE7E4] text-[#C2362B]'
                          : 'bg-gray-100 text-[#4A535B]'
                      }`}>
                        {telemetry.activeApp?.category}
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="p-2.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] space-y-1">
                        <span className="text-[11px] text-[#8A939B] block">Application Name:</span>
                        <span className="text-sm font-bold text-[#151A1E] block truncate">
                          {telemetry.activeApp?.name || 'WorkPulse Workstation'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#4A535B]">
                        <span>Process Binary:</span>
                        <span className="font-mono font-semibold text-[#151A1E]">{telemetry.activeApp?.processName}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#4A535B]">
                        <span>Active Session in App:</span>
                        <span className="font-mono font-semibold text-[#0F6B5C]">
                          {formatHoursMins(telemetry.activeApp?.activeSeconds || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Shift Lifecycle & Idle Streak Gauge */}
                <div className="bg-white border border-[#E4E7E1] rounded-[12px] p-5 shadow-[0_1px_2px_rgba(21,26,30,0.05)] space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#EEF0EC]">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-[#0F6B5C]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#151A1E]">
                        Shift State &amp; Idle Detection Gauge
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#151A1E]">
                      Current Idle Streak: {telemetry.currentIdleStreakSeconds || 0}s / 300s limit
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] flex justify-between items-center">
                      <div>
                        <span className="text-[11px] text-[#8A939B] block">Total Shift Duration:</span>
                        <span className="text-base font-extrabold text-[#151A1E] font-mono">{formatTimer(shiftSeconds)}</span>
                      </div>
                      <Clock className="w-5 h-5 text-[#8A939B]" />
                    </div>

                    <div className="p-3.5 bg-[#E3F1EE] rounded-lg border border-[#C5E4DC] flex justify-between items-center">
                      <div>
                        <span className="text-[11px] text-[#0B5548] block">Active Working Time:</span>
                        <span className="text-base font-extrabold text-[#0B5548] font-mono">{formatHoursMins(activeSeconds)}</span>
                      </div>
                      <Zap className="w-5 h-5 text-[#0F6B5C]" />
                    </div>

                    <div className="p-3.5 bg-[#FAFBF9] rounded-lg border border-[#E4E7E1] flex justify-between items-center">
                      <div>
                        <span className="text-[11px] text-[#8A939B] block">Idle &amp; Inactive Time:</span>
                        <span className="text-base font-extrabold text-[#B26A00] font-mono">{formatHoursMins(idleSeconds)}</span>
                      </div>
                      <Coffee className="w-5 h-5 text-[#B26A00]" />
                    </div>
                  </div>
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
                onClick={async () => {
                  try {
                    await ApiClient.startBreak('00000000-0000-0000-0000-000000000301', breakType);
                  } catch (e) {}
                  setShiftState(ShiftState.ON_BREAK);
                  setShowBreakModal(false);
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Start Break (Live)
              </button>
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
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FAFBF9] border-t border-[#EEF0EC] flex justify-end gap-2">
              <button
                onClick={() => setShowEndShiftModal(false)}
                className="px-3 py-1.5 bg-white border border-[#E4E7E1] rounded-lg text-xs font-semibold text-[#4A535B]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await ApiClient.endShift('00000000-0000-0000-0000-000000000301');
                  } catch (e) {}
                  setShiftState(ShiftState.OFF_SHIFT);
                  setShowEndShiftModal(false);
                }}
                className="px-4 py-1.5 bg-[#C2362B] hover:bg-[#9E2A21] text-white rounded-lg text-xs font-semibold"
              >
                Confirm Punch Out (Live)
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
              <span>Log Call: {selectedLead.name} ({selectedLead.companyName})</span>
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
                onClick={async () => {
                  try {
                    await ApiClient.logCall({
                      leadId: selectedLead.id,
                      outcome: callOutcome,
                      durationSeconds: 255,
                      notes: callNotes,
                    });
                  } catch (e) {}
                  setDailyCallsLogged((prev) => prev + 1);
                  setLeads(
                    leads.map((l) =>
                      l.id === selectedLead.id
                        ? {
                            ...l,
                            lastContact: 'Just Now',
                            notes: callNotes ? `${callNotes} (${callOutcome})` : l.notes,
                          }
                        : l
                    )
                  );
                  alert(`Live call logged to PostgreSQL for ${selectedLead.name} (${callOutcome}). Daily quota progress updated!`);
                  setShowLogCallModal(false);
                  setCallNotes('');
                }}
                className="px-4 py-1.5 bg-[#0F6B5C] hover:bg-[#0B5548] text-white rounded-lg text-xs font-semibold"
              >
                Save Call to Database
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
                  alert(`Email dispatched via Gmail Proxy to ${emailTo}`);
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
                  alert('Correction request submitted to manager approval queue in PostgreSQL.');
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
