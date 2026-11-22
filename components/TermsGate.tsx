'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'blocked' | 'clear';

// חסימה מלאה עד שמנוי/ה מאשר/ת את תקנון השימוש בצ'קבוקס - פעם אחת, בכניסה הראשונה לאתר.
// גלובלי (ב-layout הראשי) כדי שזה יתפוס בכל עמוד, לא רק ב-/account - בדיוק כמו NotificationBell/
// DorChatWidget שכבר רצים בכל עמוד בלי קשר לאיפה המשתמש/ת נוחת/ת. לא נוגע במבקרים/ות אנונימיים/ות
// (בלי session) ולא במי שאינו מנוי/ה (ליד, אדמין) - רק role='subscriber' עם terms_accepted_at ריק.
// מנויים פעילים מלפני הפיצ'ר הזה גובו אוטומטית במיגרציה (ר' supabase/migrations) ולא יראו את זה
export default function TermsGate() {
  const [status, setStatus] = useState<Status>('idle');
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    check();
  }, []);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus('clear'); return; }

    const { data: profile } = await supabase.from('profiles').select('role, subscription_status, terms_accepted_at').eq('id', user.id).maybeSingle();
    // רק מנוי/ה פעיל/ה כרגע - מי שביטל/ה (role נשאר 'subscriber' לצמיתות, ר' lib/entitlement.ts)
    // כבר לא אמור/ה לראות את זה, אין טעם לחסום מי שאין לו/ה גישה בכלל
    if (!profile || profile.role !== 'subscriber' || profile.subscription_status !== 'active' || profile.terms_accepted_at) {
      setStatus('clear');
      return;
    }

    setStatus('blocked');
  }

  async function handleConfirm() {
    if (!checked || saving) return;
    setSaving(true);
    setError('');

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/account/accept-terms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });

    setSaving(false);

    if (!res.ok) {
      setError('משהו השתבש - אפשר לנסות שוב');
      return;
    }

    setStatus('clear');
  }

  if (status !== 'blocked') return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,24,28,0.97)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '400px', width: '100%', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-hairline-strong)', borderRadius: '18px', padding: '26px 22px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>לפני שממשיכים</div>
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '18px' }}>
          כדי להמשיך להשתמש באתר, צריך לקרוא ולאשר את תקנון השימוש.
        </p>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px', cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: '3px', width: '17px', height: '17px', flexShrink: 0 }} />
          <span>
            קראתי ואני מאשר/ת את{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>תקנון השימוש</a>
          </span>
        </label>

        {error && <p style={{ fontSize: '12.5px', color: 'var(--loss)', marginBottom: '12px' }}>{error}</p>}

        <button className="btn-primary" onClick={handleConfirm} disabled={!checked || saving}>
          {saving ? '...' : 'מאשר/ת'}
        </button>
      </div>
    </div>
  );
}
