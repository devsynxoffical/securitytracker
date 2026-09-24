import React from 'react';
import { Link } from 'react-router-dom';

export const Header: React.FC = () => {
  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <h2>DEVSYNX Activity Tracker</h2>
      </div>
      <nav style={styles.nav}>
        <Link to="/" style={styles.link}>
          Home
        </Link>
        <Link to="/employees" style={styles.link}>
          Employee Directory
        </Link>
        <Link to="/activity" style={styles.link}>
          Activity
        </Link>
        <Link to="/devices" style={styles.link}>
          Devices
        </Link>
      </nav>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  brand: {
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '1.5rem',
  },
  link: {
    color: '#38bdf8',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
