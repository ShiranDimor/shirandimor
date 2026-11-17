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

  // התראות עסקה (kind='trade') מורגשות יותר מכל שאר הסוגים (שיעור/לייב/מודעה) - זה מה שבאמת
  // מעניין בזמן אמת, ושירן שולחת כמה התראות אחרות ביום שלא רוצות "לטשטש" אותן. requireInteraction
  // עובד בכל פלטפורמה (נשארת על המסך עד שסוגרים, לא נעלמת אחרי כמה שניות); רטט עובד רק באנדרואיד
  // (ספארי/iOS לא תומכים ברטט מאתרים בכלל - מגבלת הפלטפורמה, לא ניתנת לעקיפה)
  const isTrade = data.kind === 'trade';

  // אישור קבלה אמיתי לשרת - לא רק ששירות הפוש (גוגל/אפל) הסכים לקבל את הבקשה לשליחה (שזה
  // כל מה ש-sent_count ב-webPush.ts מדד עד עכשיו), אלא שההתראה באמת הוצגה כאן, במכשיר הזה.
  // רק כשיש logId (מגיע רק מ-sendPushToActiveSubscribers/NonSubscribers/Everyone, לא מבדיקה-
  // לעצמי/תזכורת ישירה) - שגיאה כאן לא אמורה למנוע מההתראה עצמה להישאר מוצגת למשתמש/ת
  const confirmReceipt = data.logId
    ? self.registration.pushManager
        .getSubscription()
        .then((sub) => sub && fetch('/api/push/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logId: data.logId, endpoint: sub.endpoint }),
        }))
        .catch(() => {})
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url },
        requireInteraction: isTrade,
        ...(isTrade ? { vibrate: [250, 100, 250, 100, 250] } : {}),
      }),
      confirmReceipt,
    ])
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
        if (client.url === targetUrl && 'focus' in client) {
          // טאב שכבר בדיוק ביעד (למשל התראה נוספת על אותה הודעה) - focus() לבד לא מבטיח
          // שהדף יביא נתונים טריים (אירועי visibility/focus לא תמיד נורים באופן אמין כשחוזרים
          // מהתראה, תלוי בדפדפן/מערכת), אז שולחים גם הודעה מפורשת שהדף יודע להקשיב לה ולרענן
          client.postMessage({ type: 'refresh-data' });
          return client.focus();
        }
      }
      // אין טאב פתוח בדיוק ביעד - פותחים טאב/חלון חדש, לא מנסים לנווט טאב קיים אליו.
      // client.navigate() לכתובת שזהה בנתיב שלה אבל שונה רק ב-hash (המצב הנפוץ כאן - כל
      // ההתראות על לוח המודעות מצביעות ל-/announcements עם hash שונה לכל הודעה) עלול להיחשב
      // בדפדפן כניווט "באותו מסמך" בלי טעינה מחדש אמיתית של הדף - בדיוק מה שהשאיר תוכן ישן
      // על המסך למרות כל שאר התיקונים. openWindow תמיד טעינה אמיתית, בלי האי-ודאות הזו
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
