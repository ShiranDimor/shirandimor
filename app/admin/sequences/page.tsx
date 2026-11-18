'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  sequenceKey: string;
  sequenceName: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  startedAt: string;
  lastStepSent: number;
  totalSteps: number;
  currentStepTitle: string | null;
  lastSentAt: string | null;
  stoppedAt: string | null;
  stoppedReason: string | null;
  stoppedReasonCode: string | null;
  active: boolean;
};

function formatDateTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminSequencesPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  // ברירת מחדל "פעילים" - מי שכבר סיים את כל הרצף (או נעצר) לא נותר בתצוגה הרגילה, כדי שהעמוד
  // יישאר ממוקד במי שבאמת עדיין בתהליך. אפשר עדיין לעבור ל"הכל"/"הסתיימו" אם צריך לבדוק משהו
  const [filter, setFilter] = useState<'all' | 'active' | 'stopped'>('active');
  const [busy, setBusy] = useState('');

  useEffect(() => { checkAdmin(); }, []);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }
    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadRows();
  }

  async function loadRows() {
    setLoading(true);
    const res = await fetch('/api/admin/sequences', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows || []);
    }
    setLoading(false);
  }

  // פותח וואטסאפ עם הודעה מוכנה מראש, בלי שליחה אוטומטית - שירן בודקת ולוחצת שליחה בעצמה
  // (אותו דפוס בדיוק כמו ב-/admin/subscribers)
  function sendWhatsAppReminder(row: Row) {
    if (!row.phone) return;
    const firstName = (row.name || '').trim().split(' ')[0] || '';
    const text = `היי${firstName ? ' ' + firstName : ''}, שמתי לב שההתראות באתר אצלך לא מופעלות - ככה מפספסים עדכונים חשובים. כדאי להיכנס לאתר וללחוץ על הפעמון כדי להפעיל אותן מחדש.\n\nתודה!\nשירן`;
    const phoneDigits = row.phone.replace(/\D/g, '').replace(/^0/, '972');
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function handleResend(row: Row) {
    if (row.lastStepSent < 1) { window.alert('עדיין לא נשלחה אף הודעה - אין מה לשלוח שוב'); return; }
    if (!window.confirm(`לשלוח שוב ל-${row.name || row.phone || row.email} את ההודעה: "${row.currentStepTitle}"?`)) return;
    setBusy(row.id);
    const res = await fetch('/api/admin/sequences/resend', {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ progressId: row.id, stepIndex: row.lastStepSent }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (res.ok) window.alert('נשלח שוב ✅');
    else window.alert(`לא נשלח: ${data.error || 'שגיאה לא ידועה'}`);
  }

  if (checking) return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  if (!userEmail) return <div className="wrap"><p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p></div>;
  if (!isAdmin) return <div className="wrap"><p style={{ padding: '40px 0', textAlign: 'center' }}>אין הרשאת ניהול לחשבון המחובר ({userEmail})</p></div>;

  const filtered = rows.filter((r) => filter === 'all' || (filter === 'active' ? r.active : !r.active));

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin" className="nav-link">← לניהול</Link>
        </div>
      </header>

      <div className="section-label">
        <h2>רצפי קליטה/טיפוח - מי קיבל מה ומתי</h2>
        <span className="count">{filtered.length}</span>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '14px', lineHeight: 1.6 }}>
        כל איש קשר שנמצא (או נמצא בעבר) ברצף "ברוכים הבאים" (מנויים חדשים) או "טיפוח" (הפעיל/ה התראות בלי מנוי) - באיזה צעד הוא/היא, מתי נשלחה ההודעה האחרונה, ואם הרצף נעצר - למה. אפשר לשלוח שוב את ההודעה האחרונה שנשלחה.
      </p>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        <button className={filter === 'active' ? 'btn-primary' : 'btn-outline'} style={{ padding: '6px 14px', fontSize: '12.5px' }} onClick={() => setFilter('active')}>פעילים</button>
        <button className={filter === 'stopped' ? 'btn-primary' : 'btn-outline'} style={{ padding: '6px 14px', fontSize: '12.5px' }} onClick={() => setFilter('stopped')}>הסתיימו/נעצרו</button>
        <button className={filter === 'all' ? 'btn-primary' : 'btn-outline'} style={{ padding: '6px 14px', fontSize: '12.5px' }} onClick={() => setFilter('all')}>הכל</button>
        <button className="btn-outline" style={{ padding: '6px 14px', fontSize: '12.5px', marginRight: 'auto' }} onClick={loadRows} disabled={loading}>{loading ? '...' : '🔄 רענון'}</button>
      </div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && filtered.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין רשומות להצגה</p>}

      {!loading && filtered.map((row) => (
        <div key={row.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{row.name || row.phone || row.email || 'ללא שם'}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                {row.phone}{row.phone && row.email ? ' · ' : ''}{row.email}
              </div>
            </div>
            <div style={{ textAlign: 'left', fontSize: '11.5px', color: row.active ? 'var(--profit)' : 'var(--text-tertiary)' }}>
              {row.active ? '🟢 פעיל' : `⏹ ${row.stoppedReason}`}
            </div>
          </div>

          <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div><strong>{row.sequenceName}</strong> - צעד {row.lastStepSent} מתוך {row.totalSteps}</div>
            {row.currentStepTitle && <div>הודעה אחרונה שנשלחה: &quot;{row.currentStepTitle}&quot;</div>}
            <div>התחיל/ה: {formatDateTime(row.startedAt)} · נשלח לאחרונה: {formatDateTime(row.lastSentAt)}</div>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => handleResend(row)} disabled={busy === row.id || row.lastStepSent < 1}>
              {busy === row.id ? '...' : '📤 שליחה חוזרת של ההודעה האחרונה'}
            </button>
            {row.stoppedReasonCode === 'push_invalid' && row.phone && (
              <button
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: '12.5px', color: '#25D366', borderColor: '#25D366' }}
                onClick={() => sendWhatsAppReminder(row)}
                title="שליחת תזכורת בוואטסאפ להפעיל התראות"
              >
                🔔 תזכורת בוואטסאפ
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
