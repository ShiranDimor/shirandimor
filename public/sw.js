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
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // חיפוש התאמה מדויקת, לא includes() - "/admin/lives".includes("/lives") הוא true,
      // אז מי שהיה פתוח בטעות בעמוד הניהול "קפץ" חזרה לשם במקום לעבור ליעד האמיתי של ההתראה
      for (const client of clientsArr) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      // אין טאב פתוח בדיוק ביעד - לוקחים טאב קיים (אם יש) וממנים אותו ליעד, במקום לפתוח
      // חלון/טאב נוסף על כל לחיצה על התראה
      const existing = clientsArr.find((c) => 'focus' in c && 'navigate' in c);
      if (existing) return existing.focus().then(() => existing.navigate(targetUrl));
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
