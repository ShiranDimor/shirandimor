'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [lastClosed, setLastClosed] = useState<Trade | null>(null);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    loadTrades();
  }, []);

  async function loadTrades() {
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
        <div className="brand">מסחר <span>אחראי</span> במניות</div>
        <Link href="/login" className="nav-link">כניסה לסוחרים</Link>
      </header>

      <div className="hero-v2">
        <div className="eyebrow">שירן דימור</div>
        <h1>שוק ההון הרבה יותר <em>פשוט</em><br />ממה שעושים ממנו.</h1>
        <p>לא צריך לדעת הכול. צריך לדעת מה לעשות. אנחנו קהילת סוחרים אקטיביים שמלמדת עקרונות בסיסיים, ניהול סיכון ותוכנית עבודה מסודרת - בלי הבטחות תשואה, בלי "שיטת פלא" ובלי להפוך את זה למשרה נוספת.</p>

        {!showLeadForm && (
          <button className="cta-main" style={{ border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => setShowLeadForm(true)}>
            הצטרפות לקבוצת העדכונים - חינם
          </button>
        )}

        {showLeadForm && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '10px', padding: '16px', marginBottom: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              ההצטרפות מתבצעת ישירות דרך וואטסאפ - לחיצה על הכפתור תפתח את הקבוצה ותוכלי להצטרף בלחיצה אחת.
            </p>
            <a href="https://chat.whatsapp.com/GEf9Y4vFRDSEWKixrETWcg" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'block', textDecoration: 'none' }}>
              פתיחת קבוצת הוואטסאפ ←
            </a>
          </div>
        )}

        <Link className="cta-sub-link" href="/subscribe">להכיר את קבוצת הסוחרים <span>←</span></Link>
      </div>

      <div className="trust-strip">
        <div className="trust-item"><div className="num">0%</div><div className="lbl">הבטחות תשואה</div></div>
        <div className="trust-item"><div className="num">100%</div><div className="lbl">שקיפות, כולל כשלים</div></div>
        <div className="trust-item"><div className="num">3</div><div className="lbl">סגנונות מסחר, קבוצה אחת</div></div>
      </div>

      <div className="about-feature">
        <img className="af-photo" src="/shiran-photo.jpg" alt="שירן דימור" />
        <div className="af-text">
          <div className="af-label">מי אני</div>
          <p className="af-main">שירן דימור, סוחרת 14 שנה בשוק. לא הפכתי למיליארדרית, ולא אבטיח לך שזה יקרה. למדתי לנהל סיכונים כמו שצריך - פחות מלהיב מרכב יוקרה באינסטגרם, אבל הרבה יותר מציאותי לאורך זמן.</p>
        </div>
      </div>

      <div className="section-label"><h2>למי זה מתאים</h2></div>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '12px' }}>
        <strong style={{ color: 'var(--text-primary)' }}>אנשים רגילים, לא סוחרים במשרה מלאה.</strong> אנשים שרוצים לגרום לכסף שלהם לעבוד בשבילם, בלי לשבת כל היום מול מסכים ובלי לעזוב את מה שהם כבר עושים.
      </p>
      <div className="tag-row">
        <span className="tag-chip">שכירים</span><span className="tag-chip">הורים</span><span className="tag-chip">עצמאיים</span><span className="tag-chip">סטודנטים</span><span className="tag-chip">עם ניסיון לא מוצלח</span><span className="tag-chip">בלי שום ניסיון</span>
      </div>
      <div className="stat-callout">
        <div className="sc-num">90%</div>
        <p>הסיבה האמיתית לכך שרוב האנשים לא מתחילים להשקיע, או נושרים אחרי כמה חודשים - זה לא חוסר ידע. זה <strong>הפן המנטלי</strong>: הפחד להפסיד, הקושי לקבל הפסד, וחוסר הסבלנות להישאר בתהליך. אבל בעיקר - הבהלה מהתחום עצמו, וההרגשה של "צריך לדעת המון" ו"מה אני בכלל קשור לזה".</p>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>בלי הפתעות</h2></div>
      <div className="wont-find">
        <div className="wf-col">
          <div className="wf-title no">✕ מה שלא תקבלו ממני</div>
          <div className="wf-item">הבטחות ל"עצמאות כלכלית תוך חודש"</div>
          <div className="wf-item">תמונות של רכבי יוקרה וכרטיסי טיסה</div>
          <div className="wf-item">"פיצחתי את הקוד, ורק אני אגלה לך"</div>
          <div className="wf-item">להראות לכם רק רווחים מפוצצים</div>
        </div>
        <div className="wf-col">
          <div className="wf-title yes">✓ מה שכן תקבלו ממני</div>
          <div className="wf-item">מסחר תוך-יומי, סווינג והשקעות לטווח ארוך - הכל במקום אחד</div>
          <div className="wf-item">וובינרים חיים וליווי אישי לאורך הדרך</div>
          <div className="wf-item">יומן מסחר אמיתי - כולל עסקאות שהפסידו</div>
          <div className="wf-item">קהילה שמדברת גם על הצד הפסיכולוגי</div>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>אז איך זה נראה, תכלס?</h2></div>
      <div className="portfolio-teaser">
        <div className="pt-head">
          <div className="pt-title">התיק בקבוצת הסוחרים</div>
          <div className="pt-badge">{openCount} עסקאות פתוחות</div>
        </div>
        {openTrades.length === 0 && !lastClosed && (
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '10px 0' }}>עדיין אין עסקאות להצגה</div>
        )}
        {openTrades.map((trade) => {
          const pct = pctChange(trade);
          return (
            <div className="teaser-row" key={trade.id}>
              <span className="sym blurred">{trade.symbol}</span>
              <span className="pnl" style={{ color: pct >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
            </div>
          );
        })}
        {lastClosed && (
          <div className="teaser-row">
            <span className="sym" style={{ color: 'var(--text-secondary)' }}>{lastClosed.symbol} (נסגרה)</span>
            <span className="pnl" style={{ color: pctChange(lastClosed) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{pctChange(lastClosed) >= 0 ? '+' : ''}{pctChange(lastClosed).toFixed(2)}%</span>
          </div>
        )}
        <Link className="teaser-cta" href="/portfolio">צפייה בתיק המסחר המלא ←</Link>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>איפה נמצא לכם מקום</h2></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>רוצים רק לעקוב ולהתעדכן, או שאתם רוצים תכלס להתחיל לבנות תיק ולהיכנס לעסקאות?</p>
      <div className="groups-compare">
        <div className="group-card free">
          <h3>קבוצת עדכונים</h3>
          <div className="gc-price">חינם</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>בלי חובת רכישה, בלי לחץ</div>
          <div className="gc-perks">
            <div>עדכונים בלי רעש - מה שבאמת קורה בשוק, בלי הצפה של הודעות</div>
            <div>הצצה לעולם שוק ההון, בלי לשלם עליה אלפי שקלים</div>
            <div>מושג אחד בשבוע - פשוט, ברור, ואפשר להשתמש בו מיד</div>
            <div>הצטרפות בלחיצה אחת, בלי התחייבות ובלי מכירות</div>
          </div>
          <a className="gc-cta" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo(0, 0); setShowLeadForm(true); }}>הצטרפות חינם</a>
        </div>
        <div className="group-card paid">
          <div className="gc-tag">גישה מלאה</div>
          <h3>קבוצת הסוחרים <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 400 }}>· "מדברים עסקאות"</span></h3>
          <div className="gc-price">₪400 לחודש <span style={{ color: 'var(--profit)', fontWeight: 600 }}>· חודש ראשון ב-₪200</span></div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-10px', marginBottom: '14px' }}>מנוי חודשי · ללא התחייבות</div>
          <div className="gc-perks">
            <div><strong>בניית תיק השקעות</strong> - תוך יומי, סווינג, טווח ארוך</div>
            <div>וובינרים לייב - שאלות, ניתוחים ולמידה בזמן אמת</div>
            <div><strong>ליווי אישי</strong> לצד קהילה סגורה לדיון מעמיק</div>
            <div><strong>יומן מסחר שקוף</strong> - כולל עסקאות מפסידות</div>
            <div>תיק מסחר אישי וניתוח העסקאות ע"י שירן</div>
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
          <p>אפשר לבטל בכל רגע נתון. בלי קנס ובלי שאלות - לא צריך להמציא סיפור קורע לב, פשוט שולחים הודעת וואטסאפ.</p>
        </details>
        <details className="faq-item" style={{ borderRightColor: 'var(--teal)' }}>
          <summary>זה בטוח? יש סיכון להפסיד כסף?</summary>
          <p>כן, יש סיכון - זה שוק ההון, לא הבטחה. המטרה של הקבוצה היא ללמד ניהול סיכון נכון, לא להבטיח רווחים.</p>
        </details>
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>בכנות - למי זה כנראה לא מתאים</h2></div>
      <div className="not-fit">
        <div>– מי שמחפש רווח מובטח או כסף מהיר</div>
        <div>– מי שרוצה שמישהי אחרת תקבל עבורו את כל ההחלטות</div>
        <div>– מי שמתכוון לסחור בכסף שהוא צריך למחיה, או בהלוואה</div>
        <div>– מי שלא מוכן לקבל שיהיו גם הפסדים</div>
      </div>

      <div className="quote-block">
        <p>"השוק לא תמיד פשוט. הדרך שבה סוחרים בו יכולה להיות."</p>
        <span>- שירן דימור -</span>
      </div>

      <footer>
        מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.<br />
        <Link href="/terms" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>תקנון</Link> · <Link href="/privacy" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>מדיניות פרטיות</Link>
      </footer>
    </div>
  );
}
