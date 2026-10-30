'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

// ממיר את מפתח ה-VAPID הציבורי (מחרוזת base64) לפורמט הבינארי ש-pushManager.subscribe דורש
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Status = 'checking' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'lead-form';

type Props = {
  // 'hero' - גרסה בולטת לכפתור הראשי בעמוד הבית (צבע מלא + תג "ללא עלות"), עם ניסוח שמדבר על
  // הצטרפות לקהילה/עדכונים בזמן אמת במקום הניסוח הכללי של הפעמון. 'default' הוא הכפתור הרגיל
  // (/portfolio, הפעמון, אדמין) - ללא שינוי בהתנהגות הקיימת
  variant?: 'default' | 'hero';
  // כשמגיעים מקישור עם ?join=1 (מעמודים אחרים שמפנים לכאן) - פותח ישר את שער ההרשמה בלי
  // ללחוץ קודם על הכפתור, בדיוק כמו ההתנהגות הישנה של showLeadForm=true מה-URL
  autoOpenLeadForm?: boolean;
};

// כפתור הפעלת התראות פוש - לדפדפן שתומך (Chrome/Edge/Firefox בכל פלטפורמה, Safari רק אחרי
// שהאתר נוסף למסך הבית ב-iOS). מנוי מחובר נרשם ישר; מי שאינו מנוי (גם בלי להיות מחובר בכלל)
// עובר קודם "שער הרשמה" קצר (שם+נייד+מייל) שהופך אותו לליד, בדיוק כמו טפסי ליד אחרים באתר
export default function PushNotificationButton({ variant = 'default', autoOpenLeadForm = false }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let subscriberNow = false;
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role, subscription_status').eq('id', user.id).maybeSingle();
      subscriberNow = profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active');
      setIsSubscriber(subscriberNow);
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
      if (sub) {
        setStatus('on');
      } else if (autoOpenLeadForm && !subscriberNow) {
        setStatus('lead-form');
      } else {
        setStatus('off');
      }
    } catch (e) {
      setStatus(autoOpenLeadForm && !subscriberNow ? 'lead-form' : 'off');
    }
  }

  async function subscribeDevice(leadDetails?: { name: string; phone: string; email: string }) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return false;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) throw new Error('VAPID key לא מוגדר');

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const subJson = sub.toJSON();

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys, ...leadDetails }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'שגיאה');
    }
    return true;
  }

  async function handleEnable() {
    if (!isSubscriber) {
      setStatus('lead-form');
      return;
    }
    setBusy(true);
    try {
      const ok = await subscribeDevice();
      if (ok) setStatus('on');
    } catch (e) {
      console.error('שגיאה בהפעלת התראות פוש', e);
    }
    setBusy(false);
  }

  async function handleLeadFormSubmit() {
    if (!name.trim() || !/^05\d{8}$/.test(phone)) {
      setFormError('צריך שם ומספר נייד תקין (לדוגמה 0501234567)');
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      const ok = await subscribeDevice({ name: name.trim(), phone, email: email.trim() });
      if (ok) setStatus('on');
    } catch (e) {
      setFormError('משהו השתבש - כדאי לנסות שוב');
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
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
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

  if (status === 'lead-form') {
    return (
      <div className="journal-form" style={{ marginBottom: '10px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          {variant === 'hero'
            ? 'קהילת הסוחרים שבונים תיק השקעות וסוחרים ביחד איתי בזמן אמת - עדכונים על עסקאות, שיעורים ולייבים ישר לנייד, בלי לפתוח חשבון ובלי עלות.'
            : 'השארת פרטים פותחת התראות על עסקאות ועדכונים מהתיק - בלי לפתוח חשבון ובלי עלות.'}
        </p>
        <div className="field" style={{ marginBottom: '8px' }}>
          <ClearableInput type="text" value={name} onChange={(e) => setName(e.target.value)} onClear={() => setName('')} placeholder="שם מלא" />
        </div>
        <div className="field" style={{ marginBottom: '8px' }}>
          <ClearableInput type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} onClear={() => setPhone('')} placeholder="0501234567" maxLength={10} />
        </div>
        <div className="field" style={{ marginBottom: '10px' }}>
          <ClearableInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} onClear={() => setEmail('')} placeholder="אימייל (לא חובה)" />
        </div>
        {formError && <p style={{ color: 'var(--loss)', fontSize: '12px', marginBottom: '8px' }}>{formError}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={handleLeadFormSubmit} disabled={busy}>
            {busy ? 'שולחים...' : '🔔 הפעלת התראות'}
          </button>
          <button type="button" className="btn-outline" style={{ width: 'auto', flex: 'none', padding: '12px 16px' }} onClick={() => setStatus('off')}>ביטול</button>
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    if (status === 'on') {
      return (
        <p style={{ fontSize: '13.5px', color: 'var(--profit)', fontWeight: 700, textAlign: 'center', marginBottom: '6px' }}>
          ✓ ההתראות שלכם פעילות
          <button type="button" onClick={handleDisable} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11.5px', fontWeight: 400, textDecoration: 'underline', cursor: 'pointer', marginRight: '8px', padding: 0 }}>
            לכיבוי
          </button>
        </p>
      );
    }
    return (
      <>
        <button type="button" className="cta-main" style={{ border: 'none', cursor: 'pointer', width: '100%' }} onClick={handleEnable} disabled={busy}>
          {busy ? '...' : 'הצטרפות לעדכונים בזמן אמת'}
          <span className="free-tag">ללא עלות</span>
        </button>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '8px', marginBottom: '10px' }}>
          באנדרואיד זה עובד ישר. באייפון צריך קודם להוסיף את האתר למסך הבית (שיתוף ← הוספה למסך הבית).
        </p>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn-outline"
        style={{ width: '100%', marginBottom: '6px' }}
        onClick={status === 'on' ? handleDisable : handleEnable}
        disabled={busy}
      >
        {busy ? '...' : status === 'on' ? '🔔 העדכונים שלי פעילים - לכיבוי' : '🔔 אישור קבלת עדכונים'}
      </button>
      {status === 'off' && (
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '10px' }}>
          באנדרואיד זה עובד ישר. באייפון צריך קודם להוסיף את האתר למסך הבית (שיתוף ← הוספה למסך הבית).
        </p>
      )}
    </>
  );
}
