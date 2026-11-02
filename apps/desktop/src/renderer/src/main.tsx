import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/** FR-SEC-22: block drag-out of content. Dragging inside inputs (moving text within a field) stays possible. */
document.addEventListener('dragstart', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
});
document.addEventListener('drop', (e) => e.preventDefault());
document.addEventListener('dragover', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
