'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { buildGoogleCalendarUrl, buildIcsDataUri } from '@/lib/calendar';
import ClearableInput from '@/components/ClearableInput';

type Live = {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  joinInfo: string | null;
  registered: boolean;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export default function LivesPage() {
  const [lives, setLives] = useState<Live[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIsSubscriber, setViewerIsSubscriber] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [leadConfirmedId, setLeadConfirmedId] = useState<string | null>(null);

  useEffect(() => {
    loadLives();
  }, []);

  async function loadLives() {
    setLoading(true);
    setCheckingAuth(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/lives', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setLives(data.lives || []);
      setViewerIsSubscriber(!!data.viewerIsSubscriber);
    }
    setLoading(false);
    setCheckingAuth(false);
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, '').slice(0, 10));
  }

  async function registerSubscriber(liveId: string) {
    setSubmittingId(liveId);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/lives/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ liveId }),
    });
    setSubmittingId(null);
    if (res.ok) {
      trackFunnelEvent('live_registered');
      loadLives();
    } else {
      setError('משהו השתבש - כדאי לנסות שוב בעוד רגע');
    }
  }

  async function submitLead(liveId: string) {
    if (!name || !phone) {
      setError('צריך למלא שם ומספר נייד');
      return;
    }
    if (!/^05\d{8}$/.test(phone)) {
      setError('מספר נייד לא תקין - לדוגמה 0501234567');
      return;
    }
    setSubmittingId(liveId);
    setError('');
    try {
      const res = await fetch('/api/lives/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveId, name, phone, email }),
      });
      const data = await res.json().catch(() => null);
      if (data?.isSubscriber) {
        // מנוי שמילא את הטופס בלי להיות מחובר - מציגים לו ישר את פרטי ההצטרפות
        setLives((prev) => prev.map((l) => (l.id === liveId ? { ...l, registered: true, joinInfo: data.joinInfo } : l)));
      } else {
        trackFunnelEvent('live_registration_lead', { phone, email });
        setLeadConfirmedId(liveId);
      }
      setOpenFormId(null);
    } catch (e) {
      setError('משהו השתבש - כדאי לנסות שוב בעוד רגע');
    }
    setSubmittingId(null);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title">לייבים</div>
      <div className="form-sub">מפגשים חיים - שאלות בזמן אמת, לא עוד הקלטה</div>

      {(loading || checkingAuth) && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>טוענים...</p>}
      {!loading && lives.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>אין כרגע לייבים קרובים - שווה לחזור בקרוב</p>}

      {!loading && lives.map((live) => (
        <div key={live.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--teal)', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{live.title}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--teal)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>{formatDateTime(live.scheduledAt)}</div>
          {live.description && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>{live.description}</p>}

          {live.registered && live.joinInfo && (
            <div style={{ background: 'var(--profit-bg)', border: '1px solid var(--profit)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '13px', whiteSpace: 'pre-line' }}>
              ✓ נרשמת! פרטי ההצטרפות: {live.joinInfo}
            </div>
          )}
          {live.registered && !live.joinInfo && (
            <div style={{ background: 'var(--profit-bg)', border: '1px solid var(--profit)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '13px' }}>
              ✓ נרשמת! פרטי ההצטרפות יישלחו בקרוב.
            </div>
          )}
          {leadConfirmedId === live.id && (
            <div style={{ background: 'var(--profit-bg)', border: '1px solid var(--profit)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', fontSize: '13px' }}>
              ✓ הפרטים נקלטו - שירן תיצור איתך קשר עם פרטי ההצטרפות.
            </div>
          )}

          {live.registered && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a href={buildGoogleCalendarUrl(live.title, live.description || '', live.scheduledAt)} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ fontSize: '12.5px', padding: '8px 12px', textDecoration: 'none' }}>
                הוספה ליומן Google
              </a>
              <a href={buildIcsDataUri(live.title, live.description || '', live.scheduledAt)} download={`${live.title}.ics`} className="btn-outline" style={{ fontSize: '12.5px', padding: '8px 12px', textDecoration: 'none' }}>
                הורדה ליומן אחר
              </a>
            </div>
          )}

          {!live.registered && leadConfirmedId !== live.id && (
            <>
              {viewerIsSubscriber ? (
                <button type="button" className="btn-primary" onClick={() => registerSubscriber(live.id)} disabled={submittingId === live.id}>
                  {submittingId === live.id ? 'נרשמים...' : 'הרשמה ללייב ←'}
                </button>
              ) : openFormId === live.id ? (
                <div>
                  <div className="field" style={{ marginBottom: '8px' }}>
                    <ClearableInput type="text" value={name} onChange={(e) => setName(e.target.value)} onClear={() => setName('')} placeholder="שם מלא" />
                  </div>
                  <div className="field" style={{ marginBottom: '8px' }}>
                    <ClearableInput type="tel" inputMode="numeric" value={phone} onChange={(e) => handlePhoneChange(e.target.value)} onClear={() => setPhone('')} placeholder="0501234567" maxLength={10} />
                  </div>
                  <div className="field" style={{ marginBottom: '10px' }}>
                    <ClearableInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} onClear={() => setEmail('')} placeholder="אימייל (לא חובה)" />
                  </div>
                  {error && <p style={{ color: 'var(--loss)', fontSize: '12px', marginBottom: '8px' }}>{error}</p>}
                  <button type="button" className="btn-primary" onClick={() => submitLead(live.id)} disabled={submittingId === live.id}>
                    {submittingId === live.id ? 'שולחים...' : 'הרשמה ←'}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-primary" onClick={() => { setOpenFormId(live.id); setError(''); }}>
                  הרשמה ללייב ←
                </button>
              )}
            </>
          )}
        </div>
      ))}

      <Link className="cta-sub-link" href="/subscribe">מנויים נרשמים ללייבים בלחיצה אחת - להכיר את קבוצת הסוחרים <span>←</span></Link>

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
