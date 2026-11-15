'use client';

// לשונית "בקרה" בסטודיו התוכן: דוח לכל יום - מה עלה, מה עבד, מה לא, מה המסקנות ומה כבר
// שונה לימים הבאים. שירן קוראת ומתערבת רק אם צריך; הדוח נכתב כל לילה ע"י ריצת הבקרה.
import { useEffect, useState } from 'react';

type Report = {
  id: string;
  report_date: string;
  headline: string;
  published_summary: string | null;
  wins: string | null;
  issues: string | null;
  conclusions: string | null;
  actions_taken: string | null;
  needs_shiran: string | null;
  metrics: Record<string, number | string> | null;
};

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const METRIC_LABELS: Record<string, string> = {
  followers: 'עוקבים באינסטגרם',
  followers_change: 'שינוי בעוקבים',
  reach: 'חשיפה',
  saves: 'שמירות',
  shares: 'שיתופים',
  video_views: 'צפיות בריילס',
  site_visits_social: 'כניסות לאתר מהסושיאל',
  trading_plan_started: 'התחילו תוכנית מסחר',
  payment_clicks: 'לחצו על ₪1',
  new_subscribers: 'מנויים חדשים',
};

function Section({ title, text, tone }: { title: string; text: string | null; tone?: 'good' | 'bad' | 'ask' }) {
  if (!text?.trim()) return null;
  const color = tone === 'good' ? 'var(--profit)' : tone === 'bad' ? 'var(--loss)' : tone === 'ask' ? 'var(--lavender)' : 'var(--text-secondary)';
  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color, marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13.5px', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{text}</div>
    </div>
  );
}

export default function DailyReports({ authHeaders }: { authHeaders: () => Promise<Record<string, string>> }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/marketing/reports', { headers: await authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'שגיאה');
        setReports(data.reports);
        if (data.reports?.[0]) setOpen(data.reports[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בטעינת הדוחות');
      }
    })();
    // נטען פעם אחת כשהלשונית נפתחת (authHeaders נוצרת מחדש בכל רינדור של העמוד)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p style={{ fontSize: '13px', color: 'var(--loss)' }}>{error}</p>;
  if (!reports) return <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>;
  if (reports.length === 0) {
    return (
      <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', lineHeight: 1.7 }}>
        הדוח הראשון יופיע כאן הלילה, אחרי שהתוכן של היום עלה.<br />כל לילה ב-23:40: מה עלה, מה עבד, מה לא, ומה משנים למחר.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {reports.map((r) => {
        const d = new Date(r.report_date + 'T12:00:00');
        const isOpen = open === r.id;
        const metrics = Object.entries(r.metrics || {}).filter(([k]) => METRIC_LABELS[k]);
        return (
          <div key={r.id} style={{ background: 'var(--bg-surface)', border: `1px solid ${isOpen ? 'var(--border-hairline-strong)' : 'var(--border-hairline)'}`, borderRadius: '16px', padding: '14px 16px' }}>
            <button
              onClick={() => setOpen(isOpen ? null : r.id)}
              style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right', color: 'var(--text-primary)' }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>יום {DAY_NAMES[d.getDay()]} · {d.getDate()}.{d.getMonth() + 1}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px', lineHeight: 1.45 }}>{r.headline}</div>
              {r.needs_shiran?.trim() && <div style={{ fontSize: '12px', color: 'var(--lavender)', marginTop: '6px', fontWeight: 600 }}>יש כאן משהו שמחכה לך</div>}
            </button>
            {isOpen && (
              <div>
                {metrics.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginTop: '14px' }}>
                    {metrics.map(([k, v]) => (
                      <div key={k} style={{ background: 'var(--bg-surface-raised)', borderRadius: '10px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{METRIC_LABELS[k]}</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', marginTop: '2px' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Section title="מה עלה היום" text={r.published_summary} />
                <Section title="מה עבד" text={r.wins} tone="good" />
                <Section title="מה לא עבד / תקלות" text={r.issues} tone="bad" />
                <Section title="מסקנות" text={r.conclusions} />
                <Section title="מה כבר שיניתי לימים הבאים" text={r.actions_taken} />
                <Section title="מחכה להחלטה שלך" text={r.needs_shiran} tone="ask" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
