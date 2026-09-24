import React from 'react';

export const HomePage: React.FC = () => {
  return (
    <div style={styles.card}>
      <h1 style={styles.title}>DEVSYNX Activity Tracker Dashboard</h1>
      <p style={styles.description}>
        System Shell Ready. Phase 1 local development architecture established.
      </p>
      <div style={styles.badge}>Status: Operational (Phase 1 Baseline)</div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#1e293b',
    padding: '2.5rem',
    borderRadius: '12px',
    border: '1px solid #334155',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  title: {
    margin: '0 0 1rem 0',
    color: '#f8fafc',
    fontSize: '1.75rem',
  },
  description: {
    color: '#94a3b8',
    fontSize: '1rem',
    lineHeight: 1.6,
    marginBottom: '1.5rem',
  },
  badge: {
    display: 'inline-block',
    padding: '0.5rem 1rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '0.875rem',
  },
};
