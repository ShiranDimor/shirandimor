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
  }, []);

  async function handleCallback() {
    // קישורי כניסה שנוצרים דרך supabaseAdmin.auth.admin.generateLink חוזרים לכאן עם ?code=...
    // (זרימת PKCE) - בלי exchangeCodeForSession מפורש הקוד הזה פשוט לא נוצל, ו-getSession
    // תמיד מחזירה session ריקה, בלי שום שגיאה ברורה - זה מה שגרם לכניסה מקישור המייל להיכשל
    const code = new URL(window.location.href).searchParams.get('code');
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setStatus('הכניסה נכשלה. אפשר לנסות שוב.');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setStatus('הכניסה נכשלה. אפשר לנסות שוב.');
      setTimeout(() => router.push('/login'), 2000);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
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
