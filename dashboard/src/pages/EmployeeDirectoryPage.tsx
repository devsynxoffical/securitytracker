import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

interface EmployeeItem {
  id: string;
  email: string;
  fullName: string;
  employeeId?: string;
  avatarUrl?: string;
  jobTitle?: string;
  department?: string;
  role: string;
  status: string;
  manager?: { id: string; fullName: string };
  employeeSkills: Array<{ skill: { name: string }; proficiency?: string }>;
}

export const EmployeeDirectoryPage: React.FC = () => {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');

  useEffect(() => {
    async function loadDirectory() {
      try {
        let endpoint = '/users';
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (department) params.append('department', department);
        if (params.toString()) endpoint += `?${params.toString()}`;

        const data = await apiRequest<EmployeeItem[]>(endpoint, { method: 'GET' }, token);
        setEmployees(data);
      } catch (err) {
        console.error('Failed to load employee directory:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDirectory();
  }, [token, search, department]);

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Employee Directory</h1>
          <p style={styles.subtitle}>Internal workplace directory and profile management</p>
        </div>
      </div>

      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search by name, email, or job title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.input}
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          style={styles.select}
        >
          <option value="">All Departments</option>
          <option value="Engineering">Engineering</option>
          <option value="Design">Design</option>
          <option value="Product">Product</option>
          <option value="HR">HR</option>
        </select>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading directory...</div>
      ) : employees.length === 0 ? (
        <div style={styles.empty}>No employee profiles found matching your search.</div>
      ) : (
        <div style={styles.grid}>
          {employees.map((emp) => (
            <Link key={emp.id} to={`/employees/${emp.id}`} style={styles.cardLink}>
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <img
                    src={emp.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(emp.fullName)}`}
                    alt={emp.fullName}
                    style={styles.avatar}
                  />
                  <div>
                    <h3 style={styles.name}>{emp.fullName}</h3>
                    <p style={styles.jobTitle}>{emp.jobTitle || 'Team Member'}</p>
                  </div>
                </div>

                <div style={styles.cardBody}>
                  <p style={styles.infoRow}>
                    <strong>Dept:</strong> {emp.department || 'General'}
                  </p>
                  <p style={styles.infoRow}>
                    <strong>Email:</strong> {emp.email}
                  </p>
                  {emp.manager && (
                    <p style={styles.infoRow}>
                      <strong>Manager:</strong> {emp.manager.fullName}
                    </p>
                  )}
                  <div style={styles.skillsRow}>
                    {emp.employeeSkills.slice(0, 3).map((es, idx) => (
                      <span key={idx} style={styles.skillBadge}>
                        {es.skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    marginBottom: '1.5rem',
  },
  title: {
    margin: 0,
    fontSize: '2rem',
    color: '#f8fafc',
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    color: '#94a3b8',
  },
  filterBar: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '0.95rem',
  },
  select: {
    padding: '0.75rem 1rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '0.95rem',
  },
  loading: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
  },
  empty: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.5rem',
  },
  cardLink: {
    textDecoration: 'none',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '1.5rem',
    transition: 'transform 0.2s, border-color 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
  },
  avatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    objectFit: 'cover',
    backgroundColor: '#334155',
  },
  name: {
    margin: 0,
    fontSize: '1.15rem',
    color: '#f8fafc',
  },
  jobTitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.875rem',
    color: '#0284c7',
  },
  cardBody: {
    fontSize: '0.875rem',
    color: '#cbd5e1',
  },
  infoRow: {
    margin: '0.4rem 0',
  },
  skillsRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.75rem',
    flexWrap: 'wrap',
  },
  skillBadge: {
    padding: '0.25rem 0.6rem',
    backgroundColor: '#334155',
    color: '#e2e8f0',
    borderRadius: '4px',
    fontSize: '0.75rem',
  },
};
