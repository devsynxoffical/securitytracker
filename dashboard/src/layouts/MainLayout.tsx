import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';

export const MainLayout: React.FC = () => {
  return (
    <div style={styles.container}>
      <Header />
      <main style={styles.main}>
        <Outlet />
      </main>
      <footer style={styles.footer}>
        <p>&copy; {new Date().getFullYear()} DEVSYNX Private Limited. All rights reserved.</p>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
  },
  main: {
    flex: 1,
    padding: '2rem',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  footer: {
    padding: '1rem',
    textAlign: 'center',
    backgroundColor: '#1e293b',
    borderTop: '1px solid #334155',
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
};
