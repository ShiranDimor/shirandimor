'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type Outcome = 'followed' | 'broke' | 'no_activity';
type DayStatus = Outcome | 'no_checkin' | 'today_pending' | 'future';

type ProgressData = {
  name: string | null;
  isSubscriber: boolean;
  profileTitle: string;
  rule: string;
  dream: string | null;
  fear: string | null;
  mission: string;
  threeThings: string[];
  streak: number;
  todayChecked: boolean;
  todayOutcome: Outcome | null;
  today: string;
  periodic: boolean;
  isTodayDue: boolean;
  nextDueDate: string | null;
  nextDueWeekday: string | null;
  dayNumber: number;
  totalDays: number;
  programDays: { date: string; status: DayStatus }[];
};

// עיצוב לכל סטטוס משבצת - "future" מוצג כריק (מסגרת מקווקוות בלבד) כדי שיהיה ברור שזה שונה
// מהותית מ"no_checkin" (מועד דיווח שכבר עבר ולא סומן) ולא רק גוון כהה נוסף שקשה להבחין בו
const DAY_STYLES: Record<DayStatus, { background: string; border: string }> = {
  followed: { background: '#4FB876', border: '1px solid #4FB876' },
  broke: { background: '#C9635E', border: '1px solid #C9635E' },
  no_activity: { background: '#5A6478', border: '1px solid #5A6478' },
  no_checkin: { background: '#3a4152', border: '1px solid #545b6e' },
  today_pending: { background: '#E8A33D', border: '1px solid #E8A33D' },
  future: { background: 'transparent', border: '1px dashed #2a2f3a' },
};

const LEGEND: { status: DayStatus; label: string }[] = [
  { status: 'followed', label: 'עמדתי בכלל' },
  { status: 'broke', label: 'לא עמדתי' },
  { status: 'no_activity', label: 'לא היה מה לדווח' },
  { status: 'no_checkin', label: 'לא סומן' },
];

