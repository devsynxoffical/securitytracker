import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchActivitySummary,
  fetchActivityApplications,
  fetchActivityDaily,
  fetchActivitySessions,
  fetchDevices,
  apiRequest,
  getActivityExportUrl,
} from '../services/api';
import {
  ActivitySummary,
  ActivityApplicationUsage,
  DailyActivityTrend,
  ActivitySessionItem,
  Device,
  UserProfile,
} from '../types';

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}

export const ActivityDashboardPage: React.FC = () => {
  const { user: currentUser, token } = useAuth();

  // Filter State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [appNameFilter, setAppNameFilter] = useState<string>('');
  const [isIdleFilter, setIsIdleFilter] = useState<string>('ALL'); // "ALL", "ACTIVE", "IDLE"
  const [page, setPage] = useState<number>(1);

  // Dropdown Lists
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [devicesList, setDevicesList] = useState<Device[]>([]);

  // Telemetry Data State
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [applications, setApplications] = useState<ActivityApplicationUsage[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyActivityTrend[]>([]);
  const [sessions, setSessions] = useState<ActivitySessionItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load Filter Dropdown Options (Employees & Devices)
  useEffect(() => {
    async function loadDropdowns() {
      try {
        if (currentUser && ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser.role)) {
          const empData = await apiRequest<Array<{ id: string; fullName: string; email: string }>>('/users', { method: 'GET' }, token);
          setEmployeesList(empData || []);
        }
        const devData = await fetchDevices();
        setDevicesList(devData || []);
      } catch (err) {
        console.error('Failed to load filter dropdowns:', err);
      }
    }
    loadDropdowns();
  }, [currentUser, token]);

  // Load Activity Dashboard Data
  useEffect(() => {
    async function loadActivityData() {
      setLoading(true);
      setError(null);

      const params: Record<string, any> = { page, limit: 50 };
      if (selectedEmployeeId) params.employeeId = selectedEmployeeId;
      if (selectedDeviceId) params.deviceId = selectedDeviceId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (appNameFilter.trim()) params.appName = appNameFilter.trim();
      if (isIdleFilter === 'ACTIVE') params.isIdle = false;
      if (isIdleFilter === 'IDLE') params.isIdle = true;

      try {
        const [sumRes, appRes, dailyRes, sessionRes] = await Promise.all([
          fetchActivitySummary(params),
          fetchActivityApplications(params),
          fetchActivityDaily(params),
          fetchActivitySessions(params),
        ]);

        setSummary(sumRes);
        setApplications(appRes || []);
        setDailyTrend(dailyRes || []);
        setSessions(sessionRes.data || []);
        setPagination(sessionRes.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 });
      } catch (err) {
        console.error('Failed to load activity metrics:', err);
        setError((err as Error).message || 'Unable to load activity data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadActivityData();
  }, [selectedEmployeeId, selectedDeviceId, startDate, endDate, appNameFilter, isIdleFilter, page]);

  const handleResetFilters = () => {
    setSelectedEmployeeId('');
    setSelectedDeviceId('');
    setStartDate('');
    setEndDate('');
    setAppNameFilter('');
    setIsIdleFilter('ALL');
    setPage(1);
  };

  const handleExportCsv = () => {
    const params: Record<string, any> = {};
    if (selectedEmployeeId) params.employeeId = selectedEmployeeId;
    if (selectedDeviceId) params.deviceId = selectedDeviceId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (appNameFilter.trim()) params.appName = appNameFilter.trim();
    if (isIdleFilter === 'ACTIVE') params.isIdle = false;
    if (isIdleFilter === 'IDLE') params.isIdle = true;

    const exportUrl = getActivityExportUrl(params);

    fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${token || localStorage.getItem('auth_token') || 'dev-token-admin'}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity_report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert('CSV Export Error: ' + err.message));
  };

  const maxActiveSeconds = applications.length > 0 ? Math.max(...applications.map((a) => a.activeSeconds), 1) : 1;
  const canSelectEmployee = currentUser && ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser.role);

  return (
    <div>
      {/* Header Bar */}
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Activity Dashboard</h1>
          <p style={styles.subtitle}>View employee application activity and tracked time.</p>
        </div>
        <button onClick={handleExportCsv} style={styles.exportButton}>
          📥 Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          {canSelectEmployee && (
            <div style={styles.filterGroup}>
              <label style={styles.label}>Employee</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                  setPage(1);
                }}
                style={styles.select}
              >
                <option value="">All Authorized Employees</option>
                {employeesList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={styles.filterGroup}>
            <label style={styles.label}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>Workstation Device</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                setPage(1);
              }}
              style={styles.select}
            >
              <option value="">All Devices</option>
              {devicesList.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.hostname} ({dev.osType})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>Application Search</label>
            <input
              type="text"
              placeholder="e.g. Chrome, VSCode"
              value={appNameFilter}
              onChange={(e) => {
                setAppNameFilter(e.target.value);
                setPage(1);
              }}
              style={styles.input}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.label}>Activity Type</label>
            <select
              value={isIdleFilter}
              onChange={(e) => {
                setIsIdleFilter(e.target.value);
                setPage(1);
              }}
              style={styles.select}
            >
              <option value="ALL">All (Active & Idle)</option>
              <option value="ACTIVE">Active Work Only</option>
              <option value="IDLE">System Idle Only</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={handleResetFilters} style={styles.resetButton}>
            Reset Filters
          </button>
        </div>
      </div>

      {error && <div style={styles.errorCard}>{error}</div>}

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Active Time</span>
          <h2 style={{ ...styles.cardValue, color: '#4ade80' }}>
            {summary ? formatDuration(summary.activeSeconds) : '...'}
          </h2>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Idle Time</span>
          <h2 style={{ ...styles.cardValue, color: '#fbbf24' }}>
            {summary ? formatDuration(summary.idleSeconds) : '...'}
          </h2>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Tracked Time</span>
          <h2 style={{ ...styles.cardValue, color: '#38bdf8' }}>
            {summary ? formatDuration(summary.totalTrackedSeconds) : '...'}
          </h2>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Sessions</span>
          <h2 style={{ ...styles.cardValue, color: '#f8fafc' }}>
            {summary ? summary.sessionCount : '...'}
          </h2>
        </div>
      </div>

      {/* Main Reporting Sections */}
      <div style={styles.sectionsGrid}>
        {/* Application Usage */}
        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Application Usage</h3>
          {loading ? (
            <p style={styles.statusText}>Loading application usage...</p>
          ) : applications.length === 0 ? (
            <p style={styles.statusText}>No application usage recorded for selected filters.</p>
          ) : (
            <div style={styles.appList}>
              {applications.slice(0, 10).map((app, idx) => {
                const percent = Math.min(100, Math.round((app.activeSeconds / maxActiveSeconds) * 100));
                return (
                  <div key={idx} style={styles.appRow}>
                    <div style={styles.appInfo}>
                      <span style={styles.appName}>{app.appName}</span>
                      <span style={styles.appDuration}>{formatDuration(app.activeSeconds)}</span>
                    </div>
                    <div style={styles.progressBg}>
                      <div style={{ ...styles.progressFill, width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Trend */}
        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Daily Activity Trend</h3>
          {loading ? (
            <p style={styles.statusText}>Loading daily trend...</p>
          ) : dailyTrend.length === 0 ? (
            <p style={styles.statusText}>No daily activity recorded for selected period.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Active Time</th>
                  <th style={styles.th}>Idle Time</th>
                  <th style={styles.th}>Total Tracked</th>
                </tr>
              </thead>
              <tbody>
                {dailyTrend.map((row, idx) => (
                  <tr key={idx} style={styles.tr}>
                    <td style={styles.td}>{row.date}</td>
                    <td style={{ ...styles.td, color: '#4ade80', fontWeight: 600 }}>{formatDuration(row.activeSeconds)}</td>
                    <td style={{ ...styles.td, color: '#fbbf24' }}>{formatDuration(row.idleSeconds)}</td>
                    <td style={{ ...styles.td, color: '#38bdf8' }}>{formatDuration(row.totalTrackedSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Session History Table */}
      <div style={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={styles.sectionTitle}>Session History</h3>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Showing {sessions.length} of {pagination.total} sessions
          </span>
        </div>

        {loading ? (
          <p style={styles.statusText}>Loading activity sessions...</p>
        ) : sessions.length === 0 ? (
          <p style={styles.statusText}>No activity found for the selected filters.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Application</th>
                  <th style={styles.th}>Window Title</th>
                  <th style={styles.th}>Start Time</th>
                  <th style={styles.th}>End Time</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Device</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{s.user?.fullName || 'Unknown'}</strong>
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#f8fafc' }}>{s.appName}</td>
                    <td style={{ ...styles.td, color: '#94a3b8', fontSize: '0.85rem' }}>{s.windowTitle || '—'}</td>
                    <td style={styles.td}>{new Date(s.startTime).toLocaleTimeString()}</td>
                    <td style={styles.td}>{new Date(s.endTime).toLocaleTimeString()}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{formatDuration(s.durationSeconds)}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: s.isIdle ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: s.isIdle ? '#fbbf24' : '#4ade80',
                        }}
                      >
                        {s.isIdle ? 'Idle' : 'Active'}
                      </span>
                    </td>
                    <td style={styles.td}>{s.device?.hostname || s.deviceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div style={styles.paginationRow}>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={page <= 1 ? styles.pageButtonDisabled : styles.pageButton}
          >
            &laquo; Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            style={page >= pagination.totalPages ? styles.pageButtonDisabled : styles.pageButton}
          >
            Next &raquo;
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { margin: 0, fontSize: '1.875rem', color: '#f8fafc' },
  subtitle: { margin: '0.4rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' },
  exportButton: { padding: '0.6rem 1.2rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  filterCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem', marginBottom: '1.5rem' },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.55rem 0.8rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' },
  select: { padding: '0.55rem 0.8rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' },
  resetButton: { padding: '0.5rem 1rem', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' },
  errorCard: { padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', borderRadius: '8px', marginBottom: '1.5rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  card: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' },
  cardLabel: { fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 },
  cardValue: { margin: '0.5rem 0 0 0', fontSize: '1.875rem' },
  sectionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' },
  sectionCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem' },
  sectionTitle: { margin: '0 0 1rem 0', color: '#f8fafc', fontSize: '1.1rem' },
  statusText: { color: '#94a3b8', fontSize: '0.9rem' },
  appList: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  appRow: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  appInfo: { display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' },
  appName: { color: '#f8fafc', fontWeight: 500 },
  appDuration: { color: '#38bdf8', fontWeight: 600 },
  progressBg: { width: '100%', height: '8px', backgroundColor: '#0f172a', borderRadius: '4px', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0284c7', borderRadius: '4px' },
  tableCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: { textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '1px solid #334155', color: '#94a3b8', fontWeight: 600 },
  tr: { borderBottom: '1px solid #334155' },
  td: { padding: '0.75rem 1rem', color: '#cbd5e1' },
  paginationRow: { marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pageButton: { padding: '0.5rem 1rem', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' },
  pageButtonDisabled: { padding: '0.5rem 1rem', backgroundColor: '#1e293b', color: '#64748b', border: '1px solid #334155', borderRadius: '6px', cursor: 'not-allowed', fontSize: '0.85rem' },
};
