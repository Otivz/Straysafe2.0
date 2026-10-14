import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.straysafe.app',
  appName: 'StraySafe',
  webDir: 'dist',
  server: {
    // The app's own page is http://localhost (still a secure context: camera, GPS and QR scanning work), so its calls to
    // the http:// API address in VITE_API_BASE_URL are not blocked as mixed content. With 'https' the WebView blocked
    // them, and utils/api.ts sent them to the dev-server-only /api path. Changing the scheme clears the installed
    // app's saved sign-in once.
    androidScheme: 'http',
    cleartext: true
  }
};

export default config;
