'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('מתחברת...');

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setStatus('הכניסה נכשלה. נסי שוב.');
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
      router.push('/portfolio');
    } else {
      setStatus('החשבון עדיין לא מאושר כמנוי.');
      setTimeout(() => router.push('/subscribe'), 2000);
    }
  }

  return (
    <div className="wrap">
      <header><div className="brand">מסחר <span>אחראי</span> במניות</div></header>
      <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>{status}</p>
    </div>
  );
}
