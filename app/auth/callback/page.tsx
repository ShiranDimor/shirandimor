'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('מתבצעת התחברות...');

  useEffect(() => {
    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeByRole(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile?.role === 'admin') {
      router.push('/admin');
    } else if (profile?.role === 'subscriber') {
      router.push('/journal');
    } else {
      setStatus('החשבון עדיין לא מאושר כמנוי.');
      setTimeout(() => router.push('/subscribe'), 2000);
    }
  }

  async function handleCallback() {
    let settled = false;

    // מאזינים ל-SIGNED_IN במקום להסתמך רק על getSession() חד-פעמי - קישורי כניסה (magiclink)
    // חוזרים עם הטוקנים ב-hash של ה-URL (#access_token=...), וה-SDK מעבד אותו ברקע באופן
    // אסינכרוני; קריאה מיידית ל-getSession() יכולה לרוץ לפני שהעיבוד הזה הסתיים ולהחזיר
    // session ריקה בטעות, למרות שה-Login עצמו כבר הצליח בפועל מול Supabase
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !settled) {
        settled = true;
        listener.subscription.unsubscribe();
        routeByRole(session.user.id);
      }
    });

    // תמיכה גם בקישורים מסוג PKCE (?code=...), למקרה שסוג הזרימה ישתנה בעתיד
    const code = new URL(window.location.href).searchParams.get('code');
    if (code) {
      await supabase.auth.exchangeCodeForSession(code).catch(() => {});
    }

    // בדיקה מיידית - למקרה שה-session כבר הייתה מוכנה לפני שההאזנה הספיקה להירשם
    const { data: { session } } = await supabase.auth.getSession();
    if (session && !settled) {
      settled = true;
      listener.subscription.unsubscribe();
      routeByRole(session.user.id);
      return;
    }

    // רק אם אחרי כמה שניות עדיין אין session - זו כנראה כניסה שבאמת נכשלה (קישור פג תוקף/כבר נוצל)
    setTimeout(() => {
      if (!settled) {
        listener.subscription.unsubscribe();
        setStatus('הכניסה נכשלה. אפשר לנסות שוב.');
        setTimeout(() => router.push('/login'), 2000);
      }
    }, 4000);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>
      <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>{status}</p>
    </div>
  );
}
