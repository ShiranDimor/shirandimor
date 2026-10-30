'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { captureSourceFromUrl } from '@/lib/attribution';
import { supabase } from '@/lib/supabase';
import PushNotificationButton from '@/components/PushNotificationButton';

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
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [lastClosed, setLastClosed] = useState<Trade | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  // מגיעים מקישור עם ?join=1 (מעמודים אחרים כמו /lives או /portfolio) - פותח ישר את שער
  // הרשמה להתראות בלי צורך ללחוץ קודם על הכפתור. נקרא סינכרונית ב-useState (לא ב-useEffect)
  // כדי שהערך הנכון יגיע לרינדור הראשון של PushNotificationButton - אחרת ה-useEffect הפנימי
  // שלו כבר קורא ל-checkStatus() עם הערך הישן (false) לפני שה-state כאן מתעדכן
  const [autoOpenNotifications] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('join') === '1'
  );

  useEffect(() => {
    captureSourceFromUrl();
    loadTrades();
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowStickyCta(window.scrollY > 500);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function loadTrades() {
    try {
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
    } catch (e) {
      // בלי try/catch כאן, שגיאה הייתה משאירה את התצוגה בשקט על 0 עסקאות בלי שום סימן לבעיה
      console.error('homepage loadTrades failed', e);
    }
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
        <div style={{ gap: '8px' }}>
          <Link href="/trading-plan" className="nav-cta-orange">תוכנית מסחר</Link>
          <Link href="/lives" className="nav-cta-live"><span className="live-dot" />לייבים</Link>
          <Link href="/lessons" className="nav-cta-sky">ספריית שיעורים</Link>
          <Link href="/portfolio" className="nav-cta-teal">תיק מסחר של שירן</Link>
          <Link href="/login" className="nav-cta-profit">כניסה לסוחרים</Link>
          <Link href="/business" className="nav-cta-biz">לארגונים</Link>
        </div>
      </header>

      <div className="hero-v2">
        <div className="eyebrow">שירן דימור</div>
        <h1>שוק ההון הרבה יותר <em>פשוט</em><br />ממה שעושים ממנו.</h1>
        <p>אני שירן, ואני כאן כדי להראות לך שלא צריך לדעת הכול כדי להתחיל - <strong>צריך רק לדעת מה לעשות</strong>. עקרונות בסיסיים, ניהול סיכון ותוכנית עבודה מסודרת - בלי הבטחות תשואה, בלי "שיטת פלא", ובלי שזה יהפוך למשרה שנייה.</p>

        <PushNotificationButton variant="hero" autoOpenLeadForm={autoOpenNotifications} />

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 'none', marginTop: '14px', marginBottom: '6px' }}>
          ומי שרוצה ללכת צעד רחוק יותר - <strong style={{ color: 'var(--lavender)' }}>סוחרים ביחד איתי</strong>, בזמן אמת, ובונים <strong style={{ color: 'var(--lavender)' }}>תיק השקעות אמיתי</strong> - גם בלי שום ידע מוקדם.
        </p>
        <Link className="cta-sub-link" href="/subscribe">להכיר את &quot;מדברים עסקאות&quot; <span>←</span></Link>
      </div>

      <div className="trust-strip">
        <div className="trust-item"><div className="num">0%</div><div className="lbl">הבטחות תשואה</div></div>
        <div className="trust-item"><div className="num">100%</div><div className="lbl">שקיפות, כולל הפסדים</div></div>
        <div className="trust-item"><div className="num">3</div><div className="lbl">סגנונות מסחר, קהילה אחת</div></div>
      </div>

      <div className="about-feature">
        <img className="af-photo" src="/shiran-photo.jpg" alt="שירן דימור" />
        <div className="af-text">
          <div className="af-label">מי אני</div>
          <p className="af-main">שירן דימור, סוחרת 14 שנה בשוק. לא הפכתי למיליארדרית, ולא אבטיח לך שזה יקרה. מה שכן - <strong>למדתי לנהל סיכונים כמו שצריך</strong>, פחות מלהיב מרכב יוקרה באינסטגרם, אבל הרבה יותר מציאותי לאורך זמן. ואת זה אני רוצה ללמד גם אותך.</p>
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
        <span className="live-teaser-text"><strong>הלייבים הקרובים</strong> - סוחרים ביחד איתי בזמן אמת, לא רק לומדים: לבנות תיק השקעות אחראי ומציאותי הרבה יותר פשוט ממה שנדמה</span>
        <span className="live-teaser-arrow">←</span>
      </Link>

      <div className="section-label"><h2>אז למי זה מתאים?</h2></div>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '12px' }}>
        <strong style={{ color: 'var(--text-primary)' }}>אנשים רגילים, לא סוחרים במשרה מלאה</strong> - שרוצים שהחיסכון שלהם יעשה משהו חוץ מלשבת בעו"ש, בלי לשבת כל היום מול מסכים ובלי לעזוב את מה שהם כבר עושים.
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
        <div>– מי שרוצה ליווי אישי ממני וקהילה תומכת לאורך הדרך</div>
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

      <div className="section-label" style={{ marginTop: '30px' }}><h2>איך מתחילים?</h2></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>שני צעדים פשוטים - מתחילים בלי להוציא כלום, ומשדרגים כשנוח לכם.</p>
      <div className="groups-compare">
        <div className="group-card free">
          <div className="gc-tag" style={{ background: 'var(--profit-bg)', color: 'var(--profit)' }}>צעד 1</div>
          <h3>עדכונים בזמן אמת</h3>
          <div className="gc-price">ללא עלות</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>בלי התחייבות, בלי לחץ</div>
          <div className="gc-perks">
            <div><strong>בלי רעש</strong> - רק מה שבאמת קורה בשוק</div>
            <div>הצצה לעולם שוק ההון, בלי לשלם עליה <strong>אלפי שקלים</strong></div>
            <div><strong>מושג אחד</strong> בשבוע - פשוט, ברור, ואפשר להשתמש בו מיד</div>
            <div><strong>ספרייה מלאה</strong> של וובינרים ומצגות, בלי עלות נוספת</div>
            <div>הפעלה בלחיצה אחת - <strong>ללא התחייבות</strong> וללא עלות</div>
            <div>אפשר לשדרג ל"מדברים עסקאות" בכל שלב, <strong>בקצב האישי</strong></div>
          </div>
          <a className="gc-cta" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>הפעלה ללא עלות</a>
        </div>
        <div className="group-card paid">
          <div className="gc-tag">צעד 2 · גישה מלאה</div>
          <h3>מדברים עסקאות</h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '10px' }}>
            <strong style={{ color: 'var(--lavender)' }}>סוחרים ביחד איתי</strong>, בזמן אמת, ובונים <strong style={{ color: 'var(--lavender)' }}>תיק השקעות אמיתי</strong> - גם אם אין לך שום ידע מוקדם.
          </p>
          <div className="gc-price">₪400 לחודש <span style={{ color: 'var(--profit)', fontWeight: 600 }}>· חודש ראשון ב-₪200</span></div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>מנוי חודשי · ללא התחייבות</div>
          <div className="gc-perks">
            <div>כל מה שיש בעדכונים החינמיים - <strong>ועוד</strong>:</div>
            <div>בניית <strong>תיק השקעות</strong> - תוך יומי, סווינג, טווח ארוך</div>
            <div><strong>וובינרים לייב</strong> - שאלות, ניתוחים ולמידה בזמן אמת</div>
            <div><strong>ליווי אישי</strong> - לצד קהילת סוחרים סגורה לדיון מעמיק</div>
            <div>יומן <strong>מסחר שקוף</strong> - כולל עסקאות מפסידות</div>
            <div><strong>תיק מסחר</strong> אישי וניתוח העסקאות ע"י שירן</div>
          </div>
          <Link className="gc-cta" href="/subscribe">לפרטים על מדברים עסקאות</Link>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>שאלות שנשאלות הרבה</h2></div>
      <div className="faq-list">
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>צריך ניסיון קודם בשוק ההון?</summary>
          <p><strong>ממש לא</strong>. זה מתאים גם למי שמעולם לא סחר, וגם למי שכבר ניסה ולא הסתדר. מתחילים מהבסיס, ביחד.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--orange)' }}>
          <summary>צריך קודם לעשות קורס יקר?</summary>
          <p>לא. אפשר לשלם אלפי שקלים על קורס ועדיין לא לדעת אם התחום בכלל מתאים לך. הדרך הכי נכונה וזולה להבין את זה לעומק היא פשוט לנסות חודש שלם (₪200) ולראות מבפנים מה זה תיק השקעות, איך שוק ההון עובד בפועל, ומה השיטה - במקום לצבור תיאוריה על הנייר לפני שמעיזים.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
          <summary>כמה זמן ביום זה דורש?</summary>
          <p>זה נבנה בדיוק בשביל אנשים עם עבודה וחיים - לא צריך לשבת שעות מול המסך. אפשר להסתפק בהשקעה של כמה דקות כל כמה ימים. מסחר תוך-יומי הוא אופציה, לא חובה.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
          <summary>מה קורה אם אני רוצה לבטל?</summary>
          <p>אפשר לבטל בכל רגע נתון, בלי קנס ובלי שאלות. ביטול עד יום לפני מועד החיוב הבא (כולל אותו יום) מונע את החיוב הבא. אם החיוב כבר בוצע - זה תשלום מראש על חודש נוסף, וההצטרפות ממשיכה עד סופו.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>זה בטוח? יש סיכון להפסיד כסף?</summary>
          <p>כן, יש סיכון - זה שוק ההון, לא הבטחה. המטרה שלי היא ללמד ניהול סיכון נכון, לא להבטיח רווחים.</p>
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

      {showStickyCta && !hasFullAccess && (
        <div className="sticky-cta">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            הפעלת עדכונים בזמן אמת - ללא עלות
          </button>
        </div>
      )}
    </div>
  );
}
