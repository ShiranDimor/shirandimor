'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type DayStatus = 'followed' | 'missed' | 'no_checkin' | 'today_pending' | 'future';

type ProgressData = {
  name: string | null;
  profileTitle: string;
  rule: string;
  dream: string | null;
  fear: string | null;
  mission: string;
  threeThings: string[];
  checkins: { checkin_date: string; followed_rule: boolean }[];
  streak: number;
  todayChecked: boolean;
  today: string;
  dayNumber: number;
  totalDays: number;
  programDays: { date: string; dayNumber: number; status: DayStatus }[];
};

const DAY_COLORS: Record<DayStatus, string> = {
  followed: '#4FB876',
  missed: '#C9635E',
  no_checkin: '#2a3040',
  today_pending: '#E8A33D',
  future: '#181d29',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// לינק להוספת תזכורת יומית ביומן גוגל - כדי שהמשתמש/ת יוכלו ליצור לעצמם תזכורת בלי תלות בנו
function buildReminderLink(planUrl: string): string {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'עמדתי היום בכלל שלי? - תוכנית המסחר',
    details: `רגע קצר לסמן אם עמדת בכלל האישי שלך היום: ${planUrl}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    recur: 'RRULE:FREQ=DAILY;COUNT=30',
    ctz: 'Asia/Jerusalem',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function ProgressRing({ dayNumber, totalDays }: { dayNumber: number; totalDays: number }) {
  const size = 168;
  const strokeWidth = 13;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, dayNumber / totalDays);
  const offset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: 'drop-shadow(0 0 14px rgba(79,201,196,0.35))' }}>
      <defs>
        <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4FC9C4" />
          <stop offset="100%" stopColor="#E8A33D" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#ringGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#fff', fontSize: '34px', fontWeight: 800 }}>{dayNumber}</text>
      <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-tertiary)', fontSize: '11.5px' }}>{`מתוך ${totalDays} ימים`}</text>
      <text x="50%" y="76%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#E8A33D', fontSize: '11px', fontWeight: 700 }}>{`${Math.round(pct * 100)}% מהדרך`}</text>
    </svg>
  );
}

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
  const planUrl = typeof window !== 'undefined' ? window.location.href : '';

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
          {/* הירו - הרושם הראשוני של העמוד */}
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: 'radial-gradient(circle at 15% 0%, rgba(79,201,196,0.22), transparent 55%), radial-gradient(circle at 100% 100%, rgba(232,163,61,0.18), transparent 55%), linear-gradient(160deg, var(--bg-surface-raised) 0%, #0b0f18 100%)',
              border: '1px solid var(--border-hairline-strong)',
              borderRadius: '18px',
              padding: '24px 20px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#E8A33D', background: 'rgba(232,163,61,0.12)', border: '1px solid rgba(232,163,61,0.3)', borderRadius: '20px', padding: '5px 12px', marginBottom: '14px' }}>
              ✦ {data.profileTitle}
            </div>
            <div className="form-title" style={{ fontSize: '23px', marginBottom: '6px' }}>המעקב האישי שלך{firstName ? `, ${firstName}` : ''}</div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              כל יום שאת/ה מסמן/ת כאן - זו עוד עדות שאת/ה לא רק "עוד מישהו שרצה להתחיל". זו הדרך הכי אמיתית להוכיח לעצמך שהפעם זה שונה.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <ProgressRing dayNumber={data.dayNumber} totalDays={data.totalDays} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', maxWidth: '340px' }}>
              {data.programDays.map((d) => (
                <div
                  key={d.date}
                  title={`יום ${d.dayNumber}`}
                  style={{ width: '17px', height: '17px', borderRadius: '5px', background: DAY_COLORS[d.status], boxShadow: d.status === 'today_pending' ? '0 0 8px rgba(232,163,61,0.6)' : 'none' }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(232,163,61,0.1)', border: '1px solid rgba(232,163,61,0.3)', borderRadius: '20px', padding: '8px 18px' }}>
              <span style={{ fontSize: '18px' }}>🔥</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#E8A33D' }}>{data.streak}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{data.streak === 1 ? 'יום ברצף' : 'ימים ברצף'}</span>
            </div>
          </div>

          <div className="tp-mission-box tp-rule-box">
            <div className="tp-mission-label">הכלל שלך</div>
            <div className="tp-mission-text">{data.rule}</div>
          </div>

          {(data.dream || data.fear) && (
            <div
              style={{
                background: 'linear-gradient(160deg, rgba(232,163,61,0.1) 0%, var(--bg-surface) 65%)',
                border: '1px solid rgba(232,163,61,0.3)',
                borderRadius: '14px',
                padding: '18px',
                marginBottom: '18px',
              }}
            >
              <div style={{ fontSize: '10.5px', color: '#E8A33D', textTransform: 'uppercase', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.5px' }}>למה זה חשוב לך - בדיוק במילים שלך</div>
              {data.dream && (
                <div style={{ display: 'flex', gap: '10px', fontSize: '13.5px', color: '#fff', lineHeight: 1.6, marginBottom: data.fear ? '12px' : 0 }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>🎯</span>
                  <span><b>החלום שכתבת:</b> {data.dream}</span>
                </div>
              )}
              {data.fear && (
                <div style={{ display: 'flex', gap: '10px', fontSize: '13.5px', color: '#fff', lineHeight: 1.6 }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>💪</span>
                  <span><b>מה שאת/ה רוצה לנצח:</b> {data.fear}</span>
                </div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '12px', lineHeight: 1.6, borderTop: '1px solid rgba(232,163,61,0.2)', paddingTop: '10px' }}>
                כל יום שאת/ה עומד/ת בכלל שלך - זה עוד צעד לכיוון החלום, ועוד רגע שבו לא נתת לפחד לנצח.
              </div>
            </div>
          )}

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

          <a
            href={buildReminderLink(planUrl)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#E8A33D', border: '1px dashed rgba(232,163,61,0.4)', borderRadius: '10px', padding: '11px', marginBottom: '20px', textDecoration: 'none' }}
          >
            📅 תזכירו לי כל יום ביומן שלי
          </a>

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

          <div className="tp-mission-box" style={{ marginTop: '18px', marginBottom: '20px' }}>
            <div className="tp-mission-label">המשימה שלך ל-30 יום</div>
            <div className="tp-mission-text">{data.mission}</div>
          </div>

          <div
            style={{
              background: 'linear-gradient(160deg, rgba(79,201,196,0.1) 0%, var(--bg-surface-raised) 100%)',
              border: '1px solid var(--border-hairline-strong)',
              borderRadius: '14px',
              padding: '18px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '6px' }}>וזה עוד לפני שהצטרפת לקבוצת הסוחרים</div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: '14px' }}>
              המעקב האישי הזה חינמי לגמרי. מי שכבר בקבוצה מקבל את כל זה - ועוד ליווי, תשובות בזמן אמת ואנשים שעוברים בדיוק את מה שאת/ה עכשיו.
            </p>
            <a
              href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA"
              style={{ display: 'inline-block', fontSize: '13.5px', fontWeight: 700, color: '#08131a', background: '#E8A33D', borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }}
            >
              הצטרפות לקבוצת הסוחרים ←
            </a>
          </div>
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
