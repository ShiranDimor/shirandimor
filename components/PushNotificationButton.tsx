'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ממיר את מפתח ה-VAPID הציבורי (מחרוזת base64) לפורמט הבינארי ש-pushManager.subscribe דורש
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Status = 'checking' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied';

// כפתור הפעלת התראות פוש - לדפדפן שתומך (Chrome/Edge/Firefox בכל פלטפורמה, Safari רק אחרי
// שהאתר נוסף למסך הבית ב-iOS). שומר את הרישום בטבלת push_subscriptions כדי שהשרת יוכל לשלוח
// התראות בהמשך (עסקה חדשה, סטופ לוס, עסקה נסגרה וכו')
export default function PushNotificationButton() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (isIos && !isStandalone) {
      setStatus('needs-install');
      return;
    }

    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? 'on' : 'off');
    } catch (e) {
      setStatus('off');
    }
  }

  async function handleEnable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setBusy(false);
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VAPID key לא מוגדר');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const { data: { session } } = await supabase.auth.getSession();
      const subJson = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });

      setStatus('on');
    } catch (e) {
      console.error('שגיאה בהפעלת התראות פוש', e);
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
      }
      setStatus('off');
    } catch (e) {
      console.error('שגיאה בביטול התראות פוש', e);
    }
    setBusy(false);
  }

  if (status === 'checking' || status === 'unsupported') return null;

  if (status === 'needs-install') {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '10px' }}>
        כדי לקבל התראות ב-iPhone: קודם מוסיפים את האתר למסך הבית (שיתוף ← הוספה למסך הבית), ואז פותחים אותו משם.
      </p>
    );
  }

  if (status === 'denied') {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '10px' }}>
        ההתראות חסומות בדפדפן - אפשר לאפשר אותן מהגדרות האתר בדפדפן.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="btn-outline"
      style={{ width: '100%', marginBottom: '10px' }}
      onClick={status === 'on' ? handleDisable : handleEnable}
      disabled={busy}
    >
      {busy ? '...' : status === 'on' ? '🔔 התראות פוש פעילות - לכיבוי' : '🔔 הפעלת התראות פוש'}
    </button>
  );
}
