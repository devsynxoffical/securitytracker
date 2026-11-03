'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3, BookOpen, Briefcase, CheckSquare, Clock, Home, KeyRound, LayoutDashboard, Mail, MessageSquare, Monitor, Search, Settings, Shield, Timer, Users,
} from 'lucide-react';
import { PublicProviders } from '@/components/public/PublicProviders';
import { Container, PublicShell } from '@/components/public/PublicShell';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/install', label: 'Install guide' },
  { href: '/guide', label: 'User guide' },
];

/** One function of the product: where it lives and how to use it. */
type Topic = { title: string; where?: string; who?: string; body: ReactNode };
type Chapter = { id: string; title: string; icon: ReactNode; lead: string; audience: 'Employees' | 'Admins and managers' | 'Everyone'; topics: Topic[] };

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-ink">{children}</span>;
const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-1.5 list-disc space-y-1 pl-5">
    {items.map((x, i) => <li key={i}>{x}</li>)}
  </ul>
);

const CHAPTERS: Chapter[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: <KeyRound size={15} />,
    audience: 'Everyone',
    lead: 'How the system is put together and how to sign in to each part.',
    topics: [
      {
        title: 'Two parts: admin panel and desktop app',
        body: (
          <>
            The <B>admin panel</B> runs in the browser at <B>/admin</B> on this site and is used by admins and managers. The <B>WorkPulse desktop app</B> (Mac and Windows) is used by
            every employee to run shifts, work tasks, chat and request leave. Download it from the <a className="text-pri hover:underline" href="/install">install guide</a>.
          </>
        ),
      },
      {
        title: 'Sign in to the admin panel',
        where: '/admin',
        body: (
          <List items={[
            <>Enter your email and password and click <B>Continue</B>. If your company switched on two-factor sign-in, enter the 6-digit code from your authenticator app.</>,
            <><B>Forgot password?</B> sends a reset link that works once and expires after 30 minutes. A new password needs at least 10 characters and signs you out everywhere.</>,
            <>After several wrong passwords the account locks for 15 minutes.</>,
          ]} />
        ),
      },
      {
        title: 'Sign in to the desktop app',
        body: (
          <List items={[
            <>First run: enter the <B>server address</B> your admin gave you (this site's address) and click <B>Connect</B>.</>,
            <>Sign in with your <B>employee code or company email</B> and password.</>,
            <>If you see <B>Device awaiting approval</B>, an admin approves the computer under Security → Devices. Click <B>Check now</B> or wait; the app checks every 30 seconds.</>,
            <>Read the <B>Monitoring policy</B>, tick “I have read and accept” and click <B>Continue</B>.</>,
          ]} />
        ),
      },
      {
        title: 'Finding your way in the admin panel',
        body: (
          <List items={[
            <>The left menu has groups: CRM, Tasks, People, Tracking, Mail, Chat, Reports &amp; targets, Security and Settings. You only see what your role allows.</>,
            <>Press <B>⌘K</B> (Mac) or <B>Ctrl+K</B> (Windows) to search leads, contacts, accounts and deals, jump to any screen, or create a lead, contact, deal or task.</>,
            <>Top bar: theme (light/dark), Chat with unread count, and the <B>Notifications</B> bell with “Mark all read”.</>,
          ]} />
        ),
      },
    ],
  },
  {
    id: 'desktop',
    title: 'Desktop app (employees)',
    icon: <Monitor size={15} />,
    audience: 'Employees',
    lead: 'Everything an employee does during the day. The sidebar has Dashboard, My tasks, CRM, Mail, Chat, Leave and My activity.',
    topics: [
      {
        title: 'Start, pause and end a shift',
        where: 'Sidebar, shift controls',
        body: (
          <List items={[
            <><B>Start shift</B> when you begin. Your hours count from that moment. Outside your scheduled hours the app asks first; click <B>Start anyway</B> to continue.</>,
            <><B>Break</B> and pick a type: Lunch, Short break, Prayer, Personal or Other. Click <B>Resume</B> to go back to work. Break time over the allowance is shown to your manager.</>,
            <><B>End</B> → <B>End shift</B> when you finish, or <B>Keep working</B> to cancel.</>,
            <>When your scheduled shift has ended the app asks: <B>Keep working</B> (asks again in 30 minutes, up to 3 times) or <B>End shift now</B>.</>,
            <>After a long time without input it asks <B>You were away</B>: choose <B>Record as break</B> or <B>Working away from PC</B>.</>,
          ]} />
        ),
      },
      {
        title: 'Dashboard',
        body: (
          <>
            Shows your shift state, time worked, active and break time, tasks due today, open tasks, unread messages, leave balance and hours this week. Cards list today's tasks,
            recent notifications, your targets, who is out today, announcements (<B>Mark as read</B>) and celebrations.
          </>
        ),
      },
      { title: 'My tasks', body: <>Tasks grouped as Overdue, Today, Upcoming, No date and Done. Open a task to change its status and read comments.</> },
      {
        title: 'CRM on the desktop',
        body: (
          <List items={[
            <><B>Search my leads…</B> or <B>New lead</B>. The app warns about duplicates; click <B>Create anyway</B> if it is a different person.</>,
            <>In a lead: <B>Log call</B> (direction, outcome, duration, notes, next follow-up, move to stage), <B>Note</B>, <B>Appointment</B> → <B>Schedule</B>, and the stage dropdown.</>,
            <>Leads marked “Do not call” cannot be called from the app.</>,
          ]} />
        ),
      },
      {
        title: 'Mail on the desktop',
        body: <>Choose a shared mailbox and a view (Mine, Unassigned, All open). <B>Take</B> a conversation, <B>Send reply</B>, <B>Close</B> it, or <B>Compose</B> a new email if you are allowed to send.</>,
      },
      {
        title: 'Chat on the desktop',
        body: <>Find a channel or person, send messages with <B>@mentions</B>, start a <B>New message</B> to a colleague. You can edit your own message for 15 minutes and delete your own messages. Group channels are created in the admin panel.</>,
      },
      {
        title: 'Leave',
        body: <>See your balance per leave type. <B>Request leave</B>: type, from, to, half day if allowed, and a reason. Your manager is notified. <B>My requests</B> shows the status, and you can <B>Cancel</B> a pending request.</>,
      },
      {
        title: 'My activity',
        body: <>Today or the last 7 days: tracked, active, idle and productive time, time by category and the applications you used. Only app names, website domains and activity counts are recorded.</>,
      },
      {
        title: 'Working offline',
        body: <>Tracking keeps running without internet and uploads when the connection is back. Tasks are read-only and chat sending pauses until you are online again.</>,
      },
    ],
  },
  {
    id: 'overview',
    title: 'Overview',
    icon: <Home size={15} />,
    audience: 'Admins and managers',
    lead: 'The first screen of the admin panel. Every card opens the page behind it.',
    topics: [
      { title: 'Top cards', body: <>Working now, Open pipeline, Won this month, Activities today, Devices pending and Open alerts. Click a card to open the live board, deals, activities, devices or alerts.</> },
      { title: 'Needs attention', body: <>Counts of what is waiting for you: attendance corrections, leave requests, manual time, devices awaiting approval and open security alerts. Click a row to handle them.</> },
      { title: 'Today and the side cards', body: <>Follow-ups due today, who is out, announcements, latest alerts, celebrations for the next 14 days and the top closers this month.</> },
    ],
  },
  {
    id: 'people',
    title: 'People',
    icon: <Users size={15} />,
    audience: 'Admins and managers',
    lead: 'Employees, attendance, leave, schedules and onboarding.',
    topics: [
      {
        title: 'Add and manage employees',
        where: 'People → Directory',
        body: (
          <List items={[
            <><B>New employee</B>: name, email, department, team and role. Leave the password empty to generate a temporary one, then hand over the code and password.</>,
            <>Filter by status (Active, Invited, Suspended, Disabled), department, team and role.</>,
            <>Open a person for their attendance, leave, documents, checklists and activity. Buttons: <B>Edit</B>, <B>Reset password</B>, <B>Assign schedule</B>, start onboarding or offboarding.</>,
            <><B>Suspend access</B> (reason required) signs the person out of every device at once; <B>Restore access</B> undoes it. <B>Disable</B> is for leavers; reassign their leads and tasks first.</>,
          ]} />
        ),
      },
      { title: 'Departments, teams and org chart', where: 'People → Departments & teams, Org chart', body: <><B>New department</B> with a manager and <B>New team</B> with a team leader. The org chart shows reporting lines and departments; use search and “Expand all”.</> },
      {
        title: 'Schedules and holidays',
        where: 'People → Schedules & holidays',
        body: <>Create <B>shift schedules</B>: workdays, start and end time, grace minutes and whether the shift crosses midnight. Assign a schedule to each person from the Directory. Under <B>Holidays</B>, add days one by one or <B>Import</B> one per line as <code>YYYY-MM-DD, Name</code>. Lateness, reminders and automatic shift closing follow the schedule.</>,
      },
      { title: 'Live attendance', where: 'People → Live attendance', body: <>Who is working, on break, idle, offline or not started right now, refreshed every 15 seconds. Click a number to filter; the last-seen time of offline people is shown in your time zone.</> },
      { title: 'Attendance sheet', where: 'People → Attendance sheet', body: <>A month grid per employee and day with attendance rate, late days, absences and hours. Filter by department and team.</> },
      { title: 'Corrections', where: 'People → Corrections', body: <>Pending, approved and rejected attendance corrections. <B>Approve</B> or <B>Reject</B> with an optional comment. An approved correction is added as an adjustment; recorded data is never overwritten.</> },
      {
        title: 'Leave',
        where: 'People → Leave',
        body: (
          <List items={[
            <><B>Requests</B>: approve or reject. <B>Calendar</B>: who is off when. <B>Balances</B>: click a cell to adjust a balance (reason required).</>,
            <><B>Leave types</B>: yearly allowance, upfront or monthly accrual, carry-over, paid, requires approval, half day allowed.</>,
          ]} />
        ),
      },
      { title: 'Onboarding and offboarding', where: 'People → Onboarding', body: <>Build <B>templates</B> of items with an owner role and a day offset. <B>Start checklist</B> for a person; each owner ticks their items as <B>Done</B> under “My items”.</> },
      { title: 'Announcements', where: 'People → Announcements', body: <>Write a title and message, choose the audience (company, department, team or role), schedule it with “Publish at” and optionally <B>Pin to the top</B>. Employees see it on their dashboard.</> },
    ],
  },
  {
    id: 'tracking',
    title: 'Tracking',
    icon: <Timer size={15} />,
    audience: 'Admins and managers',
    lead: 'Work time and activity recorded by the desktop app during shifts.',
    topics: [
      { title: 'Team activity', where: 'Tracking → Team activity', body: <>Today's tracked time, average activity, who is working and who is below the threshold, per department or team. <B>Open timeline</B> on a person for detail.</> },
      { title: 'Timeline', where: 'Tracking → Timeline', body: <>Pick a person and a day: shifts, active, idle and locked time, key presses and clicks (counts only), applications, websites and time quality.</> },
      {
        title: 'Timesheets and manual time',
        where: 'Tracking → Timesheets',
        body: <>View hours per employee or team and export them. <B>Add time</B> records work done away from the computer (date, from, to and a reason); it goes for approval. Under <B>Approvals</B>, <B>Approve</B> or <B>Reject</B> with a comment.</>,
      },
      { title: 'Apps & URLs', where: 'Tracking → Apps & URLs', body: <>Time per application or website with its category. Expand a row to see who used it.</> },
      {
        title: 'Categorise apps and websites',
        where: 'Tracking → Uncategorised, Rules',
        body: (
          <List items={[
            <><B>Uncategorised</B>: pick productive, neutral or unproductive for each new app or site and <B>Save rule</B>, for the whole company or one department.</>,
            <><B>Rules</B>: edit those rules. <B>Exclusions</B> hide private domains from reports (the time still counts). <B>Exception apps</B> are call or meeting apps that count as active without typing.</>,
          ]} />
        ),
      },
      { title: 'Idle & tamper', where: 'Tracking → Idle & tamper', body: <>Long idle periods (10 minutes to 1 hour filter) and tamper events such as the tracker being stopped.</> },
      { title: 'Tracking settings', where: 'Tracking → Settings', body: <>Idle threshold, long-idle prompt, maximum shift length, window titles (off by default) and the activity levels that trigger a warning or alert.</> },
    ],
  },
  {
    id: 'crm',
    title: 'CRM',
    icon: <Briefcase size={15} />,
    audience: 'Everyone',
    lead: 'Leads, contacts, accounts and deals, from first call to won deal.',
    topics: [
      { title: 'Dashboard', where: 'CRM → Dashboard', body: <>Pipeline value, weighted forecast, win rate and other figures, pipeline by stage, deal mix, the leaderboard and recent activity.</> },
      {
        title: 'Leads',
        where: 'CRM → Leads',
        body: (
          <List items={[
            <><B>New lead</B>: name, company, stage, owner, source, value, priority, follow-up, phones and emails. Switch between <B>List</B> and <B>Board</B>.</>,
            <>Filter by status, stage and priority, and <B>Save view</B> for later. Select rows to <B>Assign</B> them in bulk.</>,
            <>Open a lead to edit fields, change stage, assign an owner and log activity.</>,
            <><B>Convert…</B> turns a lead into a contact, an account (new or existing) and optionally a deal. A converted lead becomes read-only.</>,
          ]} />
        ),
      },
      { title: 'Contacts and accounts', where: 'CRM → Contacts, Accounts', body: <>Create, search and filter by lifecycle. Select rows to assign, tag or delete. A contact can be marked “Do not call” or “Do not email”. Records show activities, emails, related contacts and deals, and notes.</> },
      {
        title: 'Deals',
        where: 'CRM → Deals',
        body: <><B>New deal</B> with pipeline, stage, amount, probability, close date, account and contacts. Click the stage bar in a deal to move it to the next stage. <B>Mark won</B>, or move it to lost and choose a lost reason.</>,
      },
      { title: 'Logging activity', body: <>In any record, log a <B>note</B>, <B>call</B> (with duration), <B>meeting</B> or <B>task</B>. Planned items show in <B>CRM → Activities</B> under Today, Overdue and Upcoming; click <B>Mark done</B> when finished.</> },
      { title: 'Import', where: 'CRM → Import', body: <>Five steps: upload a file, map columns, set options (duplicates, owner or round robin, tags, source and stage), review, then <B>Start import</B>. The result shows created, updated, skipped and failed rows.</> },
      { title: 'CRM settings', where: 'CRM → Settings', body: <>Pipelines and stages (order, probability, default pipeline), custom fields, tags, lead sources and lost reasons.</> },
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks',
    icon: <CheckSquare size={15} />,
    audience: 'Everyone',
    lead: 'Projects as spaces and lists, with boards, calendar and workload.',
    topics: [
      { title: 'My Tasks', where: 'Tasks → My Tasks', body: <>Your tasks by Overdue, Today, Upcoming, No date and Done, with counts at the top.</> },
      {
        title: 'Spaces and lists',
        where: 'Tasks → Spaces',
        body: (
          <List items={[
            <>Pick a space and list on the left. View as <B>List</B>, <B>Board</B> or <B>Table</B>; filter by assignee, status, priority, tag and due date.</>,
            <><B>New task</B> or quick-add inside a column. Select several to change status, assignee, priority or tag at once.</>,
            <>Open a task to edit title, description, dates, estimate, assignees and tags; add subtasks and checklists; comment with @mentions; and <B>Log time</B>.</>,
          ]} />
        ),
      },
      { title: 'Calendar', where: 'Tasks → Calendar', body: <>Tasks by due date in a month view. Drag a task to another day to reschedule it.</> },
      { title: 'Workload', where: 'Tasks → Workload', body: <>Open tasks and estimated hours per person, to spot who is overloaded.</> },
      { title: 'Task settings', where: 'Tasks → Settings', body: <><B>New space</B> with colour, members and private option; statuses per list; archive spaces and lists.</> },
    ],
  },
  {
    id: 'mail',
    title: 'Shared mail',
    icon: <Mail size={15} />,
    audience: 'Everyone',
    lead: 'Team inboxes handled together, with assignment and history.',
    topics: [
      {
        title: 'Connect a mailbox',
        where: 'Mail → Mailboxes',
        body: <><B>Connect mailbox</B> with Google Workspace or IMAP/SMTP (presets for Hostinger, Microsoft 365, Zoho and Gmail). <B>Test connection</B>, then <B>Save mailbox</B>. Under <B>Assignments</B>, choose who may read, reply, send, download and more.</>,
      },
      {
        title: 'Work the inbox',
        where: 'Mail → Inbox',
        body: (
          <List items={[
            <>Views: Unassigned, Mine, All open, Snoozed, Closed. <B>Take</B> a conversation or assign it to someone.</>,
            <>Reply with Cc/Bcc and templates, add an internal <B>Note</B> with @mention, add labels, <B>Snooze…</B>, <B>Close</B> or <B>Reopen</B>.</>,
            <><B>Link to CRM record…</B> to attach the thread to a lead, contact or deal. A banner warns when a colleague has the same conversation open.</>,
          ]} />
        ),
      },
      { title: 'Templates, labels and logs', where: 'Mail → Templates, Labels, Logs', body: <>Reusable replies with placeholders such as the contact's first name; coloured labels; and a log of who did what in each mailbox.</> },
    ],
  },
  {
    id: 'chat',
    title: 'Chat',
    icon: <MessageSquare size={15} />,
    audience: 'Everyone',
    lead: 'Company, department and team channels are created automatically.',
    topics: [
      {
        title: 'Channels and direct messages',
        where: 'Chat',
        body: (
          <List items={[
            <><B>New direct message</B> to any colleague, or <B>New group</B> with a name and members.</>,
            <>Type <B>@</B> to mention someone, <B>/task</B> or <B>/lead</B> to link a record. Enter sends, Shift+Enter adds a line.</>,
            <>Edit your own message within 15 minutes; delete your own messages. The channel menu has Members, Rename, Archive and Leave.</>,
            <><B>Mentions</B> shows messages that name you. Search finds messages in your channels.</>,
          ]} />
        ),
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & targets',
    icon: <BarChart3 size={15} />,
    audience: 'Admins and managers',
    lead: 'Numbers over a period and goals per person or team.',
    topics: [
      { title: 'Reports', where: 'Reports & targets → Reports', body: <>Attendance, productivity, CRM and calls. Choose a period (today, last 7 or 30 days, this month or a custom range) and filter by employee, department or team. Each report has a chart and a table.</> },
      { title: 'Targets', where: 'Reports & targets → Targets', body: <><B>New target</B> for an employee, team or role: a metric (for example calls made, leads qualified, revenue won, active hours), daily, weekly or monthly, a value and the active weekdays. <B>Employee progress</B> shows how each person is doing; employees see theirs on the desktop dashboard.</> },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    icon: <Shield size={15} />,
    audience: 'Admins and managers',
    lead: 'Who can do what, which computers may connect, and a record of every change.',
    topics: [
      { title: 'Roles & permissions', where: 'Security → Roles & permissions', body: <>A grid of permissions per role, each with a scope: own, team, department or all. Change and click <B>Save changes</B>. Super Admin cannot be edited, and nobody can change their own role.</> },
      { title: 'Devices', where: 'Security → Devices', body: <><B>Approve</B> or <B>Reject</B> new computers. <B>Revoke device</B> signs it out and clears its local data.</> },
      { title: 'Sessions and login history', where: 'Security → Sessions, Login history', body: <>See who is signed in where and <B>Revoke session</B> or revoke all for a person. Login history lists every attempt and its result.</> },
      { title: 'Audit log and alerts', where: 'Security → Audit log, Alerts', body: <>Every change with who made it and when. Alerts flag unusual events; <B>Acknowledge</B> them once handled.</> },
    ],
  },
  {
    id: 'settings',
    title: 'Company settings',
    icon: <Settings size={15} />,
    audience: 'Admins and managers',
    lead: 'Rules that apply to the whole company.',
    topics: [
      {
        title: 'Settings → Company',
        where: 'Settings',
        body: (
          <List items={[
            <><B>Company</B>: name, time zone and first day of the week.</>,
            <><B>Shifts and tracking</B>: idle time, break allowance, maximum shift length, window titles.</>,
            <><B>Shift policy</B>: start shift on login, end on shutdown, minimum shift, and the start, break, idle and end reminders.</>,
            <><B>Devices</B>: manual approval, auto-approve the first device, or no approval; how many devices per employee.</>,
            <><B>Admin Panel access</B>: limit the admin panel to office IP addresses.</>,
            <><B>Data containment</B>: export is off by default, which hides every Export button. Switch to “Super Admin only” or “By permission” to allow exports.</>,
          ]} />
        ),
      },
    ],
  },
];

const AUDIENCE_TONE: Record<Chapter['audience'], string> = {
  Employees: 'bg-blue-soft text-blue-text',
  'Admins and managers': 'bg-amber-soft text-amber-text',
  Everyone: 'bg-pri-soft text-pri-2',
};

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props: { children?: ReactNode; items?: ReactNode[] } }).props;
    return text(props.children) + ' ' + text(props.items);
  }
  return '';
}

export default function UserGuidePage() {
  const [q, setQ] = useState('');
  const chapters = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CHAPTERS;
    return CHAPTERS.map((c) => ({
      ...c,
      topics: c.title.toLowerCase().includes(needle) ? c.topics : c.topics.filter((t) => `${t.title} ${t.where ?? ''} ${text(t.body)}`.toLowerCase().includes(needle)),
    })).filter((c) => c.topics.length > 0);
  }, [q]);

  return (
    <PublicProviders>
      <PublicShell nav={NAV} active="/guide">
        <header className="border-b border-line bg-surface">
          <Container className="py-10 sm:py-12">
            <div className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-pri"><BookOpen size={12} /> User guide</div>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">How to use Company OS and WorkPulse</h1>
            <p className="mt-3 max-w-2xl text-md text-ink-2">
              Every function of the admin panel and the desktop app, where to find it and how it works. Menu paths are written as <span className="font-semibold text-ink">Group → Page</span>.
              Some items only appear for roles that are allowed to use them.
            </p>
            <label className="mt-6 flex max-w-md items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 focus-within:border-pri">
              <Search size={15} className="text-ink-3" />
              <input id="guide-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide, e.g. leave, export, device" className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3" />
            </label>
          </Container>
        </header>

        <Container className="grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <nav aria-label="Chapters" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <ul className="flex gap-1 whitespace-nowrap lg:flex-col lg:whitespace-normal">
                {CHAPTERS.map((c) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                      <span className="text-ink-3">{c.icon}</span>
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 space-y-14">
            {chapters.length === 0 && (
              <div className="rounded-card border border-line bg-surface p-6 text-sm text-ink-2">
                Nothing matches “{q}”. Try a shorter word, or <button type="button" className="font-semibold text-pri hover:underline" onClick={() => setQ('')}>clear the search</button>.
              </div>
            )}
            {chapters.map((c) => (
              <section key={c.id} id={c.id} className="scroll-mt-20">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pri-soft text-pri">{c.icon}</span>
                  <h2 className="text-2xl font-semibold tracking-tight text-ink">{c.title}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${AUDIENCE_TONE[c.audience]}`}>{c.audience}</span>
                </div>
                <p className="mt-2 max-w-2xl text-md text-ink-2">{c.lead}</p>
                <div className="mt-5 grid gap-3">
                  {c.topics.map((t) => (
                    <article key={t.title} className="rounded-card border border-line bg-surface p-4 shadow-card">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h3 className="text-base font-semibold text-ink">{t.title}</h3>
                        {t.where && <span className="font-mono text-xs text-ink-3">{t.where}</span>}
                      </div>
                      <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-2">{t.body}</div>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-card border border-line bg-surface p-5">
              <div className="flex items-center gap-2 text-base font-semibold text-ink"><LayoutDashboard size={15} className="text-pri" /> Still stuck?</div>
              <p className="mt-1.5 text-sm text-ink-2">
                Installation problems are covered in the <a className="font-semibold text-pri hover:underline" href="/install#troubleshooting">install guide</a>. For access, passwords or
                approvals, contact your administrator. <Clock size={12} className="mb-0.5 inline text-ink-3" /> Admins can reset passwords under People → Directory.
              </p>
            </section>
          </div>
        </Container>
      </PublicShell>
    </PublicProviders>
  );
}
