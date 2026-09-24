import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchDevices,
  registerDevice,
  disableDevice,
  enableDevice,
  revokeDevice,
  rotateDeviceCredential,
  apiRequest,
} from '../services/api';
import { Device, RegisterDeviceResponse, UserProfile } from '../types';

export const DeviceManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [provisioningData, setProvisioningData] = useState<{ device: Device; rawCredential: string } | null>(null);
  const [revokingDevice, setRevokingDevice] = useState<Device | null>(null);
  const [selectedDeviceDetails, setSelectedDeviceDetails] = useState<Device | null>(null);

  // Registration Form State
  const [regUserId, setRegUserId] = useState<string>('');
  const [regHostname, setRegHostname] = useState<string>('');
  const [regOsType, setRegOsType] = useState<'WINDOWS' | 'MACOS'>('WINDOWS');
  const [regOsVersion, setRegOsVersion] = useState<string>('');
  const [submittingReg, setSubmittingReg] = useState<boolean>(false);

  // Copy state
  const [copied, setCopied] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [deviceList, userList] = await Promise.all([
        fetchDevices({ search, status: statusFilter }),
        apiRequest<UserProfile[]>('/users', { method: 'GET' }).catch(() => []),
      ]);
      setDevices(deviceList);
      setEmployees(userList);
    } catch (err) {
      console.error('Failed to load device management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUserId || !regHostname) return;

    setSubmittingReg(true);
    try {
      const result: RegisterDeviceResponse = await registerDevice({
        userId: regUserId,
        hostname: regHostname,
        osType: regOsType,
        osVersion: regOsVersion || undefined,
      });

      setIsRegisterOpen(false);
      setRegUserId('');
      setRegHostname('');
      setRegOsVersion('');
      setProvisioningData({ device: result.device, rawCredential: result.rawCredential });
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleRotateCredential = async (device: Device) => {
    if (!window.confirm(`Are you sure you want to rotate credential for device "${device.hostname}"? The old credential will become immediately invalid.`)) {
      return;
    }
    try {
      const result = await rotateDeviceCredential(device.id);
      setProvisioningData({ device: result.device, rawCredential: result.rawCredential });
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleToggleStatus = async (device: Device) => {
    try {
      if (device.status === 'ACTIVE') {
        await disableDevice(device.id);
      } else if (device.status === 'DISABLED') {
        await enableDevice(device.id);
      }
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokingDevice) return;
    try {
      await revokeDevice(revokingDevice.id);
      setRevokingDevice(null);
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatLastSeen = (lastSeen?: string | null) => {
    if (!lastSeen) return 'Never connected';
    const date = new Date(lastSeen);
    return date.toLocaleString();
  };

  return (
    <div style={styles.container}>
      {/* Header Banner */}
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Device Management & Authorization</h1>
          <p style={styles.subtitle}>
            Register workstations, issue desktop agent credentials, track connectivity & enforce security policies.
          </p>
        </div>
        {isAdmin && (
          <button style={styles.primaryButton} onClick={() => setIsRegisterOpen(true)}>
            + Register New Device
          </button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search by hostname or employee name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.selectFilter}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
          <option value="REVOKED">REVOKED</option>
        </select>
      </div>

      {/* Devices Table */}
      {loading ? (
        <div style={styles.loadingBox}>Loading device inventory...</div>
      ) : devices.length === 0 ? (
        <div style={styles.emptyBox}>No devices found matching current filters.</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Hostname & OS</th>
                <th style={styles.th}>Assigned Employee</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Seen</th>
                <th style={styles.th}>Registered Date</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.deviceCell}>
                      <span style={styles.osIcon}>{device.osType === 'WINDOWS' ? '🪟' : '🍎'}</span>
                      <div>
                        <strong style={styles.hostnameText}>{device.hostname}</strong>
                        <div style={styles.subText}>{device.osType} {device.osVersion || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    {device.user ? (
                      <div>
                        <div style={styles.empName}>{device.user.fullName}</div>
                        <div style={styles.subText}>{device.user.email}</div>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={statusBadgeStyles[device.status] || styles.defaultBadge}>
                      {device.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.dateText}>{formatLastSeen(device.lastSeenAt)}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.dateText}>{new Date(device.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actionGroup}>
                      <button
                        style={styles.iconButton}
                        onClick={() => setSelectedDeviceDetails(device)}
                        title="View Details"
                      >
                        👁️
                      </button>

                      {isAdmin && device.status !== 'REVOKED' && (
                        <>
                          <button
                            style={device.status === 'ACTIVE' ? styles.amberButton : styles.greenButton}
                            onClick={() => handleToggleStatus(device)}
                          >
                            {device.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            style={styles.blueButton}
                            onClick={() => handleRotateCredential(device)}
                            title="Rotate Secret Credential"
                          >
                            🔄 Rotate
                          </button>

                          <button
                            style={styles.redButton}
                            onClick={() => setRevokingDevice(device)}
                            title="Revoke Device Credential"
                          >
                            🚫 Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Device Modal */}
      {isRegisterOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Register New Device</h3>
              <button style={styles.closeBtn} onClick={() => setIsRegisterOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleRegisterSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Assign Employee *</label>
                <select
                  value={regUserId}
                  onChange={(e) => setRegUserId(e.target.value)}
                  style={styles.select}
                  required
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hostname *</label>
                <input
                  type="text"
                  placeholder="e.g. DESKTOP-ALI-WIN11"
                  value={regHostname}
                  onChange={(e) => setRegHostname(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Operating System *</label>
                <select
                  value={regOsType}
                  onChange={(e) => setRegOsType(e.target.value as 'WINDOWS' | 'MACOS')}
                  style={styles.select}
                  required
                >
                  <option value="WINDOWS">Windows</option>
                  <option value="MACOS">macOS</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>OS Version (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Windows 11 Pro 23H2"
                  value={regOsVersion}
                  onChange={(e) => setRegOsVersion(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.modalFooter}>
                <button type="button" style={styles.secondaryButton} onClick={() => setIsRegisterOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingReg} style={styles.primaryButton}>
                  {submittingReg ? 'Generating Credential...' : 'Register & Provision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credential Provisioning Secret Warning Modal */}
      {provisioningData && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: '580px', border: '1px solid #38bdf8' }}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: '#38bdf8' }}>🔑 Device Credential Provisioned</h3>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#e2e8f0', margin: '0 0 1rem 0' }}>
                Device <strong>{provisioningData.device.hostname}</strong> registered successfully.
              </p>

              <div style={styles.warningAlertBox}>
                <strong>⚠️ CRITICAL SECURITY WARNING:</strong>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.875rem' }}>
                  This secret device credential is generated ONCE and shown ONLY RIGHT NOW. It is hashed on the server and CANNOT be recovered later.
                </p>
              </div>

              <div style={styles.secretBox}>
                <span style={styles.secretText}>{provisioningData.rawCredential}</span>
                <button
                  style={copied ? styles.copiedBtn : styles.copyBtn}
                  onClick={() => copyToClipboard(provisioningData.rawCredential)}
                >
                  {copied ? 'Copied!' : 'Copy Secret'}
                </button>
              </div>

              <div style={styles.infoNote}>
                Paste this secret key into the DEVSYNX Desktop Agent setup config on the user's machine.
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.primaryButton}
                onClick={() => setProvisioningData(null)}
              >
                Done (I have copied the secret)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingDevice && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: '480px', border: '1px solid #ef4444' }}>
            <div style={styles.modalHeader}>
              <h3 style={{ ...styles.modalTitle, color: '#ef4444' }}>🚫 Revoke Device Credential</h3>
              <button style={styles.closeBtn} onClick={() => setRevokingDevice(null)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#f8fafc', lineHeight: 1.5 }}>
                Are you sure you want to permanently <strong>REVOKE</strong> device <strong>{revokingDevice.hostname}</strong>?
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                This action invalidates all desktop agent sessions for this workstation. The agent will no longer be able to submit telemetry activity.
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.secondaryButton} onClick={() => setRevokingDevice(null)}>
                Cancel
              </button>
              <button style={styles.redButtonLarge} onClick={handleRevokeConfirm}>
                Confirm Permanent Revocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Device Details Modal */}
      {selectedDeviceDetails && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Device Details</h3>
              <button style={styles.closeBtn} onClick={() => setSelectedDeviceDetails(null)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Device ID:</span>
                <span style={styles.detailVal}>{selectedDeviceDetails.id}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Hostname:</span>
                <span style={styles.detailVal}>{selectedDeviceDetails.hostname}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>OS Type:</span>
                <span style={styles.detailVal}>{selectedDeviceDetails.osType} {selectedDeviceDetails.osVersion || ''}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Status:</span>
                <span style={statusBadgeStyles[selectedDeviceDetails.status]}>{selectedDeviceDetails.status}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Assigned Employee:</span>
                <span style={styles.detailVal}>
                  {selectedDeviceDetails.user ? `${selectedDeviceDetails.user.fullName} (${selectedDeviceDetails.user.email})` : 'Unassigned'}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Last Agent Ping:</span>
                <span style={styles.detailVal}>{formatLastSeen(selectedDeviceDetails.lastSeenAt)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Registered Date:</span>
                <span style={styles.detailVal}>{new Date(selectedDeviceDetails.createdAt).toLocaleString()}</span>
              </div>
              {selectedDeviceDetails.revokedAt && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Revoked Date:</span>
                  <span style={{ ...styles.detailVal, color: '#ef4444' }}>
                    {new Date(selectedDeviceDetails.revokedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.secondaryButton} onClick={() => setSelectedDeviceDetails(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const statusBadgeStyles: Record<string, React.CSSProperties> = {
  ACTIVE: {
    padding: '0.25rem 0.6rem',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  DISABLED: {
    padding: '0.25rem 0.6rem',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#fbbf24',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  REVOKED: {
    padding: '0.25rem 0.6rem',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '2rem', maxWidth: '1200px', margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' },
  title: { margin: 0, fontSize: '1.75rem', color: '#f8fafc' },
  subtitle: { margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' },
  filterBar: { display: 'flex', gap: '1rem', marginBottom: '1.5rem' },
  searchInput: { flex: 1, padding: '0.65rem 1rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' },
  selectFilter: { padding: '0.65rem 1rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' },
  loadingBox: { padding: '3rem', textAlign: 'center', color: '#94a3b8', backgroundColor: '#1e293b', borderRadius: '8px' },
  emptyBox: { padding: '3rem', textAlign: 'center', color: '#94a3b8', backgroundColor: '#1e293b', borderRadius: '8px' },
  tableWrapper: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '1rem', backgroundColor: '#0f172a', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid #334155' },
  td: { padding: '1rem', color: '#e2e8f0', verticalAlign: 'middle' },
  deviceCell: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  osIcon: { fontSize: '1.5rem' },
  hostnameText: { color: '#f8fafc', fontSize: '1rem' },
  subText: { fontSize: '0.75rem', color: '#94a3b8' },
  empName: { color: '#f8fafc', fontWeight: 500 },
  defaultBadge: { padding: '0.25rem 0.6rem', backgroundColor: '#334155', color: '#cbd5e1', borderRadius: '4px', fontSize: '0.75rem' },
  dateText: { fontSize: '0.85rem', color: '#cbd5e1' },
  actionGroup: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  iconButton: { padding: '0.4rem 0.6rem', backgroundColor: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  primaryButton: { padding: '0.65rem 1.25rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' },
  secondaryButton: { padding: '0.6rem 1rem', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  greenButton: { padding: '0.4rem 0.8rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  amberButton: { padding: '0.4rem 0.8rem', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  blueButton: { padding: '0.4rem 0.8rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  redButton: { padding: '0.4rem 0.8rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  redButtonLarge: { padding: '0.6rem 1.2rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { backgroundColor: '#1e293b', width: '100%', maxWidth: '500px', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { margin: 0, color: '#f8fafc', fontSize: '1.25rem' },
  closeBtn: { backgroundColor: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' },
  modalBody: { marginBottom: '1.5rem' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', color: '#cbd5e1', marginBottom: '0.4rem', fontSize: '0.875rem' },
  input: { width: '100%', padding: '0.6rem 1rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' },
  select: { width: '100%', padding: '0.6rem 1rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' },
  warningAlertBox: { padding: '0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#fca5a5', marginBottom: '1rem' },
  secretBox: { display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#0f172a', border: '1px dashed #38bdf8', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem' },
  secretText: { flex: 1, fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.95rem', wordBreak: 'break-all' },
  copyBtn: { padding: '0.5rem 1rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' },
  copiedBtn: { padding: '0.5rem 1rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' },
  infoNote: { color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' },
  detailRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' },
  detailLabel: { color: '#94a3b8', fontSize: '0.9rem' },
  detailVal: { color: '#f8fafc', fontSize: '0.9rem', fontWeight: 500 },
};
