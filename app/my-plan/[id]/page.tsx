'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type ProgressData = {
  name: string | null;
  rule: string;
  mission: string;
  threeThings: string[];
  checkins: { checkin_date: string; followed_rule: boolean }[];
  streak: number;
  todayChecked: boolean;
  today: string;
};

export default function MyPlanProgressPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/trading-plan/progress?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      setData(await res.json());
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }

  async function checkIn(followedRule: boolean) {
    setSaving(true);
    await fetch('/api/trading-plan/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, followedRule }),
    }).catch(() => {});
    await load();
    setSaving(false);
  }

  const firstName = (data?.name || '').trim().split(' ')[0] || '';

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {notFound && !loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>העמוד לא נמצא</p>}

      {data && !loading && (
        <>
          <div className="form-title" style={{ fontSize: '22px' }}>המעקב האישי שלך{firstName ? `, ${firstName}` : ''}</div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--teal)' }}>{data.streak}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{data.streak === 1 ? 'יום ברצף' : 'ימים ברצף'}</div>
          </div>

          <div className="tp-mission-box tp-rule-box">
            <div className="tp-mission-label">הכלל שלך</div>
            <div className="tp-mission-text">{data.rule}</div>
          </div>

          {!data.todayChecked ? (
            <div className="tp-question-card" style={{ textAlign: 'center' }}>
              <div className="tp-question-title" style={{ marginBottom: '14px' }}>עמדת היום בכלל שלך?</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => checkIn(true)} disabled={saving}>כן ✓</button>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => checkIn(false)} disabled={saving}>לא הפעם</button>
              </div>
            </div>
          ) : (
            <p className="tp-personal-note" style={{ textAlign: 'center', marginBottom: '20px' }}>
              ✓ סימנת להיום - חוזרים מחר
            </p>
          )}

          <div className="tp-diagnosis-section">
            <div className="tp-diagnosis-label">3 הדברים לשבוע הראשון</div>
            <div className="tp-tasks-list">
              {data.threeThings.map((t, i) => (
                <div key={t} className="tp-tasks-item">
                  <span className="tp-tasks-num">{i + 1}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tp-mission-box" style={{ marginTop: '18px' }}>
            <div className="tp-mission-label">המשימה שלך ל-30 יום</div>
            <div className="tp-mission-text">{data.mission}</div>
          </div>
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
