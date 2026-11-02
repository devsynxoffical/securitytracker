'use client';

import type { ReactNode } from 'react';
import { Apple, Download, KeyRound, LifeBuoy, Monitor, ShieldCheck, Sun as SunIcon, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, Banner } from '@/components/ui';
import { PublicProviders } from '@/components/public/PublicProviders';
import { Container, PublicShell } from '@/components/public/PublicShell';
import { DownloadGrid } from '@/components/public/DownloadCards';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/install#download', label: 'Download' },
  { href: '/install#troubleshooting', label: 'Troubleshooting' },
];

const TOC: Array<{ id: string; label: string; icon: ReactNode }> = [
  { id: 'download', label: 'Download', icon: <Download size={14} /> },
  { id: 'windows', label: 'Windows', icon: <Monitor size={14} /> },
  { id: 'macos', label: 'macOS', icon: <Apple size={14} /> },
  { id: 'first-sign-in', label: 'First sign-in', icon: <KeyRound size={14} /> },
  { id: 'daily-use', label: 'Daily use', icon: <SunIcon size={14} /> },
  { id: 'privacy', label: 'What the app records', icon: <ShieldCheck size={14} /> },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: <LifeBuoy size={14} /> },
  { id: 'it-admins', label: 'For IT admins', icon: <Wrench size={14} /> },
];

export default function InstallGuidePage() {
  return (
    <PublicProviders>
      <PublicShell nav={NAV} active="/install#download">
        <header className="border-b border-line bg-surface">
          <Container className="py-10 sm:py-12">
            <div className="text-2xs font-semibold uppercase tracking-wide text-pri">Install guide</div>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">Installing WorkPulse</h1>
            <p className="mt-3 max-w-2xl text-md text-ink-2">
              Download the app for your computer, install it, sign in with the details your administrator gave you and wait for the device to be approved. Ten minutes, start to
              finish.
            </p>
          </Container>
        </header>

        <Container className="grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
          <Toc />
          <div className="min-w-0 space-y-14">
            <DownloadSection />
            <WindowsSection />
            <MacSection />
            <FirstSignIn />
            <DailyUse />
            <PrivacySection />
            <Troubleshooting />
            <ItAdmins />
          </div>
        </Container>
      </PublicShell>
    </PublicProviders>
  );
}

function Toc() {
  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1 whitespace-nowrap lg:flex-col lg:whitespace-normal">
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                <span className="text-ink-3">{t.icon}</span>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-md text-ink-2">{lead}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-4">{children}</ol>;
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="num mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pri-soft text-sm font-semibold text-pri-2">{n}</span>
      <div className="min-w-0">
        <div className="text-base font-semibold text-ink">{title}</div>
        {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
      </div>
    </li>
  );
}

