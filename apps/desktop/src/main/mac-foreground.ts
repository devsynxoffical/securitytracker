/**
 * Parses `displayed name|pid|bundle id` from System Events. WorkPulse's own window (its pid, or a bundle id
 * starting with com.devsynx) is reported as WorkPulse; a generic "Electron" name falls back to the last part
 * of the bundle id (com.tinyspeck.slackmacgap -> slackmacgap) so different Electron apps stay distinguishable.
 */
export function macForeground(raw: string, ownPid: number): { processName: string; appName: string } {
  const [nameRaw = '', pidRaw = '', bundleRaw = ''] = raw.trim().split('|');
  const name = nameRaw.replace(/\.app$/i, '').trim();
  const bundle = bundleRaw.trim() === 'missing value' ? '' : bundleRaw.trim();
  if (Number(pidRaw) === ownPid || bundle.startsWith('com.devsynx.')) return { processName: 'WorkPulse.app', appName: 'WorkPulse' };
  let appName = name || 'Unknown';
  if (/^electron$/i.test(appName) && bundle && !/^com\.github\.electron$/i.test(bundle)) {
    appName = bundle.split('.').pop() || appName;
  }
  return { processName: `${appName}.app`, appName };
}
