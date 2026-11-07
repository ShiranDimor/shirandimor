'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { captureSourceFromUrl } from '@/lib/attribution';
import { trackFunnelEvent } from '@/lib/trackEvent';
import CountUp from '@/components/CountUp';
import MonthlyReturnBubbles from '@/components/MonthlyReturnBubbles';
import { buildMonthlyPortfolioReturns, type MonthlyReturn } from '@/lib/portfolioStats';

// דף נחיתה ייעודי לתנועה ממודעות פייסבוק/אינסטגרם - ר' ביקורת ה-CRO שבוצעה בנובמבר 2026.
// בכוונה בלי SiteHeader/ניווט בכלל: מי שמגיע/ה הנה כבר לחצ/ה על מודעה ספציפית (חודש ראשון
// ב-1₪) - מטרה אחת, בלי קישורי "תוכנית מסחר"/"לארגונים"/כניסה-לסוחרים שמסיטים את תשומת הלב.
// לא דף הבית - route נפרד לגמרי (לא /trial, שתפוס כהפניה ישנה - ר' app/trial/page.tsx)
export default function AdLandingPage() {
  const [openCount, setOpenCount] = useState(0);
  const [monthlyReturns, setMonthlyReturns] = useState<MonthlyReturn[]>([]);

  useEffect(() => {
    captureSourceFromUrl();
    trackFunnelEvent('ad_landing_page_view');
    loadTrades();
  }, []);

  async function loadTrades() {
    try {
      const res = await fetch(`/api/portfolio/trades?closedLimit=80&_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { open, closed, initialBalance } = await res.json();
      if (open) setOpenCount(open.length);
      if (closed && closed.length > 0) setMonthlyReturns(buildMonthlyPortfolioReturns(closed, initialBalance, 3));
    } catch (e) {
      // לא קריטי לעמוד הזה - אם נכשל, פשוט לא מציגים את בלוק ההוכחה החי, בלי לשבור את שאר הדף
    }
  }

  function ctaClick() {
    trackFunnelEvent('ad_landing_cta_click');
  }

  return (
    <div className="wrap" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <header style={{ justifyContent: 'center', borderBottom: 'none', marginBottom: '8px' }}>
        <span className="brand">מסחר <span>אחראי</span> במניות</span>
      </header>

      <div className="hero-v2">
        <div className="eyebrow">שירן דימור · 14 שנה בשוק</div>
        <h1>אני לא <em>מבטיחה</em><br />עולמות.</h1>
        <div className="about-feature" style={{ margin: '18px 0' }}>
          <div className="af-photo-ring"><img className="af-photo" src="/shiran-photo.jpg" alt="שירן דימור" /></div>
          <div className="af-text">
            <p className="af-main">אני מראה לך איך זה <strong>באמת</strong> נראה - גם רווחים, גם הפסדים, שלי. בלי קורס יקר, בלי שיטת פלא, רק עבודה שיטתית.</p>
          </div>
        </div>

        <a href="/subscribe" className="cta-main" onClick={ctaClick}>
          מתחילים - חודש ראשון ב-1₪
        </a>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', margin: '4px 0 0' }}>
          לאחר מכן ₪400/חודש · ביטול בלחיצה אחת, בכל עת
        </p>
      </div>

      <div className="trust-strip">
        <div className="trust-item"><div className="num"><CountUp value={0} suffix="%" /></div><div className="lbl">הבטחות תשואה</div></div>
        <div className="trust-item"><div className="num"><CountUp value={100} suffix="%" /></div><div className="lbl">שקיפות, כולל הפסדים</div></div>
        <div className="trust-item"><div className="num"><CountUp value={3} /></div><div className="lbl">סגנונות מסחר, קהילה אחת</div></div>
      </div>

      <div className="section-label" style={{ marginTop: '10px' }}><h2>מה מקבלים בחודש הראשון</h2></div>
      <div className="price-card" style={{ textAlign: 'right' }}>
        <div className="perk-list">
          <div>כניסה מלאה ל<strong>תיק המסחר החי שלי</strong> - איך ולמה אני נכנסת ויוצאת מכל עסקה</div>
          <div><strong>שידורי מסחר בזמן אמת</strong> שאפשר להצטרף אליהם ולשאול</div>
          <div><strong>קהילת סוחרים</strong> לדיון מעמיק, לא רק אני מדברת</div>
          <div>אפשרות לבנות <strong>תוכנית מסחר אישית</strong>, איתי</div>
        </div>
        <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, textAlign: 'center', marginTop: '14px' }}>
          גישה מלאה וזהה לכל מנוי אחר - לא גרסה מצומצמת. ₪1 זה אימות שיש בן אדם אמיתי מהצד השני, לא הנחה.
        </p>
      </div>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>אז איך זה נראה, תכלס?</h2></div>
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
        <Link className="teaser-cta" href="/portfolio">צפייה בתיק המסחר המלא ←</Link>
      </div>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>למי זה מתאים</h2></div>
      <div className="not-fit" style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--profit)' }}>✓ מי שרוצה תיק מסחר אמיתי ושקוף, כולל רווחים והפסדים</div>
        <div style={{ color: 'var(--profit)' }}>✓ מי שרוצה ליווי אישי וקהילה תומכת, בלי ניסיון קודם</div>
        <div style={{ color: 'var(--profit)' }}>✓ מי שיש לו קצת כסף בצד ורוצה שזה יעשה משהו, בלי לשבת כל היום מול מסכים</div>
      </div>
      <div className="not-fit" style={{ marginBottom: '20px' }}>
        <div style={{ color: 'var(--loss)' }}>✗ מי שמחפש רווח מובטח או כסף מהיר</div>
        <div style={{ color: 'var(--loss)' }}>✗ מי שמתכוון לסחור בכסף שהוא צריך למחיה</div>
      </div>

      <div className="section-label" style={{ marginTop: '10px' }}><h2>שאלות שבטוח יש לך</h2></div>
      <div className="faq-list" style={{ marginBottom: '30px' }}>
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>זה עוד עוקץ?</summary>
          <p>אני מראה לך תיק מסחר אמיתי עם מספרים אמיתיים, כולל חודשים מפסידים - אפשר לבדוק את זה בעצמך לפני שאת/ה משלם/ת שקל (<Link href="/portfolio" style={{ color: 'var(--lavender)' }}>תיק המסחר המלא</Link>).</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
          <summary>מה אם אני מפסיד/ה כסף?</summary>
          <p>זה שוק ההון, לא פיקדון - יש סיכון אמיתי. אני מלמדת ניהול סיכון, לא מבטיחה רווח. מי שמבטיח לך רווח - תברח/י.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--orange)' }}>
          <summary>אין לי זמן לזה</summary>
          <p>זה נבנה בדיוק בשביל אנשים עם עבודה וחיים - כמה דקות כל כמה ימים, לא עוד משרה.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--lavender)' }}>
          <summary>אני לא מבין/ה כלום במסחר</summary>
          <p>זה בדיוק למי שמתחיל/ה מאפס. מתחילים מהבסיס, ביחד, בלי קורס מקדים.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>מה קורה אחרי החודש ב-1₪?</summary>
          <p>ממשיכים אוטומטית ב-₪400/חודש, אלא אם מבטלים - בלחיצה אחת, לפני מועד החיוב הבא, בלי שיחת מכירות ובלי קנס.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--profit)' }}>
          <summary>אפשר לדבר עם מישהי לפני?</summary>
          <p>כן - יש כפתור וואטסאפ צף בתחתית המסך, תמיד.</p>
        </details>
      </div>

      <div className="sticky-cta">
        <a href="/subscribe" onClick={ctaClick}>מתחילים - חודש ראשון ב-1₪</a>
      </div>
    </div>
  );
}
