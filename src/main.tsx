import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isNativeApp, resumeIfNeeded, syncGps } from './gps/tracker';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The Android app bundles its files, so it doesn't need the service worker.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}

// Pick up a ride that was being tracked, and send any unsynced GPS days.
void resumeIfNeeded();
if (isNativeApp) {
  import('@capacitor/app').then(({ App: CapApp }) => {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void syncGps();
    });
  });
} else {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncGps();
  });
}
