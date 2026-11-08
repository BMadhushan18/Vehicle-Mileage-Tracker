import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ridelog.mileage',
  appName: 'RideLog',
  webDir: 'dist',
  android: {
    // Required by the background-geolocation plugin, or updates stop after ~5 min in background.
    useLegacyBridge: true,
    backgroundColor: '#F4F6FB',
  },
  plugins: {
    // Native HTTP: Android throttles WebView requests from background apps.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
