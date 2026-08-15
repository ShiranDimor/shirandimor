'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!cancelled) setError('הקישור לא תקין או שפג תוקפו. אפשר לחזור למסך הכניסה ולנסות שוב.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;

      if (profile?.role === 'admin') router.replace('/admin');
      else if (profile?.role === 'subscriber') router.replace('/portfolio');
      else router.replace('/subscribe');
    }

    finish();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="wrap">
      {error ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', marginBottom: '14px' }}>{error}</p>
          <a href="/login" style={{ color: 'var(--lavender)', fontSize: '13px' }}>← חזרה לכניסה</a>
        </div>
      ) : (
        <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>מתחברים...</p>
      )}
    </div>
  );
}
