'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { captureSourceFromUrl } from '@/lib/attribution';
import { supabase } from '@/lib/supabase';
import PushNotificationButton from '@/components/PushNotificationButton';
import Reveal from '@/components/Reveal';
import CountUp from '@/components/CountUp';
import MonthlyReturnBubbles from '@/components/MonthlyReturnBubbles';
import { buildMonthlyPortfolioReturns, type MonthlyReturn } from '@/lib/portfolioStats';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  current_price: number | null;
  exit_price: number | null;
  status: string;
  realized_pnl_usd: number | null;
  closed_at: string | null;
};

export default function HomePage() {
  const [openCount, setOpenCount] = useState(0);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [monthlyReturns, setMonthlyReturns] = useState<MonthlyReturn[]>([]);
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
        .limit(80);

      const { data: settings } = await supabase
        .from('portfolio_settings')
        .select('initial_balance')
        .eq('id', 1)
        .single();
      const initialBalance = settings ? Number(settings.initial_balance) : null;

      if (open) {
        setOpenCount(open.length);
      }
      if (closed && closed.length > 0) {
        setMonthlyReturns(buildMonthlyPortfolioReturns(closed, initialBalance, 3));
      }
    } catch (e) {
      // בלי try/catch כאן, שגיאה הייתה משאירה את התצוגה בשקט על 0 עסקאות בלי שום סימן לבעיה
      console.error('homepage loadTrades failed', e);
    }
  }

  // גוללת לכפתור ההתראות בראש הדף ומדגישה אותו לרגע (פעימת מסגרת) - כדי שכפתורי "הפעלה ללא
  // עלות" במקומות אחרים בדף לא ישאירו את המשתמש תוהה לאן בדיוק להסתכל אחרי הגלילה
  function scrollToHeroNotify() {
    const el = document.getElementById('hero-notify');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('attention-pulse');
    window.setTimeout(() => el.classList.remove('attention-pulse'), 1700);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ gap: '8px' }}>
          <Link href="/login" className="nav-cta-profit">כניסה לסוחרים</Link>
        </div>
      </header>

      <div className="hero-v2">
        <div className="eyebrow">שירן דימור</div>
        <h1>שוק ההון הרבה יותר <em>פשוט</em><br />ממה שעושים ממנו.</h1>
        <p>אני שירן, ואני כאן כדי להראות לך שלא צריך לדעת הכול כדי להתחיל - <strong>צריך רק לדעת מה לעשות</strong>. עקרונות בסיסיים, ניהול סיכון ותוכנית עבודה מסודרת - בלי הבטחות תשואה, בלי "שיטת פלא", ובלי שזה יהפוך למשרה שנייה (יש לך כבר אחת, ואני לא רוצה את השנייה).</p>

        <div id="hero-notify">
          <PushNotificationButton variant="hero" autoOpenLeadForm={autoOpenNotifications} />
        </div>
      </div>

      <Reveal className="quick-link-row">
        <div className="quick-link-grid">
          <Link href="/trading-plan" className="quick-link-pill">📝 תוכנית מסחר</Link>
          <Link href="/lives" className="quick-link-pill">🎥 מסחר בזמן אמת</Link>
          <Link href="/portfolio" className="quick-link-pill">📊 תיק מסחר</Link>
          <Link href="/lessons" className="quick-link-pill">📚 ספריית שיעורים</Link>
          <Link href="/business" className="quick-link-pill">🏢 לארגונים</Link>
        </div>
        <Link href="/subscribe" className="quick-link-accent">💬 מדברים עסקאות - חודש ראשון ב-₪1 ←</Link>
      </Reveal>

      <Reveal className="trust-strip">
        <div className="trust-item"><div className="num"><CountUp value={0} suffix="%" /></div><div className="lbl">הבטחות תשואה</div></div>
        <div className="trust-item"><div className="num"><CountUp value={100} suffix="%" /></div><div className="lbl">שקיפות, כולל הפסדים</div></div>
        <div className="trust-item"><div className="num"><CountUp value={3} /></div><div className="lbl">סגנונות מסחר, קהילה אחת</div></div>
      </Reveal>

      <Reveal className="about-feature">
        <div className="af-photo-ring"><img className="af-photo" src="/shiran-photo.jpg" alt="שירן דימור" /></div>
        <div className="af-text">
          <div className="af-label">מי אני</div>
          <p className="af-main">שירן דימור, סוחרת 14 שנה בשוק. לא הפכתי למיליארדרית, ולא אבטיח לך שזה יקרה. מה שכן - <strong>למדתי לנהל סיכונים כמו שצריך</strong>, פחות מלהיב מרכב יוקרה באינסטגרם, אבל הרבה יותר מציאותי לאורך זמן. ואת זה אני רוצה ללמד גם אותך.</p>
        </div>
      </Reveal>

      <Reveal>
        <div className="section-label"><h2>אז למי זה מתאים?</h2></div>
        <div className="tag-row">
          <span className="tag-chip">שכירים</span><span className="tag-chip">הורים</span><span className="tag-chip">עצמאיים</span><span className="tag-chip">סטודנטים</span><span className="tag-chip">עם ניסיון לא מוצלח</span><span className="tag-chip">בלי שום ניסיון</span>
        </div>

        <details className="section-collapse">
          <summary>
            <h2>עוד קצת פרטים - למי זה כן ולא מתאים</h2>
            <span className="collapse-chevron">▾</span>
          </summary>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '14px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>אנשים רגילים, לא סוחרים במשרה מלאה</strong> - שרוצים שהחיסכון שלהם יעשה משהו חוץ מלשבת בעו"ש, בלי לשבת כל היום מול מסכים ובלי לעזוב את מה שהם כבר עושים.
            </p>
            <div className="stat-callout" style={{ marginBottom: '20px' }}>
              <div className="sc-num"><CountUp value={90} suffix="%" /></div>
              <p>הסיבה האמיתית לכך שרוב האנשים לא מתחילים להשקיע, או נושרים אחרי כמה חודשים, היא לא חוסר ידע - זה <strong>הפן המנטלי</strong>. הפחד להפסיד, הקושי לקבל הפסד, וחוסר הסבלנות להישאר בתהליך. אבל בעיקר הבהלה מהתחום עצמו, וההרגשה של "צריך לדעת המון" ו"מה אני בכלל קשור לזה".</p>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--loss)', marginBottom: '8px' }}>למי זה פחות מתאים</div>
            <div className="not-fit" style={{ marginBottom: '20px' }}>
              <div>– מי שמחפש רווח מובטח או כסף מהיר (אין כאן קוד סודי שפיצחתי לבד, ואני לא ממציאה מחדש את הגלגל - יש שיטה שעובדת, לא קסם)</div>
              <div>– מי שרוצה שמישהי אחרת תקבל עבורו את כל ההחלטות</div>
              <div>– מי שמתכוון לסחור בכסף שהוא צריך למחיה, או בהלוואה</div>
              <div>– מי שלא מבין שהפסדים הם חלק מהמסחר</div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--profit)', marginBottom: '8px' }}>למי זה כן מתאים</div>
            <div className="not-fit">
              <div>– מי שרוצה תיק מסחר אמיתי ושקוף, כולל רווחים והפסדים</div>
              <div>– מי שרוצה ליווי אישי ממני וקהילה תומכת לאורך הדרך</div>
              <div>– מי שרוצה ללמוד גם את החלק הכי משמעותי - הפן המנטאלי</div>
              <div>– מי שרוצה גישה למסחר תוך-יומי, סווינג והשקעות לטווח ארוך</div>
            </div>
          </div>
        </details>
      </Reveal>

      <Reveal>
        <div className="section-label" style={{ marginTop: '30px' }}><h2>אז איך זה נראה, תכלס?</h2></div>
        <div className="portfolio-teaser">
          <div className="pt-head">
            <div className="pt-title">התיק של שירן</div>
            <span className="pt-badge">{openCount} עסקאות פתוחות כרגע</span>
          </div>

          {monthlyReturns.length > 0 ? (
            <>
              <MonthlyReturnBubbles months={monthlyReturns} />
              <p style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '8px', marginBottom: 0 }}>
                רווח/הפסד בפועל על התיק, ל-3 החודשים האחרונים - כולל ההפסדים, לא רק ההצלחות.
              </p>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '10px 0' }}>עדיין אין עסקאות סגורות להצגה</div>
          )}

          <Link className="teaser-cta" href="/portfolio">צפייה בתיק המסחר המלא, לפי חודש ותאריך ←</Link>
        </div>
      </Reveal>

      <Reveal>
        <details className="section-collapse">
          <summary>
            <h2>איך מתחילים? השוואה מלאה בין שני המסלולים</h2>
            <span className="collapse-chevron">▾</span>
          </summary>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px' }}>
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
                  <div><strong>עדכון בזמן אמת</strong> לנייד כשמשהו קורה בשוק, כולל תזכורת לפני כל מפגש</div>
                  <div><strong>ספרייה מלאה</strong> של וובינרים ומצגות, בלי עלות נוספת</div>
                  <div>הפעלה בלחיצה אחת - <strong>ללא התחייבות</strong> וללא עלות</div>
                  <div>אפשר לשדרג ל"מדברים עסקאות" בכל שלב, <strong>בקצב האישי</strong></div>
                </div>
                <a className="gc-cta" href="#hero-notify" onClick={(e) => { e.preventDefault(); scrollToHeroNotify(); }}>הפעלה ללא עלות ↑</a>
              </div>
              <div className="group-card paid">
                <div className="gc-tag">צעד 2 · גישה מלאה</div>
                <h3>מדברים עסקאות</h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '10px' }}>
                  <strong style={{ color: 'var(--lavender)' }}>סוחרים ביחד איתי, בלי ידע מוקדם</strong>.
                </p>
                <div className="gc-price">₪400 לחודש <span style={{ color: 'var(--profit)', fontWeight: 600 }}>· חודש ראשון ב-₪1</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>מנוי חודשי · ללא התחייבות</div>
                <div className="gc-perks">
                  <div>כל מה שיש בעדכונים החינמיים - <strong>ועוד</strong>:</div>
                  <div>בניית <strong>תיק השקעות</strong> - תוך יומי, סווינג, טווח ארוך</div>
                  <div><strong>מסחר בזמן אמת עם שירן</strong> - שאלות, ניתוחים ולמידה חיה</div>
                  <div><strong>ליווי אישי</strong> - לצד קהילת סוחרים סגורה לדיון מעמיק</div>
                  <div><strong>יומן מסחר שקוף</strong> - כולל עסקאות מפסידות</div>
                  <div><strong>תיק מסחר</strong> אישי וניתוח העסקאות ע"י שירן</div>
                </div>
                <Link className="gc-cta" href="/subscribe">לפרטים על מדברים עסקאות</Link>
              </div>
            </div>
          </div>
        </details>
      </Reveal>

      <Reveal>
        <div className="section-label" style={{ marginTop: '30px' }}><h2>שאלות שנשאלות הרבה</h2></div>
      </Reveal>
      <div className="faq-list">
        <Reveal delay={0}>
          <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
            <summary>מי את בעצם, ומה עושים כאן?</summary>
            <p>אני שירן, סוחרת פעילה 14 שנה. בניתי כאן מקום שמלמד לנהל תיק השקעות אחראי - בלי הבטחות עושר ובלי שיטות פלא, רק עבודה שיטתית וליווי אמיתי. בונים תיק מסחר ביחד, רואים גם את ההפסדים ולא רק את ההצלחות, ומדברים תכלס על השוק בלי רעש מיותר. הכי פשוט להתחיל עם עדכונים בזמן אמת בחינם, ולהחליט משם אם רוצים להתקדם.</p>
            <a href="#hero-notify" className="faq-cta" onClick={(e) => { e.preventDefault(); scrollToHeroNotify(); }}>🔔 הפעלת עדכונים בזמן אמת - ללא עלות ←</a>
          </details>
        </Reveal>
        <Reveal delay={30}>
          <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
            <summary>צריך ניסיון קודם בשוק ההון?</summary>
            <p><strong>ממש לא</strong>. זה מתאים גם למי שמעולם לא סחר, וגם למי שכבר ניסה ולא הסתדר. מתחילים מהבסיס, ביחד.</p>
          </details>
        </Reveal>
        <Reveal delay={60}>
          <details className="faq-item" style={{ borderRightColor: 'var(--orange)' }}>
            <summary>צריך קודם לעשות קורס יקר?</summary>
            <p>לא. אפשר לשלם אלפי שקלים על קורס עם הבטחות ליאכטה, ועדיין לא לדעת אם התחום בכלל מתאים לך. הדרך הכי נכונה וזולה להבין את זה לעומק היא פשוט לנסות חודש שלם (₪1) ולראות מבפנים מה זה תיק השקעות, איך שוק ההון עובד בפועל, ומה השיטה - במקום לצבור תיאוריה על הנייר לפני שמעיזים.</p>
          </details>
        </Reveal>
        <Reveal delay={120}>
          <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
            <summary>כמה זמן ביום זה דורש?</summary>
            <p>זה נבנה בדיוק בשביל אנשים עם עבודה וחיים - לא צריך לשבת שעות מול המסך. אפשר להסתפק בהשקעה של כמה דקות כל כמה ימים. מסחר תוך-יומי הוא אופציה, לא חובה.</p>
          </details>
        </Reveal>
        <Reveal delay={180}>
          <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
            <summary>מה קורה אם אני רוצה לבטל?</summary>
            <p>אפשר לבטל בכל רגע נתון, בלי קנס ובלי שאלות. החיוב החודשי חוזר בתאריך ההרשמה שלך - למשל, מי שנרשם/ה ב-13 בחודש מחויב/ת כל 13 בחודש. ביטול עד יום לפני מועד החיוב הבא (כולל אותו יום, כלומר עד ה-12 בדוגמה) מונע את החיוב הבא. אם החיוב כבר בוצע - זה תשלום מראש על חודש נוסף, וההצטרפות ממשיכה עד סופו.</p>
          </details>
        </Reveal>
        <Reveal delay={240}>
          <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
            <summary>זה בטוח? יש סיכון להפסיד כסף?</summary>
            <p>כן, יש סיכון - זה שוק ההון, לא פיקדון בבנק ולא עסקה עם תוצאה מובטחת, ומי שמבטיח לך אחרת, תברח/י. המטרה שלי היא ללמד ניהול סיכון נכון, לא להבטיח רווחים.</p>
          </details>
        </Reveal>
        <Reveal delay={300}>
          <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
            <summary>כמה כסף צריך כדי להתחיל?</summary>
            <p>ברוב המקרים שראינו, סכום התחלתי שסביר ועובד נמצא בטווח ₪10,000-15,000 - אבל זה משתנה מאדם לאדם. יש מי שמתחילים עם תיק מסחר גדול יותר, ויש מי שמתחילים עם תיק קטן מזה. ויש גם כאלה שמתחילים בכלל בלי תיק מסחר משלהם, וסוחרים דרך תיקים ממומנים (Funded Accounts).</p>
          </details>
        </Reveal>
      </div>

      <Reveal>
        <div className="quote-block">
          <span className="qmark" aria-hidden="true">"</span>
          <p>השוק לא תמיד פשוט,<br />הדרך לסחור בו יכולה להיות.</p>
          <span className="qauthor">שירן דימור</span>
        </div>
      </Reveal>

      {showStickyCta && !hasFullAccess && (
        <div className="sticky-cta">
          <button onClick={scrollToHeroNotify}>
            הפעלת עדכונים בזמן אמת - ללא עלות
          </button>
        </div>
      )}
    </div>
  );
}
