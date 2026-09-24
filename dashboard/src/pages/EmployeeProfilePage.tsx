import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest, fetchDevices, fetchActivitySummary, fetchActivityApplications, fetchActivitySessions } from '../services/api';
import { Device, ActivitySummary, ActivityApplicationUsage, ActivitySessionItem } from '../types';
import { formatDuration } from './ActivityDashboardPage';

interface DetailedEmployee {
  id: string;
  email: string;
  fullName: string;
  employeeId?: string;
  avatarUrl?: string;
  jobTitle?: string;
  department?: string;
  role: string;
  status: string;
  joiningDate?: string;
  bio?: string;
  responsibilities?: string;
  currentFocus?: string;
  workLinksJson?: string;
  manager?: { id: string; fullName: string; email: string };
  directReports: Array<{ id: string; fullName: string; jobTitle?: string }>;
  employeeSkills: Array<{ skill: { id: string; name: string }; proficiency?: string }>;
  projectMemberships: Array<{ role: string; project: { id: string; name: string; status: string } }>;
  workUpdates: Array<{
    id: string;
    title: string;
    description: string;
    createdAt: string;
    project?: { id: string; name: string };
    attachments: Array<{ id: string; originalName: string; size: number }>;
  }>;
}

export const EmployeeProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user: currentUser } = useAuth();
  const [employee, setEmployee] = useState<DetailedEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'projects' | 'updates' | 'activity' | 'devices'>('overview');

  // Employee Devices State
  const [assignedDevices, setAssignedDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(false);

  // New Work Update Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);

  // Skill Form State
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillProficiency, setNewSkillProficiency] = useState('INTERMEDIATE');

  useEffect(() => {
    async function loadProfile() {
      if (!id) return;
      try {
        const data = await apiRequest<DetailedEmployee>(`/users/${id}`, { method: 'GET' }, token);
        setEmployee(data);
      } catch (err) {
        console.error('Failed to load employee profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [id, token]);

  useEffect(() => {
    async function loadEmployeeDevices() {
      if (!id || activeTab !== 'devices') return;
      setLoadingDevices(true);
      try {
        const devList = await fetchDevices({ userId: id });
        setAssignedDevices(devList);
      } catch (err) {
        console.error('Failed to load employee devices:', err);
      } finally {
        setLoadingDevices(false);
      }
    }
    loadEmployeeDevices();
  }, [id, activeTab]);

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newTitle || !newDescription) return;
    setPostingUpdate(true);
    try {
      await apiRequest(
        `/users/${id}/updates`,
        {
          method: 'POST',
          body: JSON.stringify({ title: newTitle, description: newDescription }),
        },
        token
      );
      setNewTitle('');
      setNewDescription('');
      // Reload profile
      const updated = await apiRequest<DetailedEmployee>(`/users/${id}`, { method: 'GET' }, token);
      setEmployee(updated);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPostingUpdate(false);
    }
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newSkillName) return;
    try {
      await apiRequest(
        `/users/${id}/skills`,
        {
          method: 'POST',
          body: JSON.stringify({ name: newSkillName, proficiency: newSkillProficiency }),
        },
        token
      );
      setNewSkillName('');
      const updated = await apiRequest<DetailedEmployee>(`/users/${id}`, { method: 'GET' }, token);
      setEmployee(updated);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading employee profile...</div>;
  }

  if (!employee) {
    return <div style={styles.empty}>Employee profile not found or access restricted.</div>;
  }

  const isSelf = currentUser?.id === employee.id;
  const isAdmin = currentUser && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

  return (
    <div>
      {/* Profile Header Header */}
      <div style={styles.headerCard}>
        <img
          src={employee.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(employee.fullName)}`}
          alt={employee.fullName}
          style={styles.avatarLarge}
        />
        <div style={styles.headerInfo}>
          <div style={styles.titleBadgeRow}>
            <h1 style={styles.profileName}>{employee.fullName}</h1>
            <span style={styles.statusBadge}>{employee.status}</span>
            <span style={styles.roleBadge}>{employee.role}</span>
          </div>
          <p style={styles.profileJob}>{employee.jobTitle || 'Team Member'} &bull; {employee.department || 'General'}</p>
          <p style={styles.profileMeta}>
            Email: <strong>{employee.email}</strong> | Manager: <strong>{employee.manager ? employee.manager.fullName : 'None'}</strong>
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div style={styles.tabsBar}>
        <button style={activeTab === 'overview' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('overview')}>Overview</button>
        <button style={activeTab === 'skills' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('skills')}>Skills</button>
        <button style={activeTab === 'projects' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('projects')}>Projects</button>
        <button style={activeTab === 'updates' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('updates')}>Work Updates</button>
        <button style={activeTab === 'activity' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('activity')}>Activity (Phase 6)</button>
        <button style={activeTab === 'devices' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('devices')}>Devices (Phase 6)</button>
      </div>

      {/* Tab Content */}
      <div style={styles.tabContentCard}>
        {activeTab === 'overview' && (
          <div>
            <h3>Short Bio</h3>
            <p style={styles.textBlock}>{employee.bio || 'No bio provided.'}</p>

            <h3>Responsibilities</h3>
            <p style={styles.textBlock}>{employee.responsibilities || 'No specific responsibilities documented.'}</p>

            <h3>Current Work Focus</h3>
            <p style={styles.textBlock}>{employee.currentFocus || 'No current focus documented.'}</p>
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            <h3>Employee Skills</h3>
            <div style={styles.skillsGrid}>
              {employee.employeeSkills.map((es, idx) => (
                <div key={idx} style={styles.skillCard}>
                  <strong>{es.skill.name}</strong>
                  <span style={styles.proficiencyTag}>{es.proficiency || 'INTERMEDIATE'}</span>
                </div>
              ))}
            </div>

            {(isSelf || isAdmin) && (
              <form onSubmit={handleAddSkill} style={styles.inlineForm}>
                <h4>Add New Skill</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Skill name (e.g. React, Python)"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    style={styles.input}
                    required
                  />
                  <select
                    value={newSkillProficiency}
                    onChange={(e) => setNewSkillProficiency(e.target.value)}
                    style={styles.select}
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="EXPERT">Expert</option>
                  </select>
                  <button type="submit" style={styles.button}>Add Skill</button>
                </div>
              </form>
            )}
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <h3>Associated Projects</h3>
            {employee.projectMemberships.length === 0 ? (
              <p style={styles.textBlock}>No active projects linked yet.</p>
            ) : (
              <div style={styles.projectsList}>
                {employee.projectMemberships.map((pm, idx) => (
                  <div key={idx} style={styles.projectCard}>
                    <h4>{pm.project.name}</h4>
                    <p>Role: {pm.role} &bull; Status: {pm.project.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'updates' && (
          <div>
            <h3>Work Documentation & Updates</h3>

            {(isSelf || isAdmin) && (
              <form onSubmit={handlePostUpdate} style={styles.updateForm}>
                <h4>Post a Work Update</h4>
                <input
                  type="text"
                  placeholder="Update heading (e.g. Completed API refactoring)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={styles.inputFull}
                  required
                />
                <textarea
                  placeholder="Describe your progress or work update..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={styles.textarea}
                  rows={3}
                  required
                />
                <button type="submit" disabled={postingUpdate} style={styles.button}>
                  {postingUpdate ? 'Posting...' : 'Post Update'}
                </button>
              </form>
            )}

            <div style={styles.updatesFeed}>
              {employee.workUpdates.length === 0 ? (
                <p style={styles.textBlock}>No work updates posted yet.</p>
              ) : (
                employee.workUpdates.map((update) => (
                  <div key={update.id} style={styles.updateCard}>
                    <div style={styles.updateHeader}>
                      <h4 style={styles.updateTitle}>{update.title}</h4>
                      <span style={styles.updateTime}>{new Date(update.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p style={styles.updateDesc}>{update.description}</p>
                    {update.attachments.length > 0 && (
                      <div style={styles.attachmentBadge}>
                        📎 {update.attachments[0].originalName}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <EmployeeActivityTab employeeId={employee.id} />
        )}

        {activeTab === 'devices' && (
          <div>
            <h3>Assigned Workstation Devices</h3>
            {loadingDevices ? (
              <p style={styles.textBlock}>Loading workstation inventory...</p>
            ) : assignedDevices.length === 0 ? (
              <p style={styles.textBlock}>No registered workstations assigned to this employee.</p>
            ) : (
              <div style={styles.projectsList}>
                {assignedDevices.map((dev) => (
                  <div key={dev.id} style={styles.projectCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, color: '#f8fafc' }}>
                        {dev.osType === 'WINDOWS' ? '🪟' : '🍎'} {dev.hostname}
                      </h4>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor:
                            dev.status === 'ACTIVE'
                              ? 'rgba(34, 197, 94, 0.2)'
                              : dev.status === 'DISABLED'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                          color:
                            dev.status === 'ACTIVE'
                              ? '#4ade80'
                              : dev.status === 'DISABLED'
                              ? '#fbbf24'
                              : '#f87171',
                        }}
                      >
                        {dev.status}
                      </span>
                    </div>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                      OS: {dev.osType} {dev.osVersion || ''}
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      Last Agent Sync: {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : 'Never connected'}
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                      Registered: {new Date(dev.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  loading: { padding: '3rem', textAlign: 'center', color: '#94a3b8' },
  empty: { padding: '3rem', textAlign: 'center', color: '#94a3b8', backgroundColor: '#1e293b', borderRadius: '12px' },
  headerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    backgroundColor: '#1e293b',
    padding: '2rem',
    borderRadius: '12px',
    border: '1px solid #334155',
    marginBottom: '1.5rem',
  },
  avatarLarge: { width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', backgroundColor: '#334155' },
  headerInfo: { flex: 1 },
  titleBadgeRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
  profileName: { margin: 0, fontSize: '1.75rem', color: '#f8fafc' },
  statusBadge: { padding: '0.25rem 0.6rem', backgroundColor: '#0284c7', color: '#fff', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 },
  roleBadge: { padding: '0.25rem 0.6rem', backgroundColor: '#334155', color: '#e2e8f0', borderRadius: '4px', fontSize: '0.75rem' },
  profileJob: { margin: '0.5rem 0 0 0', color: '#38bdf8', fontSize: '1rem' },
  profileMeta: { margin: '0.4rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' },
  tabsBar: { display: 'flex', gap: '0.5rem', borderBottom: '1px solid #334155', marginBottom: '1.5rem' },
  tab: { padding: '0.75rem 1.25rem', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.95rem' },
  tabActive: { padding: '0.75rem 1.25rem', backgroundColor: '#1e293b', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', borderBottom: '2px solid #38bdf8', color: '#f8fafc', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' },
  tabContentCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '2rem' },
  textBlock: { color: '#cbd5e1', lineHeight: 1.6 },
  skillsGrid: { display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' },
  skillCard: { padding: '0.75rem 1.25rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  proficiencyTag: { fontSize: '0.75rem', color: '#38bdf8' },
  inlineForm: { marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #334155' },
  input: { padding: '0.6rem 1rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' },
  select: { padding: '0.6rem 1rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' },
  button: { padding: '0.6rem 1.2rem', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 },
  projectsList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  projectCard: { padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' },
  updateForm: { marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' },
  inputFull: { width: '100%', padding: '0.6rem 1rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', marginBottom: '0.75rem', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '0.6rem 1rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', marginBottom: '0.75rem', boxSizing: 'border-box' },
  updatesFeed: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  updateCard: { padding: '1.25rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' },
  updateHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  updateTitle: { margin: 0, color: '#f8fafc' },
  updateTime: { fontSize: '0.75rem', color: '#94a3b8' },
  updateDesc: { margin: '0.5rem 0 0 0', color: '#cbd5e1', lineHeight: 1.5 },
  attachmentBadge: { marginTop: '0.5rem', fontSize: '0.75rem', color: '#38bdf8' },
};

const EmployeeActivityTab: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [apps, setApps] = useState<ActivityApplicationUsage[]>([]);
  const [sessions, setSessions] = useState<ActivitySessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, appRes, sessionRes] = await Promise.all([
          fetchActivitySummary({ employeeId }),
          fetchActivityApplications({ employeeId }),
          fetchActivitySessions({ employeeId, limit: 10 }),
        ]);
        setSummary(sumRes);
        setApps(appRes || []);
        setSessions(sessionRes.data || []);
      } catch (err) {
        console.error('Failed to load profile activity tab:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [employeeId]);

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading activity telemetry...</p>;

  return (
    <div>
      <h3 style={{ margin: '0 0 1rem 0', color: '#f8fafc' }}>Employee Activity & Telemetry Metrics</h3>
      
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Active Time</span>
          <h3 style={{ margin: '0.4rem 0 0 0', color: '#4ade80' }}>{summary ? formatDuration(summary.activeSeconds) : '0m'}</h3>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Idle Time</span>
          <h3 style={{ margin: '0.4rem 0 0 0', color: '#fbbf24' }}>{summary ? formatDuration(summary.idleSeconds) : '0m'}</h3>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Tracked</span>
          <h3 style={{ margin: '0.4rem 0 0 0', color: '#38bdf8' }}>{summary ? formatDuration(summary.totalTrackedSeconds) : '0m'}</h3>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Sessions</span>
          <h3 style={{ margin: '0.4rem 0 0 0', color: '#f8fafc' }}>{summary ? summary.sessionCount : 0}</h3>
        </div>
      </div>

      {/* Top Applications */}
      <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc' }}>Top Used Applications</h4>
      {apps.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No application activity recorded for this employee.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {apps.slice(0, 6).map((app, idx) => (
            <div key={idx} style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>{app.appName}</div>
              <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '0.2rem' }}>{formatDuration(app.activeSeconds)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Sessions */}
      <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc' }}>Recent Activity Sessions</h4>
      {sessions.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No activity sessions found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>App</th>
                <th style={{ padding: '0.5rem' }}>Start</th>
                <th style={{ padding: '0.5rem' }}>End</th>
                <th style={{ padding: '0.5rem' }}>Duration</th>
                <th style={{ padding: '0.5rem' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #334155', color: '#cbd5e1' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: '#f8fafc' }}>{s.appName}</td>
                  <td style={{ padding: '0.5rem' }}>{new Date(s.startTime).toLocaleTimeString()}</td>
                  <td style={{ padding: '0.5rem' }}>{new Date(s.endTime).toLocaleTimeString()}</td>
                  <td style={{ padding: '0.5rem' }}>{formatDuration(s.durationSeconds)}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{ color: s.isIdle ? '#fbbf24' : '#4ade80', fontWeight: 600 }}>
                      {s.isIdle ? 'Idle' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
