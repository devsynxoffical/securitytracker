/**
 * Company OS Domain Reporter - Manifest V3 Background Service Worker
 * Reports active browser tab domain (only registrable domain, no path/query parameters)
 * to the local Company OS Tracker Agent via Native Messaging.
 */

const NATIVE_HOST_NAME = 'com.companyos.agent';
let nativePort = null;
let lastReportedDomain = null;

function connectNativeHost() {
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((msg) => {
      console.log('Received message from tracker agent:', msg);
    });

    nativePort.onDisconnect.addListener(() => {
      console.warn('Native host disconnected:', chrome.runtime.lastError?.message);
      nativePort = null;
      // Reconnection backoff
      setTimeout(connectNativeHost, 5000);
    });
  } catch (err) {
    console.error('Failed to connect to native messaging host:', err);
  }
}

/**
 * Extracts and cleans registrable domain name.
 * Discards path, query parameters, anchors, and internal protocols per privacy rules.
 */
function extractDomain(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Browser internal or local protocols
    if (
      parsed.protocol === 'chrome:' ||
      parsed.protocol === 'edge:' ||
      parsed.protocol === 'about:' ||
      parsed.protocol === 'chrome-extension:' ||
      parsed.protocol === 'file:'
    ) {
      return 'browser-internal';
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'unknown';
    }

    const hostname = parsed.hostname.toLowerCase();
    // Return hostname / domain (no ports, no query strings)
    return hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Reports current active tab domain to native host.
 */
async function reportActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) return;

    const domain = extractDomain(tab.url);
    if (!domain || domain === lastReportedDomain) return;

    lastReportedDomain = domain;

    const payload = {
      domain,
      browser: 'chrome',
      timestamp: new Date().toISOString(),
      incognito: tab.incognito || false,
    };

    if (nativePort) {
      nativePort.postMessage(payload);
    } else {
      connectNativeHost();
      if (nativePort) {
        nativePort.postMessage(payload);
      }
    }
  } catch (err) {
    console.error('Error reporting active tab domain:', err);
  }
}

// Tab change listeners
chrome.tabs.onActivated.addListener(reportActiveTab);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    reportActiveTab();
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    reportActiveTab();
  }
});

// Initial connection
connectNativeHost();
reportActiveTab();
