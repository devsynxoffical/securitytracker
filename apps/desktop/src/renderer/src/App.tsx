import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Shield,
  Mail,
  Coffee,
  Utensils,
  BookOpen,
  Wifi,
  WifiOff,
  PhoneCall,
  Bell,
  Send,
  Target,
  CheckSquare,
  Users,
  X,
} from 'lucide-react';
import { ShiftState, CallOutcome } from '@company-os/contracts';

export default function App() {
  // Shift & Tracking State
  const [shiftState, setShiftState] = useState<string>(ShiftState.WORKING);
  const [shiftSeconds, setShiftSeconds] = useState<number>(1420);
  const [breakType, setBreakType] = useState<string>('Lunch');
  const [showBreakModal, setShowBreakModal] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'overview' | 'crm' | 'email' | 'notifications'>('overview');

  // Interactive CRM Call Logging Modal (F12)
  const [selectedLeadForCall, setSelectedLeadForCall] = useState<any | null>(null);
  const [callOutcome, setCallOutcome] = useState<string>(CallOutcome.CONNECTED);
  const [callNotes, setCallNotes] = useState<string>('');

  // Email Compose Modal
  const [showCompose, setShowCompose] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Targets state
  const [targets, setTargets] = useState({
    callsTotal: { current: 18, target: 40 },
    callsConnected: { current: 12, target: 20 },
    leadsCreated: { current: 4, target: 5 },
    tasksDone: { current: 7, target: 10 },
  });

  // Leads state
  const [leads, setLeads] = useState([
    {
      id: 'lead-1',
      name: 'Alex Vance',
      company: 'Black Mesa Tech',
      stage: 'Discovery',
      phone: '+1 555-0199',
      email: 'alex@blackmesa.com',
      value: '$45,000',
      doNotCall: false,
    },
    {
      id: 'lead-2',
      name: 'Gordon Freeman',
      company: 'Lambda Dynamics',
      stage: 'Proposal',
      phone: '+1 555-0244',
      email: 'gordon@lambda.com',
      value: '$82,000',
      doNotCall: false,
    },
    {
      id: 'lead-3',
      name: 'Eli Vance',
      company: 'Aperture Labs',
      stage: 'Closed Won',
      phone: '+1 555-0311',
      email: 'eli@aperture.com',
      value: '$30,000',
      doNotCall: false,
    },
  ]);

  // Notifications state
  const [notifications, setNotifications] = useState([
    {
      id: 'n-1',
      title: 'Target 80% Milestone! 🚀',
      body: 'You reached 80% of your daily connected calls target!',
      time: '10m ago',
      read: false,
    },
    {
      id: 'n-2',
      title: 'New Lead Assigned',
      body: 'Lead "Gordon Freeman (Lambda Dynamics)" assigned to you.',
      time: '1h ago',
      read: false,
    },
  ]);

  // Active user info
  const [user] = useState<{
    name: string;
    code: string;
    email: string;
    role: string;
  }>({
    name: 'Sarah Connor',
    code: 'EMP-0002',
    email: 'sarah.connor@company.com',
    role: 'Sales Representative',
  });

  // Timer for active shift
  useEffect(() => {
    let interval: any = null;
    if (shiftState === ShiftState.WORKING) {
      interval = setInterval(() => {
        setShiftSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [shiftState]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStartShift = () => {
    setShiftState(ShiftState.WORKING);
  };

  const handleTakeBreak = () => {
    setShowBreakModal(false);
    setShiftState(ShiftState.ON_BREAK);
  };

  const handleResumeShift = () => {
    setShiftState(ShiftState.WORKING);
  };

  const handleEndShift = () => {
    setShiftState(ShiftState.OFF_SHIFT);
  };

  const submitCallLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForCall) return;

    // Increment call targets
    setTargets((prev) => ({
      ...prev,
      callsTotal: { ...prev.callsTotal, current: prev.callsTotal.current + 1 },
      callsConnected:
        callOutcome === CallOutcome.CONNECTED
          ? { ...prev.callsConnected, current: prev.callsConnected.current + 1 }
          : prev.callsConnected,
    }));

    if (callOutcome === CallOutcome.DO_NOT_CALL) {
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLeadForCall.id ? { ...l, doNotCall: true } : l)),
      );
    }

    setSelectedLeadForCall(null);
    setCallNotes('');
  };

  const submitSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setShowCompose(false);
    setEmailTo('');
    setEmailSubject('');
    setEmailBody('');

    // Push notification
    setNotifications((prev) => [
      {
        id: `n-${Date.now()}`,
        title: 'Email Sent',
        body: `Message sent to ${emailTo} via sales@company.com`,
        time: 'Just now',
        read: false,
      },
      ...prev,
    ]);
  };

  return (
    <div className="flex h-screen flex-col bg-[#090d16] text-slate-100 font-sans">
      {/* Top Header Bar */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800/80 px-6 bg-[#0e1322] shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
            <Shield className="h-4 w-4" />
          </div>
          <span className="font-bold text-sm tracking-wide text-white">Company OS</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
            Workstation v1.0
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'overview', label: 'Workstation Pulse', icon: Target },
            { id: 'crm', label: 'CRM & Calls', icon: PhoneCall },
            { id: 'email', label: 'Mailbox', icon: Mail },
            { id: 'notifications', label: 'Alerts', icon: Bell, badge: notifications.filter((n) => !n.read).length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          {/* Shift State Badge */}
          {shiftState === ShiftState.WORKING && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              Working ({formatTime(shiftSeconds)})
            </span>
          )}

          {shiftState === ShiftState.ON_BREAK && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Coffee className="w-3.5 h-3.5" />
              On Break ({breakType})
            </span>
          )}

          {shiftState === ShiftState.OFF_SHIFT && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              Off Shift
            </span>
          )}

          {/* Network Simulator */}
          <button
            onClick={() => setIsOffline(!isOffline)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              isOffline
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
            }`}
          >
            {isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            {isOffline ? 'Offline' : 'Online'}
          </button>

          <div className="h-4 w-px bg-slate-800"></div>

          <div className="text-xs">
            <span className="font-semibold text-white">{user.name}</span>
            <span className="text-slate-400 ml-1">({user.code})</span>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6 max-w-6xl mx-auto w-full">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Interactive Shift Bar (F5) */}
            <div className="p-6 rounded-2xl bg-[#121829] border border-slate-800 shadow-xl flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-xs font-semibold tracking-wider text-indigo-400 uppercase">
                  Shift Active Duration
                </div>
                <div className="text-4xl font-extrabold text-white font-mono">
                  {formatTime(shiftSeconds)}
                </div>
                <p className="text-xs text-slate-400">
                  {shiftState === ShiftState.WORKING
                    ? 'Non-invasive activity metrics and call tracking active.'
                    : shiftState === ShiftState.ON_BREAK
                    ? `Shift paused for ${breakType}.`
                    : 'Check in to start shift operations.'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {shiftState === ShiftState.OFF_SHIFT && (
                  <button
                    onClick={handleStartShift}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white transition shadow-lg shadow-indigo-600/30 active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start Shift
                  </button>
                )}

                {shiftState === ShiftState.WORKING && (
                  <>
                    <button
                      onClick={() => setShowBreakModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-medium text-slate-200 transition border border-slate-700 active:scale-95"
                    >
                      <Pause className="w-4 h-4" /> Take Break
                    </button>
                    <button
                      onClick={handleEndShift}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 font-medium text-white transition shadow-lg shadow-rose-600/20 active:scale-95"
                    >
                      <Square className="w-4 h-4 fill-current" /> End Shift
                    </button>
                  </>
                )}

                {shiftState === ShiftState.ON_BREAK && (
                  <button
                    onClick={handleResumeShift}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white transition shadow-lg shadow-emerald-600/30 active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" /> Resume Shift
                  </button>
                )}
              </div>
            </div>

            {/* Real-time Target Gauges (F13) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Connected Calls',
                  current: targets.callsConnected.current,
                  target: targets.callsConnected.target,
                  icon: PhoneCall,
                  color: 'bg-emerald-500',
                },
                {
                  label: 'Total Calls Dialed',
                  current: targets.callsTotal.current,
                  target: targets.callsTotal.target,
                  icon: PhoneCall,
                  color: 'bg-indigo-500',
                },
                {
                  label: 'Leads Created',
                  current: targets.leadsCreated.current,
                  target: targets.leadsCreated.target,
                  icon: Users,
                  color: 'bg-amber-500',
                },
                {
                  label: 'Tasks Completed',
                  current: targets.tasksDone.current,
                  target: targets.tasksDone.target,
                  icon: CheckSquare,
                  color: 'bg-violet-500',
                },
              ].map((tgt, i) => {
                const Icon = tgt.icon;
                const pct = Math.min(100, Math.round((tgt.current / tgt.target) * 100));
                return (
                  <div key={i} className="p-5 rounded-xl bg-[#121829] border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">{tgt.label}</span>
                      <Icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {tgt.current} <span className="text-xs font-normal text-slate-400">/ {tgt.target}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tgt.color} transition-all duration-300`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right text-[11px] text-slate-400 font-medium">{pct}% Pace</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CRM TAB (F10, F11, F12) */}
        {activeTab === 'crm' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">CRM Leads & Call Actions</h2>
                <p className="text-xs text-slate-400">
                  Log phone calls with live target attribution and lead status updates (F12).
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#121829]">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Lead Contact</th>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Stage</th>
                    <th className="px-6 py-3">Deal Value</th>
                    <th className="px-6 py-3 text-right">Quick Dial & Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {leads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{l.name}</div>
                        <div className="text-slate-400">{l.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-200">{l.company}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                          {l.stage}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">{l.value}</td>
                      <td className="px-6 py-4 text-right">
                        {l.doNotCall ? (
                          <span className="text-rose-400 font-semibold px-2 py-1 bg-rose-500/10 rounded border border-rose-500/20">
                            Do Not Call
                          </span>
                        ) : (
                          <button
                            onClick={() => setSelectedLeadForCall(l)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold ml-auto"
                          >
                            <PhoneCall className="w-3.5 h-3.5" /> Log Call (F12)
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

        {/* EMAIL TAB (F14) */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">Shared Workspace Mailbox</h2>
                <p className="text-xs text-slate-400">
                  sales@company.com (Assigned: read, send, reply, attach)
                </p>
              </div>
              <button
                onClick={() => setShowCompose(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <Send className="w-3.5 h-3.5" /> Compose Email
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#121829] border border-slate-800 divide-y divide-slate-800/60">
              {[
                {
                  from: 'alex@blackmesa.com',
                  subject: 'Regarding Q4 Pricing Proposal',
                  snippet: 'Thanks Sarah, we reviewed the proposal and would like to proceed...',
                  time: '14:10',
                },
                {
                  from: 'gordon@lambda.com',
                  subject: 'Contract Demo Inquiry',
                  snippet: 'Could we schedule a walkthrough of the security attribution features?',
                  time: '11:45',
                },
              ].map((m, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-3 rounded-lg cursor-pointer">
                  <div>
                    <div className="font-semibold text-white text-xs">{m.from}</div>
                    <div className="text-xs text-slate-300 font-medium">{m.subject}</div>
                    <div className="text-xs text-slate-500 truncate">{m.snippet}</div>
                  </div>
                  <div className="text-xs text-slate-400">{m.time}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB (F15) */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Notifications & Alerts</h2>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 rounded-xl bg-[#121829] border border-slate-800 flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-white">{n.title}</div>
                    <div className="text-xs text-slate-300 mt-0.5">{n.body}</div>
                  </div>
                  <span className="text-[11px] text-slate-500">{n.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CALL LOGGING MODAL (F12) */}
        {selectedLeadForCall && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <form onSubmit={submitCallLog} className="max-w-md w-full p-6 rounded-2xl bg-[#121829] border border-slate-800 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Log Call Outcome (F12)</h3>
                <button type="button" onClick={() => setSelectedLeadForCall(null)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Contact: <span className="text-white font-semibold">{selectedLeadForCall.name}</span> ({selectedLeadForCall.phone})
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Call Outcome</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value={CallOutcome.CONNECTED}>Connected (Counts toward Target)</option>
                  <option value={CallOutcome.NO_ANSWER}>No Answer</option>
                  <option value={CallOutcome.BUSY}>Busy</option>
                  <option value={CallOutcome.VOICEMAIL}>Voicemail</option>
                  <option value={CallOutcome.WRONG_NUMBER}>Wrong Number</option>
                  <option value={CallOutcome.DO_NOT_CALL}>Do Not Call (Sets Lead DNC Flag)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Call Notes</label>
                <textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Summary of conversation..."
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white h-20"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLeadForCall(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
                >
                  Save Call Log
                </button>
              </div>
            </form>
          </div>
        )}

        {/* EMAIL COMPOSE MODAL (F14) */}
        {showCompose && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <form onSubmit={submitSendEmail} className="max-w-lg w-full p-6 rounded-2xl bg-[#121829] border border-slate-800 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Compose Mail (sales@company.com)</h3>
                <button type="button" onClick={() => setShowCompose(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <input
                type="email"
                required
                placeholder="To: client@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
              />

              <input
                type="text"
                required
                placeholder="Subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
              />

              <textarea
                required
                placeholder="Email content..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white h-32"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" /> Send via Backend Proxy
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Break Selection Modal */}
        {showBreakModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="max-w-md w-full p-6 rounded-2xl bg-[#121829] border border-slate-800 space-y-4 shadow-2xl">
              <h3 className="text-lg font-bold text-white">Select Break Reason</h3>
              <div className="grid grid-cols-2 gap-3 py-2">
                {[
                  { name: 'Lunch', icon: Utensils },
                  { name: 'Short Break', icon: Coffee },
                  { name: 'Training', icon: BookOpen },
                  { name: 'Away Meeting', icon: Users },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = breakType === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => setBreakType(item.name)}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBreakModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTakeBreak}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-lg shadow-indigo-600/30"
                >
                  Confirm Break
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
