import type { Metadata } from 'next';
import Link from 'next/link';
import BackButton from '../business/BackButton';
import ContactButtons from '../business/ContactButtons';
import StickyCta from '../business/StickyCta';
import '../business/business.css';
import './mentoring.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://shirandimor.com'),
  title: 'ליווי אישי במסחר, אחד על אחד | שירן דימור',
  description:
    'ליווי אישי של 3 או 4 חודשים: 6 מפגשי זום, יומן מסחר משותף, ניתוח עסקאות וזמינות בין המפגשים, כולל הצטרפות לקבוצת הסוחרים לכל תקופת הליווי.',
  openGraph: {
    title: 'ליווי אישי במסחר, אחד על אחד, עם שירן דימור',
    description: '6 מפגשי זום, יומן מסחר משותף וזמינות בין המפגשים. 3 או 4 חודשים, כולל קבוצת הסוחרים.',
    images: ['/business/shiran.jpg'],
    locale: 'he_IL',
    type: 'website',
  },
};

const PHONE_DISPLAY = '054-716-7419';
const PHONE_TEL = '+972547167419';
const EMAIL = 'shiran@shirandimor.com';
const WHATSAPP_URL =
  'https://wa.me/972547167419?text=' +
  encodeURIComponent('היי שירן, הגעתי מהעמוד של הליווי האישי ואשמח לשמוע עוד');
const EMAIL_SUBJECT = 'ליווי אישי במסחר';
const CTA_LABEL = 'בואו נדבר על הליווי';

const GROUP_MONTHLY_PRICE = 400;

const TRACKS = [
  {
    key: 'basic',
    label: 'מסלול אישי',
    months: 3,
    price: 7500,
    installments: '3 תשלומים של 2,500 ₪',
    journal: 'מעבר על היומן פעם בשבועיים',
    response: 'מענה בוואטסאפ תוך 24 שעות בימי מסחר',
    extra: null as string | null,
  },
  {
    key: 'extended',
    label: 'מסלול אישי מורחב',
    months: 4,
    price: 8900,
    installments: '4 תשלומים של 2,225 ₪',
    journal: 'מעבר על היומן כל שבוע',
    response: 'מענה בוואטסאפ באותו יום מסחר',
    extra: 'סיכום כתוב של היומן ותוכנית המשך לסחור לבד',
  },
];

const SESSIONS = [
  { title: 'היכרות ובניית הבסיס', body: 'מטרות, הון, זמן פנוי וניסיון קודם. פותחים יחד את יומן המסחר ומגדירים פלטפורמה.' },
  { title: 'קריאת גרף ומגמה', body: 'תמיכות והתנגדויות, ממוצעים נעים, ואיך מזהים מה מצב השוק הכללי.' },
  { title: 'שיטת הסווינג', body: 'איך מאתרים מניות, מה הם סטאפים לכניסה, ובניית רשימת מעקב שבועית.' },
  { title: 'ניהול סיכונים', body: 'סטופ לוס, גודל פוזיציה לפי אחוז סיכון ויציאה מעסקה. כאן נסגרת התוכנית הכתובה שלך.' },
  { title: 'פסיכולוגיה ומשמעת', body: 'מעבר על הטעויות מהיומן, טריגרים רגשיים, ואיך נשארים בתוכנית גם ברצף הפסדים.' },
  { title: 'סיכום והמשך עצמאי', body: 'ניתוח כל העסקאות מהתקופה, מה לחזק ומה לתקן, ואיך ממשיכים לסחור לבד.' },
];

function Logo() {
  return (
    <svg width="34" height="24" viewBox="0 0 40 28" aria-hidden="true">
      <rect x="0" y="0" width="40" height="6" rx="3" fill="#C0533D" />
      <rect x="8" y="11" width="32" height="6" rx="3" fill="#4E7262" />
      <rect x="16" y="22" width="24" height="6" rx="3" fill="#C0533D" />
    </svg>
  );
}

function shekels(n: number) {
  return n.toLocaleString('he-IL') + ' ₪';
}

