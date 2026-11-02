/**
 * Company OS Domain Reporter - Manifest V3 service worker (docs/09 section 5).
 *
 * Reports ONLY the registrable domain of the active tab ({domain, browser, ts}) to the native messaging
 * host com.companyos.agent. Never the path, query, title or page content. Internal pages map to
 * "browser-internal". No content scripts, no history permission.
 *
 * Registrable domain: a bundled subset of the Public Suffix List covers the multi-label suffixes that are
 * common in business use (co.uk, com.au, ...). For every other host the conservative eTLD+1 heuristic
 * "last two labels" is applied. The subset is deliberately small (privacy: fewer labels, never more).
 */

const NATIVE_HOST_NAME = 'com.companyos.agent';
const HEARTBEAT_SECONDS = 30; // the agent treats 60 s of silence as "extension missing"

// Multi-label public suffixes (subset of https://publicsuffix.org). Extend as needed.
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'com.pk', 'net.pk', 'org.pk', 'edu.pk', 'gov.pk',
  'co.za', 'org.za', 'net.za',
  'com.br', 'net.br', 'org.br',
  'com.mx', 'org.mx',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.sg', 'com.my', 'com.hk', 'com.tw', 'com.cn', 'com.tr', 'com.ar', 'com.co', 'com.pe', 'com.ph', 'com.vn', 'com.eg', 'com.sa', 'com.ae', 'com.ng', 'com.ua',
  'co.il', 'co.kr', 'co.th', 'co.id', 'co.ke',
  // hosting platforms that act as suffixes (each tenant is a separate site)
  'github.io', 'gitlab.io', 'herokuapp.com', 'azurewebsites.net', 'cloudfront.net', 'web.app', 'firebaseapp.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev',
]);

const browser = detectBrowser();
let port = null;
let reconnectDelayMs = 1000;
let lastSent = { domain: null, at: 0 };

function detectBrowser() {
  const ua = navigator.userAgent || '';
  return /\bEdg\//.test(ua) ? 'edge' : 'chrome';
}

/** Hostname -> registrable domain. Pure, exported for tests via globalThis. */
export function registrableDomain(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return 'unknown';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host; // IPv4 or IPv6 literal
  if (host === 'localhost' || !host.includes('.')) return host;
  const labels = host.split('.');
  if (labels.length >= 3) {
    const lastTwo = labels.slice(-2).join('.');
    if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

/** URL -> domain value for the agent. */
export function domainForUrl(url) {
  if (!url) return 'unknown';
  let parsed;
  try { parsed = new URL(url); } catch { return 'unknown'; }
  switch (parsed.protocol) {
    case 'chrome:': case 'edge:': case 'about:': case 'chrome-extension:': case 'extension:': case 'devtools:':
    case 'file:': case 'view-source:': case 'chrome-untrusted:': case 'edge-untrusted:':
      return 'browser-internal';
    case 'http:': case 'https:': case 'ws:': case 'wss:': case 'ftp:':
      return registrableDomain(parsed.hostname);
    default:
      return 'unknown';
  }
}

globalThis.__companyos = { registrableDomain, domainForUrl };

function connect() {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port.onMessage.addListener(() => { /* acks only; nothing to do */ });
    port.onDisconnect.addListener(() => {
      port = null;
      const err = chrome.runtime.lastError?.message;
      if (err) console.warn('[CompanyOS] native host disconnected:', err);
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    });
    reconnectDelayMs = 1000;
  } catch (e) {
    port = null;
    console.warn('[CompanyOS] connectNative failed', e);
    setTimeout(connect, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
  }
}

function send(domain, force = false) {
  const now = Date.now();
  if (!force && domain === lastSent.domain && now - lastSent.at < HEARTBEAT_SECONDS * 1000) return;
  connect();
  if (!port) return;
  try {
    port.postMessage({ domain, browser, ts: now });
    lastSent = { domain, at: now };
  } catch (e) {
    console.warn('[CompanyOS] postMessage failed', e);
    port = null;
    connect();
  }
}

async function reportActiveTab(force = false) {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (!win || !win.focused) return; // browser not in the foreground: the agent uses the foreground process anyway
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    if (!tab) return;
    if (tab.incognito) { send('unknown', force); return; } // not expected (incognito not_allowed), defensive
    send(domainForUrl(tab.url || tab.pendingUrl), force);
  } catch (e) {
    // Window or tab vanished between calls; next event will report.
  }
}

chrome.tabs.onActivated.addListener(() => reportActiveTab(true));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined && tab.active) reportActiveTab(true);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) reportActiveTab(true);
});

// Heartbeat so the agent knows the extension is alive while a browser is in the foreground (09 section 5).
// An open native messaging port keeps this MV3 service worker alive (Chrome 110+), so a plain interval is
// sufficient and no "alarms" permission is needed (09 section 5: tabs + nativeMessaging only).
setInterval(() => reportActiveTab(true), HEARTBEAT_SECONDS * 1000);

chrome.runtime.onStartup.addListener(() => { connect(); reportActiveTab(true); });
chrome.runtime.onInstalled.addListener(() => { connect(); reportActiveTab(true); });
connect();
