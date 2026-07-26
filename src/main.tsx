import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html.');

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>
);

// Offline support. Registered after load so it never competes with the first
// paint, and skipped in dev where the module graph changes constantly.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Not fatal — the app simply will not work offline.
        });
    });
}
