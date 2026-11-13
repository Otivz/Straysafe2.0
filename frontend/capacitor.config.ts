import type { CapacitorConfig } from '@capacitor/cli';

// The StraySafe Android app: the live Resident interface in a Capacitor shell (docs/05-operations/ANDROID_RESIDENT_APP.md).
// This file is read by the Capacitor CLI when `cap sync` runs (on the GitHub runner), not inside the app.
//
// Secure by default: the app's own page is https://localhost and it calls an HTTPS backend. STRAYSAFE_ANDROID_DEBUG=true is set only by
// the debug APK workflow (with `vite build --mode android-debug`, whose Connection Settings screen lets the developer enter a backend on
// their own network over plain http). The page is then http://localhost, because a web page served over https may not call http://
// addresses (mixed content). Plain-http traffic is allowed natively only in the debug build type (android/app/src/debug/AndroidManifest.xml);
// a release APK refuses it whatever this says. Changing the scheme gives the app a new storage origin, so a saved sign-in is cleared once.
const debugBuild = process.env.STRAYSAFE_ANDROID_DEBUG === 'true';

const config: CapacitorConfig = {
  appId: 'com.straysafe.app',
  appName: 'StraySafe',
  webDir: 'dist',
  server: {
    androidScheme: debugBuild ? 'http' : 'https',
  },
  plugins: {
    // Capacitor 8's built-in system bars: the web view is inset for the status bar, navigation bar, display cutout and on-screen
    // keyboard (env(safe-area-inset-*) is 0 on older web views and real on newer ones; the Resident CSS uses it for its bottom bars).
    SystemBars: { insetsHandling: 'native' },
    // Push notifications (Firebase Cloud Messaging, src/resident/native/push.ts): shown with sound even while the app is open, as they are when
    // it is closed. Nothing arrives until the Firebase files are added (docs/05-operations/push/FIREBASE_PUSH_SETUP.md).
    PushNotifications: { presentationOptions: ['sound', 'alert'] },
  },
};

export default config;
