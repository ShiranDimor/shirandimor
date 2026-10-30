// Service Worker להתראות פוש - לא עושה caching של דפים (לא PWA אופליין מלא), התפקיד
// היחיד שלו כרגע הוא לקבל אירועי push מהשרת ולהציג אותם כהתראה, ולפתוח את האתר בלחיצה עליה
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'שירן דימור', body: 'יש עדכון חדש בתיק', url: '/portfolio' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // תוכן לא תקין - משתמשים בברירת המחדל
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