function Note({ title, children, tone = 'blue' }: { title: string; children: ReactNode; tone?: 'blue' | 'amber' }) {
  return (
    <div className={clsx('mt-5 rounded-card border p-4', tone === 'amber' ? 'border-amber/40 bg-amber-soft/40' : 'border-line bg-surface')}>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="mt-1 text-sm text-ink-2">{children}</div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</code>;
}

function Path({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}

function DownloadSection() {
  return (
    <Section id="download" title="Download" lead="Pick the file for your computer. Every file lists its version, size and SHA-256 checksum so IT can verify what was downloaded.">
      <DownloadGrid />
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-ink">Windows installer (.exe)</dt>
          <dd className="mt-0.5 text-ink-2">The normal choice. Installs the app, starts it at logon and, when IT built it with the tracker agent, installs the agent service.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Windows portable (.exe)</dt>
          <dd className="mt-0.5 text-ink-2">Runs without installing. No start at logon and no tracker agent; meant for testing, not for daily use.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">macOS (.dmg, Universal)</dt>
          <dd className="mt-0.5 text-ink-2">One image for Apple silicon and Intel Macs. Drag to Applications.</dd>
        </div>
      </dl>
    </Section>
  );
}

function WindowsSection() {
  return (
    <Section id="windows" title="Windows" lead="Windows 10 or 11, 64-bit. You need to be able to approve one administrator prompt, or ask IT to install for you.">
      <Steps>
        <Step n={1} title="Run the installer">
          Double-click <Code>WorkPulse-Setup-&lt;version&gt;.exe</Code>. If Windows shows a blue SmartScreen window, see the note below.
        </Step>
        <Step n={2} title="Install for everyone on this computer">
          When asked, choose <Path>Anyone who uses this computer</Path> so the app is installed per-machine into <Code>C:\Program Files</Code>. Windows asks for administrator
          permission once (the UAC prompt). Keep the default folder unless IT told you otherwise.
        </Step>
        <Step n={3} title="Finish and let it start">
          WorkPulse opens after the installer finishes. From now on it starts automatically when you log on to Windows and waits in the system tray (bottom right, next to the
          clock). Click the tray icon to open the window.
        </Step>
      </Steps>
      <Note title="SmartScreen: 'Windows protected your PC'">
        The installer is signed when your company has a code-signing certificate, and then this window does not appear. Without a certificate Windows shows it for any new
        download. Click <Path>More info</Path>, then <Path>Run anyway</Path>. Compare the SHA-256 shown above with the file if you want to be sure it is the right one.
      </Note>
      <Note title="Tracker agent and watchdog service">
        The Windows tracker agent (a small background service that counts activity during a shift) is included in the installer when IT built the release with the agent. If
        your release does not include it, the app still runs; shifts, breaks, tasks and the inbox work as usual, but no app-level activity is counted. IT can install the agent
        separately from the <a href="#download" className="font-semibold text-ink hover:text-pri">IT card</a> above when one is published.
      </Note>
    </Section>
  );
}

function MacSection() {
  return (
    <Section id="macos" title="macOS" lead="macOS 12 or newer, Apple silicon or Intel.">
      <Steps>
        <Step n={1} title="Open the disk image">
          Double-click <Code>WorkPulse-Mac-&lt;version&gt;.dmg</Code>. A window with the WorkPulse icon and an Applications shortcut opens.
        </Step>
        <Step n={2} title="Drag WorkPulse to Applications">
          Drag the icon onto <Path>Applications</Path>, then eject the disk image. Do not run the app from inside the image.
        </Step>
        <Step n={3} title="First launch">
          The build is not notarised unless your company has an Apple Developer ID, so macOS blocks a plain double-click the first time. Either right-click (Control-click) the
          app in Applications and choose <Path>Open</Path>, or, on macOS 15 and newer, open it once, then go to <Path>System Settings → Privacy &amp; Security</Path> and click{' '}
          <Path>Open Anyway</Path>. This is needed once per installation.
        </Step>
        <Step n={4} title="Permissions">
          <Path>Accessibility</Path> is not required: the app only reads system idle time and the name of the frontmost application through system APIs. macOS may ask once
          whether WorkPulse may control <Path>System Events</Path> (an Automation prompt); allow it so the app can read the active application name. Screen Recording, camera and
          microphone are never requested.
        </Step>
        <Step n={5} title="Find it in the menu bar">
          WorkPulse lives in the menu bar at the top right and starts automatically when you log in. Click the icon to open the window.
        </Step>
      </Steps>
    </Section>
  );
}

function FirstSignIn() {
  return (
    <Section id="first-sign-in" title="First sign-in" lead="You need the server address and the employee code or company email your administrator gave you. The first sign-in needs an internet connection.">
      <Steps>
        <Step n={1} title="Check the server address">
          The login screen shows the server address under <Path>Connection settings</Path>. In most builds IT has already filled it in. If it is empty or wrong, enter the address
          from your administrator, for example <Code>https://api.yourcompany.com/api/v1</Code>. It must start with <Code>https://</Code>.
        </Step>
        <Step n={2} title="Sign in">
          Enter your employee code (for example <Code>EMP-0021</Code>) or your company email, and your password, then click <Path>Sign in</Path>.
        </Step>
        <Step n={3} title="The device is registered and waits for approval">
          The first sign-in from a computer registers that computer. The app shows <Path>Device awaiting approval</Path> with the device name. Your administrator approves it in the
          admin panel under <Path>Security → Devices</Path>. The app checks again every 30 seconds, or click <Path>Check now</Path>.
        </Step>
        <Step n={4} title="Confirm the monitoring policy">
          Before your first shift on a device the app shows your company&apos;s monitoring policy. Read it and confirm. You can read it again at any time in the app.
        </Step>
      </Steps>
    </Section>
  );
}

function DailyUse() {
  return (
    <Section id="daily-use" title="Daily use">
      <ul className="grid gap-4 sm:grid-cols-2">
        <Tile title="Start shift">Click Start shift when you begin working. Your hours count from this moment.</Tile>
        <Tile title="Breaks">Click Take a break and Back to work. Break time is recorded separately and is not counted as idle.</Tile>
        <Tile title="End shift">Click End shift when you finish. If you forget, your manager can correct the shift in the admin panel.</Tile>
        <Tile title="Closing the window">
          Closing the window while a shift is open hides the app in the tray or menu bar and keeps the shift running. Choosing Quit asks whether to end the shift or keep
          running in the tray.
        </Tile>
        <Tile title="Offline">
          If the connection drops, the shift keeps running. Shift, break and tracking entries are stored on the computer and sent when the server is reachable again. You do not
          need to do anything.
        </Tile>
        <Tile title="Tasks, leave, inbox">Tasks, leave balance and requests, shared inboxes and notifications are in the side navigation of the app. Notifications refresh every 30 seconds.</Tile>
      </ul>
    </Section>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="text-base font-semibold text-ink">{title}</div>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </li>
  );
}

function PrivacySection() {
  return (
    <Section id="privacy" title="What the app records" lead="Tracking runs only while a shift is open and only counts. The same policy is shown in the app and in the admin panel.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <Badge tone="green" dot>
            Recorded during a shift
          </Badge>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li>Shift start, end and breaks</li>
            <li>Active, idle and locked time</li>
            <li>Name of the active application and, in the browser, the website domain</li>
            <li>How many keys and clicks happened (counts only)</li>
            <li>Whether a call or meeting app, or the microphone, is in use (yes or no)</li>
            <li>Window titles only if your company&apos;s policy switches this on</li>
          </ul>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <Badge tone="red" dot>
            Never recorded
          </Badge>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li>Which keys you pressed, or anything you typed</li>
            <li>Clipboard content</li>
            <li>Screenshots or screen recording</li>
            <li>Camera or microphone audio</li>
            <li>Anything outside a shift, or during a break</li>
            <li>Private browsing content beyond the domain name</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Troubleshooting() {
  const items: Array<{ q: string; a: ReactNode }> = [
    {
      q: 'Cannot reach the server',
      a: (
        <>
          Open <Path>Connection settings</Path> on the login screen and check the address: it must start with <Code>https://</Code> and end with <Code>/api/v1</Code>. If you are at
          home or travelling, connect to the company VPN first. Ask IT whether a firewall or proxy blocks the address. The first sign-in always needs internet; afterwards the
          app works offline and syncs later.
        </>
      ),
    },
    {
      q: 'Device awaiting approval',
      a: (
        <>
          Normal after the first sign-in on a computer. Your administrator approves the device under <Path>Security → Devices</Path>. The app rechecks every 30 seconds. If it
          takes long, tell your administrator the device name shown on the screen.
        </>
      ),
    },
    {
      q: 'Device revoked',
      a: <>An administrator removed this computer&apos;s access. Contact your administrator; they can approve it again or register a new device.</>,
    },
    {
      q: 'Too many attempts',
      a: <>After repeated wrong passwords the account is locked for 15 minutes. Wait, then try again. If you forgot your password, your administrator can reset it.</>,
    },
    {
      q: 'Reinstalling or updating',
      a: (
        <>
          Install the new version over the old one. Your sign-in, device identity and any queued offline entries live in your per-user data folder (<Code>%APPDATA%\WorkPulse
          Workstation</Code> on Windows, <Code>~/Library/Application Support/WorkPulse</Code> on macOS) and are kept, so the device does not need to be approved again.
        </>
      ),
    },
    {
      q: 'Which version do I have?',
      a: (
        <>
          On Windows open <Path>Settings → Apps → Installed apps</Path> and look for WorkPulse. On macOS select the app in Applications and press Cmd-I (Get Info). The
          installer file name also contains the version. Compare with the current release at the top of this page.
        </>
      ),
    },
  ];
  return (
    <Section id="troubleshooting" title="Troubleshooting">
      <div className="divide-y divide-line-2 rounded-card border border-line bg-surface shadow-card">
        {items.map((it) => (
          <div key={it.q} className="p-4">
            <div className="text-base font-semibold text-ink">{it.q}</div>
            <p className="mt-1 text-sm text-ink-2">{it.a}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ItAdmins() {
  return (
    <Section id="it-admins" title="For IT admins" lead="Deploying to many Windows machines, and what to know about updates and logs.">
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-ink">Silent install (Windows)</h3>
          <p className="mt-1 text-sm text-ink-2">The installer is a standard NSIS package. For an unattended per-machine install run it from an elevated prompt:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] text-ink">
            {'WorkPulse-Setup-<version>.exe /S /allusers\n' + 'WorkPulse-Setup-<version>.exe /S /allusers /D=C:\\Program Files\\WorkPulse'}
          </pre>
          <p className="mt-2 text-sm text-ink-2">
            <Code>/S</Code> runs silently, <Code>/allusers</Code> forces a per-machine install, <Code>/D=</Code> sets the folder and must be the last argument. The app registers
            itself to start at logon for each user with <Code>--hidden</Code>, so it waits in the tray.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">Tracker agent</h3>
          <p className="mt-1 text-sm text-ink-2">
            When the release was built with the agent, the installer also places <Code>CompanyOS.Agent.exe</Code>, <Code>CompanyOS.NativeHost.exe</Code> and{' '}
            <Code>CompanyOS.Watchdog.exe</Code> under <Code>C:\Program Files\WorkPulse\resources\agent\</Code>, registers the <Path>Company OS Watchdog</Path> service (LocalSystem, automatic
            start) and the browser native-messaging host. The agent has no network code; it talks to the app over a local named pipe and the app sends the counts to the server.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">Updates</h3>
          <p className="mt-1 text-sm text-ink-2">
            New versions appear on this page when you publish a new <Code>latest.json</Code> manifest next to the installers in the updates folder served under{' '}
            <Code>/downloads</Code>. Users install the new version over the old one. In-app auto-update channels are planned; today the Windows watchdog can apply a staged update
            placed under <Code>C:\ProgramData\CompanyOS\updates\pending\</Code>, and there is no automatic download.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">Where things live</h3>
          <ul className="mt-1 space-y-1 text-sm text-ink-2">
            <li>
              App data (sign-in, device identity, offline queue): <Code>%APPDATA%\WorkPulse</Code> (Windows), <Code>~/Library/Application Support/WorkPulse</Code> (macOS)
            </li>
            <li>
              Agent queue, status and logs (per user): <Code>%LOCALAPPDATA%\CompanyOS\agent\</Code>, logs in <Code>logs\</Code>
            </li>
            <li>
              Watchdog service: Windows Event Log, <Path>Application</Path> source <Path>Company OS Watchdog</Path>
            </li>
            <li>
              Staged updates: <Code>C:\ProgramData\CompanyOS\updates\</Code> (<Code>pending\</Code>, <Code>previous\</Code>, <Code>failed\</Code>)
            </li>
          </ul>
        </div>
        <div className="mt-2">
          <Banner tone="blue">Logs never contain tokens, passwords, key values or mail content. Counts and status only.</Banner>
        </div>
      </div>
    </Section>
  );
}
