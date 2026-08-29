'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { captureSourceFromUrl } from '@/lib/attribution';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  current_price: number | null;
  exit_price: number | null;
  status: string;
  realized_pnl_usd: number | null;
};

export default function HomePage() {
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [leadAlreadySubscriber, setLeadAlreadySubscriber] = useState(false);
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState<string | null>(null);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [lastClosed, setLastClosed] = useState<Trade | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);

  function handlePhoneChange(value: string) {
    setLeadPhone(value.replace(/\D/g, '').slice(0, 10));
  }

  async function handleLeadSubmit() {
    if (!leadName || !leadPhone) {
      setLeadError('צריך למלא שם ומספר נייד');
      return;
    }
    if (!/^05\d{8}$/.test(leadPhone)) {
      setLeadError('מספר נייד לא תקין - לדוגמה 0501234567');
      return;
    }
    setLeadSubmitting(true);
    setLeadError('');

    let alreadySubscriber = false;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: leadName, phone: leadPhone, email: leadEmail }),
      });
      const data = await res.json().catch(() => null);
      alreadySubscriber = !!data?.alreadySubscriber;
      if (data?.inviteUrl) setWhatsappInviteUrl(data.inviteUrl);
    } catch (e) {
      // ממשיכים לוואטסאפ גם אם השליחה נכשלה, כדי לא לאבד את ההצטרפות - עם קישור גיבוי במקום קישור ההצטרפות הישיר
    }

    setLeadSubmitting(false);
    setLeadAlreadySubscriber(alreadySubscriber);
    setLeadSubmitted(true);
    if (!alreadySubscriber) trackFunnelEvent('free_group_lead_submitted', { phone: leadPhone, email: leadEmail });
  }

  useEffect(() => {
    captureSourceFromUrl();
    loadTrades();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('join') === '1') {
      setShowLeadForm(true);
    }
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowStickyCta(window.scrollY > 500);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function loadTrades() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setHasFullAccess(profile?.role === 'admin' || profile?.role === 'subscriber');
    }

    const { data: open } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    const { data: closed } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1);

    if (open) {
      setOpenTrades(open.slice(0, 2));
      setOpenCount(open.length);
    }
    if (closed && closed.length > 0) setLastClosed(closed[0]);
  }

  function pctChange(trade: Trade) {
    const current = trade.status === 'open' ? trade.current_price : trade.exit_price;
    if (!current) return 0;
    const pct = ((current - trade.entry_price) / trade.entry_price) * 100 * (trade.direction === 'short' ? -1 : 1);
    return pct;
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: '8px' }}>
          <Link href="/trading-plan" className="nav-cta-orange">תוכנית מסחר</Link>
          <Link href="/lives" className="nav-cta-live"><span className="live-dot" />לייבים</Link>
          <Link href="/portfolio" className="nav-cta-teal">תיק מסחר</Link>
          <Link href="/login" className="nav-cta-profit">כניסה לסוחרים</Link>
        </div>
      </header>

      <div className="hero-v2">
        <div className="eyebrow">שירן דימור</div>
        <h1>שוק ההון הרבה יותר <em>פשוט</em><br />ממה שעושים ממנו.</h1>
        <p>לא צריך לדעת הכול. צריך לדעת מה לעשות. כאן לומדים עקרונות בסיסיים, ניהול סיכון ובניית תוכנית עבודה מסודרת - בלי הבטחות תשואה, בלי "שיטת פלא", ובלי שזה יהפוך למשרה שנייה.</p>

        {!showLeadForm && (
          <button className="cta-main" style={{ border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => setShowLeadForm(true)}>
            הצטרפות לקבוצת העדכונים
            <span className="free-tag">ללא עלות</span>
          </button>
        )}

        {showLeadForm && !leadSubmitted && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '10px', padding: '16px', marginBottom: '10px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', textAlign: 'center' }}>
              כמה פרטים קצרים, ומיד נפתחת הדרך לקבוצת הוואטסאפ.
            </p>
            <div className="field" style={{ marginBottom: '10px' }}>
              <label>שם</label>
              <ClearableInput type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} onClear={() => setLeadName('')} placeholder="השם המלא" />
            </div>
            <div className="field" style={{ marginBottom: '10px' }}>
              <label>נייד</label>
              <ClearableInput type="tel" inputMode="numeric" value={leadPhone} onChange={(e) => handlePhoneChange(e.target.value)} onClear={() => setLeadPhone('')} placeholder="0501234567" maxLength={10} />
            </div>
            <div className="field">
              <label>אימייל <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(לא חובה)</span></label>
              <ClearableInput type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} onClear={() => setLeadEmail('')} placeholder="name@example.com" />
            </div>
            <button className="btn-primary" onClick={handleLeadSubmit} disabled={leadSubmitting}>
              {leadSubmitting ? 'שולחים...' : 'המשך לקבוצת הוואטסאפ ←'}
            </button>
            {leadError && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>{leadError}</p>}
          </div>
        )}

        {showLeadForm && leadSubmitted && leadAlreadySubscriber && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--lavender)', borderRadius: '10px', padding: '16px', marginBottom: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              הפרטים האלה כבר שייכים למנוי פעיל בקבוצת הסוחרים &quot;מדברים עסקאות&quot; - אין צורך להצטרף גם לקבוצת העדכונים, כי כמנויים מקבלים שם את כל מה שיש בקבוצת העדכונים, ועוד הרבה יותר.
            </p>
            <Link href="/journal" className="btn-primary" style={{ display: 'block', textDecoration: 'none' }}>
              מעבר לאזור האישי ←
            </Link>
          </div>
        )}

        {showLeadForm && leadSubmitted && !leadAlreadySubscriber && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '10px', padding: '16px', marginBottom: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              {whatsappInviteUrl
                ? 'מעולה! הכפתור פותח את קבוצת הוואטסאפ, וההצטרפות משם היא כבר עניין של רגע.'
                : 'הפרטים נקלטו! לא הצלחנו לפתוח את הקבוצה אוטומטית - כדאי לשלוח לי הודעה בוואטסאפ ונצרף אותך ידנית.'}
            </p>
            <a
              href={whatsappInviteUrl || 'https://wa.me/972547167419'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ display: 'block', textDecoration: 'none' }}
              onClick={() => trackFunnelEvent('whatsapp_group_open_click', { phone: leadPhone, email: leadEmail })}
            >
              {whatsappInviteUrl ? 'פתיחת קבוצת הוואטסאפ ←' : 'שליחת הודעה בוואטסאפ ←'}
            </a>
          </div>
        )}

        <Link className="cta-sub-link" href="/subscribe">להכיר את קבוצת הסוחרים <span>←</span></Link>
      </div>

      <div className="trust-strip">
        <div className="trust-item"><div className="num">0%</div><div className="lbl">הבטחות תשואה</div></div>
        <div className="trust-item"><div className="num">100%</div><div className="lbl">שקיפות, כולל הפסדים</div></div>
        <div className="trust-item"><div className="num">3</div><div className="lbl">סגנונות מסחר, קבוצה אחת</div></div>
      </div>

      <div className="about-feature">
        <img className="af-photo" src="/shiran-photo.jpg" alt="שירן דימור" />
        <div className="af-text">
          <div className="af-label">מי אני</div>
          <p className="af-main">שירן דימור, סוחרת 14 שנה בשוק. לא הפכתי למיליארדרית, ולא אבטיח לך שזה יקרה. למדתי לנהל סיכונים כמו שצריך - פחות מלהיב מרכב יוקרה באינסטגרם, אבל הרבה יותר מציאותי לאורך זמן.</p>
        </div>
      </div>

      <Link href="/trading-plan" className="tp-home-teaser">
        <div className="tp-home-teaser-badge">10 דקות · בלי התחייבות</div>
        <div className="tp-home-teaser-title">8 שלבים לבניית תוכנית מסחר</div>
        <div className="tp-home-teaser-text">כמה שאלות קצרות, ובסוף יוצאים עם תוכנית עבודה ברורה - לא עוד טופס, ולא עוד הבטחה.</div>
        <div className="tp-home-teaser-cta">להתחיל <span>←</span></div>
      </Link>

      <Link href="/lives" className="live-teaser">
        <span className="live-dot" />
        <span className="live-teaser-text"><strong>הלייבים הקרובים</strong> - סוחרים ביחד בזמן אמת, לא רק לומדים: לבנות תיק השקעות אחראי ומציאותי הרבה יותר פשוט ממה שנדמה</span>
        <span className="live-teaser-arrow">←</span>
      </Link>

      <div className="section-label"><h2>אז למי הקבוצה מתאימה?</h2></div>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '12px' }}>
        <strong style={{ color: 'var(--text-primary)' }}>אנשים רגילים, לא סוחרים במשרה מלאה</strong> - שרוצים לגרום לכסף שלהם לעבוד בשבילם, בלי לשבת כל היום מול מסכים ובלי לעזוב את מה שהם כבר עושים.
      </p>
      <div className="tag-row">
        <span className="tag-chip">שכירים</span><span className="tag-chip">הורים</span><span className="tag-chip">עצמאיים</span><span className="tag-chip">סטודנטים</span><span className="tag-chip">עם ניסיון לא מוצלח</span><span className="tag-chip">בלי שום ניסיון</span>
      </div>
      <div className="stat-callout">
        <div className="sc-num">90%</div>
        <p>הסיבה האמיתית לכך שרוב האנשים לא מתחילים להשקיע, או נושרים אחרי כמה חודשים - זה לא חוסר ידע. זה <strong>הפן המנטלי</strong>: הפחד להפסיד, הקושי לקבל הפסד, וחוסר הסבלנות להישאר בתהליך. אבל בעיקר - הבהלה מהתחום עצמו, וההרגשה של "צריך לדעת המון" ו"מה אני בכלל קשור לזה".</p>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2 style={{ color: 'var(--loss)' }}>למי זה פחות מתאים</h2></div>
      <div className="not-fit">
        <div>– מי שמחפש רווח מובטח או כסף מהיר</div>
        <div>– מי שרוצה שמישהי אחרת תקבל עבורו את כל ההחלטות</div>
        <div>– מי שמתכוון לסחור בכסף שהוא צריך למחיה, או בהלוואה</div>
        <div>– מי שלא מבין שהפסדים הם חלק מהמסחר</div>
      </div>

      <div className="section-label" style={{ marginTop: '20px' }}><h2 style={{ color: 'var(--profit)' }}>למי זה כן מתאים</h2></div>
      <div className="not-fit">
        <div>– מי שרוצה תיק מסחר אמיתי ושקוף, כולל רווחים והפסדים</div>
        <div>– מי שרוצה ליווי אישי וקהילה תומכת לאורך הדרך</div>
        <div>– מי שרוצה ללמוד גם את החלק הכי משמעותי - הפן המנטאלי</div>
        <div>– מי שרוצה גישה למסחר תוך-יומי, סווינג והשקעות לטווח ארוך</div>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>אז איך זה נראה, תכלס?</h2></div>
      <div className="portfolio-teaser">
        <div className="pt-head">
          <div className="pt-title">התיק של שירן</div>
          <div className="pt-badge">{openCount} עסקאות פתוחות</div>
        </div>
        {openTrades.length === 0 && !lastClosed && (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '10px 0' }}>עדיין אין עסקאות להצגה</div>
        )}
        {openTrades.map((trade) => {
          const pct = pctChange(trade);
          return (
            <div className="teaser-row" key={trade.id}>
              <span className={`sym ${!hasFullAccess ? 'blurred' : ''}`}>{trade.symbol}</span>
              <span className="pnl" style={{ color: pct >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
            </div>
          );
        })}
        {lastClosed && (
          <>
            {openTrades.length > 0 && (
              <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', paddingTop: '10px', borderTop: '1px solid var(--border-hairline)' }}>תוצאה אחרונה שנסגרה</div>
            )}
            <div className="teaser-row">
              <span className="sym" style={{ color: 'var(--text-secondary)' }}>{lastClosed.symbol} (נסגרה)</span>
              <span className="pnl" style={{ color: pctChange(lastClosed) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{pctChange(lastClosed) >= 0 ? '+' : ''}{pctChange(lastClosed).toFixed(2)}%</span>
            </div>
          </>
        )}
        <Link className="teaser-cta" href="/portfolio">צפייה בתיק המסחר המלא ←</Link>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>קבוצת עדכונים או קבוצת הסוחרים?</h2></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>רק עוקבים ומתעדכנים, או גם בונים תיק ונכנסים לעסקאות?</p>
      <div className="groups-compare">
        <div className="group-card free">
          <h3>קבוצת עדכונים</h3>
          <div className="gc-price">ללא עלות</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>בלי התחייבות, בלי לחץ</div>
          <div className="gc-perks">
            <div><strong>בלי רעש</strong> - רק מה שבאמת קורה בשוק</div>
            <div>הצצה לעולם שוק ההון, בלי לשלם עליה <strong>אלפי שקלים</strong></div>
            <div><strong>מושג אחד</strong> בשבוע - פשוט, ברור, ואפשר להשתמש בו מיד</div>
            <div><strong>ספרייה מלאה</strong> של וובינרים ומצגות, בלי עלות נוספת</div>
            <div>הצטרפות בלחיצה אחת - <strong>ללא התחייבות</strong> וללא עלות</div>
            <div>אפשר לשדרג לקבוצת הסוחרים בכל שלב, <strong>בקצב האישי</strong></div>
          </div>
          <a className="gc-cta" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo(0, 0); setShowLeadForm(true); }}>הצטרפות ללא עלות</a>
        </div>
        <div className="group-card paid">
          <div className="gc-tag">גישה מלאה</div>
          <h3>קבוצת הסוחרים <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 400 }}>· "מדברים עסקאות"</span></h3>
          <div className="gc-price">₪400 לחודש <span style={{ color: 'var(--profit)', fontWeight: 600 }}>· חודש ראשון ב-₪200</span></div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>מנוי חודשי · ללא התחייבות</div>
          <div className="gc-perks">
            <div>כל מה שיש בקבוצת העדכונים - <strong>ועוד</strong>:</div>
            <div>בניית <strong>תיק השקעות</strong> - תוך יומי, סווינג, טווח ארוך</div>
            <div><strong>וובינרים לייב</strong> - שאלות, ניתוחים ולמידה בזמן אמת</div>
            <div><strong>ליווי אישי</strong> - לצד קהילה סגורה לדיון מעמיק</div>
            <div>יומן <strong>מסחר שקוף</strong> - כולל עסקאות מפסידות</div>
            <div><strong>תיק מסחר</strong> אישי וניתוח העסקאות ע"י שירן</div>
          </div>
          <Link className="gc-cta" href="/subscribe">לפרטים על קבוצת הסוחרים</Link>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>שאלות שנשאלות הרבה</h2></div>
      <div className="faq-list">
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>צריך ניסיון קודם בשוק ההון?</summary>
          <p>לא. הקבוצה מתאימה גם למי שמעולם לא סחר, וגם למי שכבר ניסה ולא הסתדר. מתחילים מהבסיס.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
          <summary>כמה זמן ביום זה דורש?</summary>
          <p>זה נבנה בדיוק בשביל אנשים עם עבודה וחיים - לא צריך לשבת שעות מול המסך. אפשר להסתפק בהשקעה של כמה דקות כל כמה ימים. מסחר תוך-יומי הוא אופציה, לא חובה.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
          <summary>מה קורה אם אני רוצה לבטל?</summary>
          <p>המנוי מתחדש אוטומטית כל חודש, בתאריך ההצטרפות. אפשר לבטל בכל שלב עד יום לפני מועד החידוש - בלי קנס ובלי שאלות, פשוט שולחים הודעת וואטסאפ.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>זה בטוח? יש סיכון להפסיד כסף?</summary>
          <p>כן, יש סיכון - זה שוק ההון, לא הבטחה. המטרה של הקבוצה היא ללמד ניהול סיכון נכון, לא להבטיח רווחים.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
          <summary>כמה כסף צריך כדי להתחיל?</summary>
          <p>זה משתנה מאדם לאדם. יש מי שמתחילים עם תיק מסחר גדול, ויש מי שמתחילים עם תיק קטן מאוד. ויש גם כאלה שמתחילים בכלל בלי תיק מסחר משלהם, וסוחרים דרך תיקים ממומנים (Funded Accounts).</p>
        </details>
      </div>

      <div className="quote-block">
        <span className="qmark" aria-hidden="true">"</span>
        <p>השוק לא תמיד פשוט.<br />הדרך לסחור בו יכולה להיות.</p>
        <span className="qauthor">שירן דימור</span>
      </div>

      <footer>
        מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.<br />
        <Link href="/terms" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>תקנון</Link> · <Link href="/privacy" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>מדיניות פרטיות</Link>
      </footer>

      {showStickyCta && !showLeadForm && (
        <div className="sticky-cta">
          <button onClick={() => { window.scrollTo(0, 0); setShowLeadForm(true); }}>
            הצטרפות לקבוצת העדכונים - ללא עלות
          </button>
        </div>
      )}
    </div>
  );
}
