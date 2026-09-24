import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.code}>404</h1>
      <h2 style={styles.title}>Page Not Found</h2>
      <p style={styles.text}>The page you are looking for does not exist or has been moved.</p>
      <Link to="/" style={styles.button}>
        Back to Dashboard
      </Link>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    textAlign: 'center',
    padding: '4rem 2rem',
  },
  code: {
    fontSize: '5rem',
    margin: 0,
    color: '#ef4444',
  },
  title: {
    fontSize: '2rem',
    color: '#f8fafc',
    margin: '0.5rem 0 1rem 0',
  },
  text: {
    color: '#94a3b8',
    marginBottom: '2rem',
  },
  button: {
    display: 'inline-block',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#38bdf8',
    color: '#0f172a',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: 600,
  },
};