export default function MentoringPage() {
  return (
    <main className="biz">
      <StickyCta whatsappUrl={WHATSAPP_URL} label="שירן דימור, ליווי אישי במסחר" ctaText={CTA_LABEL} />
      <section className="biz-hero">
        <div className="biz-inner">
          <div className="biz-top">
            <BackButton />
            <Link href="/" className="biz-brand">
              <Logo />
              מסחר אחראי במניות
            </Link>
          </div>

          <div className="biz-hero-grid">
            <div>
              <span className="biz-pill">ליווי אישי, אחד על אחד</span>
              <h1>
                לבנות שיטת מסחר <span className="c1">משלך,</span> <span className="c2">עם מישהי שמלווה כל עסקה.</span>
              </h1>
              <p className="biz-hero-sub">
                לא קורס מוקלט ולא כיתה. 3 או 4 חודשים שבהם אנחנו בונות או בונים יחד תוכנית מסחר, מנהלים יומן מסחר
                משותף, ומנתחים כל עסקה: מה עבד, מה לא, ומה משנים בפעם הבאה.
              </p>
              <div className="biz-actions">
                <a className="biz-btn biz-btn-primary" href="#contact">{CTA_LABEL}</a>
                <a className="biz-btn biz-btn-ghost" href="#tracks">למסלולים ולמחירים</a>
              </div>
            </div>
            <div className="biz-hero-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="biz-photo" src="/business/shiran.jpg" alt="שירן דימור" />
              <div className="biz-photo-name">שירן דימור</div>
              <div className="biz-photo-role">סוחרת ומשקיעה כבר 14 שנה, מייסדת קהילת ״מדברים עסקאות״</div>
            </div>
          </div>
        </div>
      </section>

      <div className="biz-inner">
        <section className="biz-section">
          <h2>
            למי הליווי <span className="c1">מתאים</span>
          </h2>
          <p className="biz-lead">
            למי שרוצה ללמוד מסחר סווינג במניות בצורה אחראית, עם ניהול סיכונים אמיתי וציפיות מציאותיות. במקום הבטחות
            לרווח, עובדים על מה שבאמת תלוי בך: תהליך קבלת ההחלטות, המשמעת והלמידה מהטעויות.
          </p>
          <div className="biz-grid-2">
            <div className="biz-card">
              <span className="biz-num">1</span>
              <h3>תוכנית מסחר אישית כתובה</h3>
              <p>גודל פוזיציה, חשיפה מקסימלית, כללי כניסה ויציאה. מותאמת להון ולזמן שלך.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num sage">2</span>
              <h3>יומן מסחר משותף</h3>
              <p>כל עסקה נרשמת, ואני עוברת עליה ונותנת משוב על התהליך, לא רק על התוצאה.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num sage">3</span>
              <h3>ניתוח עסקאות וטעויות</h3>
              <p>מה עבד, מה לא, ומה משנים בעסקה הבאה. ככה לומדים באמת.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num">4</span>
              <h3>קבוצת הסוחרים לכל התקופה</h3>
              <p>סקירות שוק, העסקאות שלי בזמן אמת, וסביבה של סוחרים שלומדים יחד. בלי תוספת תשלום.</p>
            </div>
          </div>
        </section>

        <section className="biz-section" id="tracks">
          <h2>
            שני מסלולים, <span className="c1">לפי הזמן שמתאים לך</span>
          </h2>
          <p className="biz-lead">
            המסלול המורחב הוא המומלץ: בסווינג עסקה נמשכת ימים עד שבועות, וארבעה חודשים מספיקים כדי לצבור מספיק
            עסקאות ביומן, לזהות דפוסים ולתקן אותם.
          </p>

          <div className="biz-tracks mnt-tracks">
            {TRACKS.map((t) => {
              const groupValue = t.months * GROUP_MONTHLY_PRICE;
              const featured = t.key === 'extended';
              return (
                <div key={t.key} className={`biz-track${featured ? ' featured' : ''}`}>
                  {featured && <span className="biz-track-badge">מומלץ</span>}
                  <span className="biz-track-label">{t.label}</span>
                  <h3>{t.months} חודשים</h3>
                  <span className="biz-track-meta">6 מפגשי זום אישיים, שעה כל אחד</span>
                  <ul>
                    <li>בניית תוכנית מסחר אישית</li>
                    <li>{t.journal}</li>
                    <li>ניתוח עסקאות וטעויות</li>
                    <li>{t.response}</li>
                    {t.extra && <li>{t.extra}</li>}
                    <li>
                      קבוצת הסוחרים ל־{t.months} חודשים <span className="mnt-value">(שווי {shekels(groupValue)})</span>
                    </li>
                  </ul>
                  <div className="mnt-price">
                    <strong>{shekels(t.price)}</strong>
                    <span>או {t.installments}</span>
                  </div>
                  <a
                    className={`biz-btn ${featured ? 'biz-btn-primary' : 'biz-btn-ghost'} mnt-track-cta`}
                    href={
                      'https://wa.me/972547167419?text=' +
                      encodeURIComponent(`היי שירן, אשמח לשמוע על ה${t.label} (${t.months} חודשים)`)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    לפרטים על המסלול
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        <section className="biz-section">
          <h2>
            תוכנית <span className="c2">6 המפגשים</span>
          </h2>
          <p className="biz-lead">
            המפגשים מתפרסים על כל התקופה, בערך פעם בשבועיים בתלת־חודשי ופעם בשלושה שבועות במורחב. כך יש זמן ליישם
            את החומר בעסקאות אמיתיות לפני המפגש הבא. כל מפגש מוקלט ונשלח לצפייה חוזרת.
          </p>
          <ol className="mnt-sessions">
            {SESSIONS.map((s, i) => (
              <li key={s.title} className="biz-card">
                <span className={`biz-num${i % 2 ? ' sage' : ''}`}>{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="biz-section">
          <h2>
            הליווי <span className="c1">בין המפגשים</span>
          </h2>
          <div className="biz-faq">
            <div>
              <h3>איפה?</h3>
              <p>בוואטסאפ, בכתב או בהודעה קולית, כולל צילומי גרפים.</p>
            </div>
            <div>
              <h3>מתי?</h3>
              <p>בימים א׳–ה׳, ימי המסחר בארה״ב. זמן המענה לפי המסלול.</p>
            </div>
            <div>
              <h3>על מה שואלים?</h3>
              <p>על עסקה שביצעת, על החומר מהמפגשים ועל מה שרשמת ביומן.</p>
            </div>
            <div>
              <h3>מה לא?</h3>
              <p>אין המלצות לקנות או למכור מניה מסוימת. המטרה היא שתלמד או תלמדי להחליט לבד.</p>
            </div>
          </div>
        </section>

        <section className="biz-section">
          <div className="biz-about">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/business/shiran.jpg" alt="שירן דימור" loading="lazy" />
            <div>
              <h2>
                נעים להכיר, <span className="c2">אני שירן</span>
              </h2>
              <p>
                אני סוחרת ומשקיעה כבר 14 שנה, בעיקר בסווינג. אני לא ״גורו״ ולא מבטיחה רווחים. אני מראה גם את
                ההפסדים, כי מהם לומדים הכי הרבה.
              </p>
              <p>
                בליווי האישי אני לוקחת את מה שעובד לי לאורך השנים, ובונה איתך שיטה שמתאימה לך: להון, לזמן ולאופי שלך.
              </p>
            </div>
          </div>
        </section>

        <section className="biz-dark biz-contact" id="contact">
          <h2>{CTA_LABEL}</h2>
          <p>שיחה קצרה כדי להכיר, להבין מה המטרות שלך, ולבדוק יחד איזה מסלול מתאים. בלי התחייבות.</p>
          <ol className="biz-steps">
            <li><strong>שולחים הודעה</strong><span>בוואטסאפ, בטלפון או במייל</span></li>
            <li><strong>שיחת היכרות קצרה</strong><span>מכירים, מדברים על הניסיון והמטרות, ובוחרים מסלול</span></li>
            <li><strong>מתחילים</strong><span>קובעים את המפגש הראשון ומצטרפים לקבוצת הסוחרים</span></li>
          </ol>
          <ContactButtons
            whatsappUrl={WHATSAPP_URL}
            phoneDisplay={PHONE_DISPLAY}
            phoneTel={PHONE_TEL}
            email={EMAIL}
            emailSubject={EMAIL_SUBJECT}
          />
        </section>

        <p className="biz-disclaimer">
          הליווי הוא לימודי בלבד ואינו מהווה ייעוץ השקעות או שיווק השקעות המותאם לצרכים אישיים. מסחר בשוק ההון כרוך
          בסיכון ממשי, כולל אובדן הון, וכל החלטות המסחר הן באחריות המשתתף בלבד. תוצאות עבר אינן מבטיחות תוצאות בעתיד.
        </p>

        <footer className="biz-foot">
          <Link href="/">shirandimor.com</Link>
        </footer>
      </div>
    </main>
  );
}
