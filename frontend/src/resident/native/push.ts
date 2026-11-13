/**
 * Push notifications in the Android app: Firebase Cloud Messaging through @capacitor/push-notifications. In a browser nothing here runs (the
 * web app keeps its notifications list, and Web Push where the server has VAPID keys).
 *
 * After sign-in the app creates its two notification channels, asks Android for permission (Android 13 and later shows the prompt once),
 * registers with Firebase and sends its token to the server as this account's phone (POST /push/subscribe, channel "fcm"). Signing out removes
 * it first (POST /push/unsubscribe), so the next person to sign in on the phone never gets the previous one's notifications. A tap opens the
 * screen the server named; opening it changes nothing. Until Firebase is set up (docs/05-operations/push/FIREBASE_PUSH_SETUP.md) the server
 * answers the registration with 503 and the app carries on without push.
 *
 * The channel ids are the ones the server names in each message (backend/app/services/push_service.py).
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { httpPost } from '../../live/http';

// Both channels ring, vibrate and pop up (importance 4, high): Android shows them by itself while the app is closed, another app is
// open or the screen is off. Visibility 0 (private): a locked phone shows that something came, not what; the alerts are public
// notices, so they may show in full. A channel cannot be changed once it exists on a phone, so these replaced the first two
// ("straysafe_updates", "lost_found_alerts", made without vibration), which are removed.
export const CHANNELS = [
  { id: 'straysafe_notifications', name: 'Updates on your reports', description: 'Sightings, messages and changes to your reports and claims', importance: 4 as const, visibility: 0 as const, vibration: true, lights: true, lightColor: '#C65A17' },
  { id: 'straysafe_alerts', name: 'Lost & found alerts', description: 'Alerts your Subdivision Leader sends about missing and found animals', importance: 4 as const, visibility: 1 as const, vibration: true, lights: true, lightColor: '#C65A17' },
];
const RETIRED_CHANNELS = ['straysafe_updates', 'lost_found_alerts'];

export function nativePushAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications'); } catch { return false; }
}

/** The screen a tap opens, as a path inside this app ("/community/alert-12/sighting"), or null: never an address outside the app. */
export function appPathOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const path = url.trim().replace(/^\/resident-app(?=\/)/, '');
  return /^\/[a-z]/i.test(path) ? path : null;
}

let token: string | null = null;

/**
 * Starts push for the signed-in resident. `open` receives the path of a tapped notification. Returns what stops listening (the registration on
 * the server stays until `stopPush`, so notifications keep arriving while the app is closed).
 */
export async function startPush(open: (path: string) => void): Promise<() => void> {
  if (!nativePushAvailable()) return () => undefined;
  const handles = await Promise.all([
    PushNotifications.addListener('registration', (t) => {
      token = t.value;
      // 503 until Firebase is set up on the server: the app works the same without push
      void httpPost('/push/subscribe', { channel: 'fcm', token: t.value }).catch(() => undefined);
    }),
    PushNotifications.addListener('registrationError', (e) => { console.warn('Push registration failed', e.error); }),
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const path = appPathOf((a.notification.data as { url?: unknown } | undefined)?.url);
      if (path) open(path);
    }),
  ]);
  try {
    for (const id of RETIRED_CHANNELS) await PushNotifications.deleteChannel({ id }).catch(() => undefined);
    for (const c of CHANNELS) await PushNotifications.createChannel(c);
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
    if (permission.receive === 'granted') await PushNotifications.register();
  } catch (err) {
    console.warn('Push notifications could not start', err);
  }
  return () => { for (const h of handles) void h.remove(); };
}

/** Before signing out: this phone stops receiving this account's notifications. Never holds the sign-out up for more than a moment. */
export async function stopPush(): Promise<void> {
  if (!token) return;
  const current = token;
  token = null;
  try {
    await Promise.race([httpPost('/push/unsubscribe', { token: current }), new Promise((resolve) => { setTimeout(resolve, 2500); })]);
  } catch {
    // offline: the server moves the token to whoever signs in on this phone next
  }
}
