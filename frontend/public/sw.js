/* StraySafe service worker: shows push notifications and opens the right page when one is tapped
   (PUSH_NOTIFICATION_IMPLEMENTATION.md P11). No caching: the app always loads fresh from the server. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
    const title = data.title || 'StraySafe';
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || 'You have a new StraySafe update.',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.tag || undefined,          // a newer push about the same thing replaces the older one
        renotify: Boolean(data.tag),
        data: { url: data.url || '/', notificationId: data.notification_id || null },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { url = '/', notificationId = null } = event.notification.data || {};
    const target = new URL(url, self.location.origin);
    if (notificationId) target.searchParams.set('pushNotif', String(notificationId));  // the app marks it read
    event.waitUntil((async () => {
        const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
        if (tab) {
            await tab.focus();
            tab.postMessage({ type: 'straysafe-open', url: target.pathname + target.search });
            return;
        }
        await self.clients.openWindow(target.href);
    })());
});