// טיזרים נעולים למי שעדיין לא מנוי - מתחלפים לפי ההתקדמות, כדי שתמיד יהיה עוד משהו שמזכיר שיש עוד בפנים.
// כל תוכן כאן אמיתי (מבוסס על מה שבאמת ניתן בקבוצת הסוחרים) - לא הבטחה מומצאת.
const LOCKED_TEASERS = [
  { icon: '🎥', title: 'וובינרים לייב', text: 'שאלות בזמן אמת וניתוחים חיים עם קבוצה שכבר בפנים - במקום ללמוד לבד מהצד.' },
  { icon: '📓', title: 'יומן מסחר שקוף', text: 'לראות איך זה נראה אצל מי שכבר במסלול - כולל עסקאות מפסידות, לא רק הצלחות.' },
  { icon: '🧭', title: 'ליווי אישי', text: 'כשמשהו לא ברור באמצע הדרך - יש למי לפנות, במקום לנחש לבד ולחכות לתוצאה.' },
  { icon: '📊', title: 'ניתוח אישי של ההחלטות שלך', text: 'שירן עצמה עוברת על התיק ועל ההחלטות - ומראה מה עובד ומה כדאי לשנות.' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// לינק להוספת תזכורת אישית ביומן גוגל - אירוע חד-פעמי, כדי שכל אחד יבחר לעצמו את הזמן והתדירות שמתאימים לו (לא כפינו "כל יום")
function buildReminderLink(planUrl: string): string {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'לבדוק את ההתקדמות שלי - תוכנית המסחר',
    details: `תזכורת אישית לחזור לעמוד המעקב ולסמן אם עמדת בכלל שלך. אפשר לשנות את השעה ואת התדירות כרצונך: ${planUrl}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    ctz: 'Asia/Jerusalem',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function ProgressRing({ dayNumber, totalDays, unitLabel }: { dayNumber: number; totalDays: number; unitLabel: string }) {
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
      <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-tertiary)', fontSize: '11.5px' }}>{`מתוך ${totalDays} ${unitLabel}`}</text>
      <text x="50%" y="76%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#E8A33D', fontSize: '11px', fontWeight: 700 }}>{`${Math.round(pct * 100)}% מהדרך`}</text>
    </svg>
  );
}

export default function MyPlanProgressPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

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

  async function checkIn(outcome: Outcome) {
    setSaving(true);
    await fetch('/api/trading-plan/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, outcome }),
    }).catch(() => {});
    await load();
    setSaving(false);
    setEditing(false);
  }

  const firstName = (data?.name || '').trim().split(' ')[0] || '';
  const planUrl = typeof window !== 'undefined' ? window.location.href : '';
  const streakLabel = data?.periodic ? (data.streak === 1 ? 'דיווח ברצף' : 'דיווחים ברצף') : (data?.streak === 1 ? 'יום ברצף' : 'ימים ברצף');

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.back()} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>→ חזרה</button>
          {data?.isSubscriber && <Link href="/portfolio" className="nav-link">לתיק שלי</Link>}
          <Link href="/" className="nav-link">בית</Link>
        </div>
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
              כל דיווח שנשאר כאן הוא עוד עדות שיש כאן יותר מ"עוד מישהו שרצה להתחיל". זו הדרך הכי אמיתית להוכיח לעצמך שהפעם זה שונה.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <ProgressRing dayNumber={data.dayNumber} totalDays={data.totalDays} unitLabel={data.periodic ? 'דיווחים' : 'ימים'} />

            {data.periodic && (
              <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '-8px' }}>
                {data.totalDays} דיווחים (שני וחמישי) לאורך 30 הימים של התוכנית שלך
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: data.periodic ? '10px' : '5px', justifyContent: 'center', maxWidth: '340px' }}>
              {data.programDays.map((d) => {
                const size = data.periodic ? '30px' : '17px';
                const isToday = d.date === data.today;
                return (
                  <div key={d.date} title={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div
                      style={{
                        width: size,
                        height: size,
                        borderRadius: '6px',
                        ...DAY_STYLES[d.status],
                        outline: isToday ? '2px solid #E8A33D' : 'none',
                        outlineOffset: '2px',
                        boxShadow: d.status === 'today_pending' ? '0 0 8px rgba(232,163,61,0.6)' : 'none',
                      }}
                    />
                    {data.periodic && (
                      <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>
                        {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', justifyContent: 'center' }}>
              {LEGEND.map((l) => (
                <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '3px', display: 'inline-block', ...DAY_STYLES[l.status] }} />
                  {l.label}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(232,163,61,0.1)', border: '1px solid rgba(232,163,61,0.3)', borderRadius: '20px', padding: '8px 18px' }}>
              <span style={{ fontSize: '18px' }}>🔥</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#E8A33D' }}>{data.streak}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>{streakLabel}</span>
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
                  <span><b>מה שרצית לנצח:</b> {data.fear}</span>
                </div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '12px', lineHeight: 1.6, borderTop: '1px solid rgba(232,163,61,0.2)', paddingTop: '10px' }}>
                כל פעם שעמדת בכלל שלך - כולל הרגעים שבהם נמנעת מלהיכנס כי זה לא היה מתאים - זה עוד צעד לכיוון החלום, ועוד רגע שבו לא נתת לפחד לנצח.
              </div>
            </div>
          )}

          {editing || (data.isTodayDue && !data.todayChecked) ? (
            <div className="tp-question-card" style={{ textAlign: 'center' }}>
              <div className="tp-question-title" style={{ marginBottom: '6px' }}>
                {!data.isTodayDue ? 'רוצה לדווח בכל זאת?' : data.periodic ? 'עמדת בכלל שלך מאז הדיווח האחרון?' : 'עמדת היום בכלל שלך?'}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>אם נמנעת מעסקה כי היא לא התאימה לכלל - זו הצלחה, לא "כלום קרה".</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className={data.todayOutcome === 'followed' ? 'btn-primary' : 'btn-outline'}
                  onClick={() => checkIn('followed')}
                  disabled={saving}
                >
                  עמדתי בכלל שלי {data.todayOutcome === 'followed' ? '✓' : ''}
                </button>
                <button
                  type="button"
                  className={data.todayOutcome === 'broke' ? 'btn-primary' : 'btn-outline'}
                  onClick={() => checkIn('broke')}
                  disabled={saving}
                >
                  לא עמדתי הפעם {data.todayOutcome === 'broke' ? '✓' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => checkIn('no_activity')}
                  disabled={saving}
                  style={{
                    background: data.todayOutcome === 'no_activity' ? 'rgba(232,163,61,0.12)' : 'transparent',
                    border: data.todayOutcome === 'no_activity' ? '1px solid #E8A33D' : '1px dashed var(--border-hairline-strong)',
                    color: data.todayOutcome === 'no_activity' ? '#E8A33D' : 'var(--text-tertiary)',
                    borderRadius: '8px',
                    padding: '11px',
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  לא היה מה לדווח {data.todayOutcome === 'no_activity' ? '✓' : ''}
                </button>
              </div>
              {editing && (
                <button type="button" onClick={() => setEditing(false)} disabled={saving} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  ביטול
                </button>
              )}
              <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '14px', fontSize: '11.5px', color: 'var(--text-tertiary)', textDecoration: 'none' }}>
                נתקעת עם זה? אפשר גם לכתוב לי בוואטסאפ ←
              </a>
            </div>
          ) : data.todayChecked ? (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p className="tp-personal-note" style={{ marginBottom: '6px' }}>
                ✓ סימנת - {data.periodic ? `נחזור ב${data.nextDueWeekday ? `יום ${data.nextDueWeekday}` : 'הדיווח הבא'}` : 'חוזרים מחר'}
              </p>
              <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: '#E8A33D', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>
                לשנות את הדיווח
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p className="tp-personal-note" style={{ marginBottom: '6px' }}>
                היום אין צורך לעדכן - הדיווח הבא שלך ביום {data.nextDueWeekday || ''}
              </p>
              <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: '#E8A33D', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>
                יש לך בכל זאת מה לדווח היום?
              </button>
            </div>
          )}

          <a
            href={buildReminderLink(planUrl)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#E8A33D', border: '1px dashed rgba(232,163,61,0.4)', borderRadius: '10px', padding: '11px', marginBottom: '20px', textDecoration: 'none' }}
          >
            📅 הוסיפו לי תזכורת אישית ביומן
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

          {!data.isSubscriber && (() => {
            const teaser = LOCKED_TEASERS[data.dayNumber % LOCKED_TEASERS.length];
            return (
              <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-surface)', border: '1px dashed var(--border-hairline-strong)', borderRadius: '14px', padding: '18px', marginTop: '18px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', opacity: 0.55 }}>
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>{teaser.icon}</span>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{teaser.title}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{teaser.text}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: '11.5px', color: '#E8A33D', fontWeight: 700 }}>🔒 נעול - למנויי קבוצת הסוחרים בלבד</span>
                  <a href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA" style={{ fontSize: '11.5px', fontWeight: 700, color: '#08131a', background: '#E8A33D', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', flexShrink: 0 }}>
                    לפתוח גישה
                  </a>
                </div>
              </div>
            );
          })()}

          <div className="tp-mission-box" style={{ marginTop: '18px', marginBottom: '20px' }}>
            <div className="tp-mission-label">המשימה שלך ל-30 יום</div>
            <div className="tp-mission-text">{data.mission}</div>
          </div>

          {data.isSubscriber ? (
            <div
              style={{
                background: 'linear-gradient(160deg, rgba(79,201,196,0.1) 0%, var(--bg-surface-raised) 100%)',
                border: '1px solid var(--border-hairline-strong)',
                borderRadius: '14px',
                padding: '18px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 600 }}>כבר חלק מקבוצת הסוחרים 💜</div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginTop: '6px' }}>
                המעקב האישי הזה הוא רק תוספת קטנה למה שכבר יש לך בקבוצה. אז פשוט להמשיך ככה.
              </p>
            </div>
          ) : (
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
                המעקב האישי הזה חינמי לגמרי. מי שכבר בקבוצה מקבל את כל זה - ועוד ליווי, תשובות בזמן אמת ואנשים שעוברים בדיוק את השלב הזה עכשיו.
              </p>
              <a
                href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA"
                style={{ display: 'inline-block', fontSize: '13.5px', fontWeight: 700, color: '#08131a', background: '#E8A33D', borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }}
              >
                הצטרפות לקבוצת הסוחרים ←
              </a>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: '18px' }}>
            <a href={`/api/trading-plan/unsubscribe-progress?id=${id}`} style={{ fontSize: '11px', color: 'var(--text-tertiary)', textDecoration: 'underline' }}>
              להפסיק לקבל תזכורות מעקב במייל
            </a>
          </p>
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
