import type { Metadata } from 'next';
import Link from 'next/link';
import BackButton from './BackButton';
import ContactOptions from './ContactOptions';
import ContactButtons from './ContactButtons';
import { CLIENT_LOGOS, EVENT_PHOTOS, TESTIMONIALS } from './socialProof';
import './business.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://shirandimor.com'),
  title: 'מפגשים וסדנאות לארגונים | שירן דימור',
  description:
    'מפגשים וסדנאות לעובדים על כסף ושוק ההון: פרקטי, בגובה העיניים ובלי צורך בידע קודם. בלי המלצות על מניות, בלי הבטחות ובלי מכירות לעובדים.',
  openGraph: {
    title: 'מפגש על כסף ושוק ההון שהעובדים שלכם באמת ירצו להגיע אליו',
    description: 'מפגשים וסדנאות לעובדים עם שירן דימור: מפגש אחד, 3 או 5 מפגשים, מותאם לארגון.',
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
  encodeURIComponent('היי שירן, הגעתי מהעמוד לארגונים ואשמח לשמוע על מפגש לעובדים שלנו');
const EMAIL_SUBJECT = 'מפגש לעובדים בארגון שלנו';
const CTA_LABEL = 'בואו נדבר 15 דקות';

function Logo() {
  return (
    <svg width="34" height="24" viewBox="0 0 40 28" aria-hidden="true">
      <rect x="0" y="0" width="40" height="6" rx="3" fill="#C0533D" />
      <rect x="8" y="11" width="32" height="6" rx="3" fill="#4E7262" />
      <rect x="16" y="22" width="24" height="6" rx="3" fill="#C0533D" />
    </svg>
  );
}

export default function BusinessPage() {
  return (
    <main className="biz">
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
              <span className="biz-pill">מפגשים וסדנאות לעובדים</span>
              <h1>
                מפגש על כסף ושוק ההון <span className="c1">שהעובדים שלכם</span> <span className="c2">באמת ירצו להגיע אליו.</span>
              </h1>
              <p className="biz-hero-sub">
                בלי הבטחות להתעשרות, בלי המלצות על מניות ובלי מכירות. מפגש פרקטי בגובה העיניים, שנותן לעובדים כלים
                להבין איך מתחילים ומה אפשר לעשות עם הכסף שלהם.
              </p>
              <div className="biz-actions">
                <a className="biz-btn biz-btn-primary" href="#contact">{CTA_LABEL}</a>
                <a className="biz-btn biz-btn-ghost" href="#tracks">לסוגי המפגשים</a>
              </div>
            </div>
            <div className="biz-hero-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="biz-photo" src="/business/shiran.jpg" alt="שירן דימור" />
              <div className="biz-photo-name">שירן דימור</div>
              <div className="biz-photo-role">משקיעה וסוחרת, מייסדת קהילת ״מדברים עסקאות״</div>
            </div>
          </div>
        </div>
      </section>

      <div className="biz-inner">
        <div className="biz-stats">
          <div className="biz-stat"><strong>14 שנה</strong><span>בשוק ההון, כמשקיעה וכסוחרת פעילה</span></div>
          <div className="biz-stat"><strong>+500</strong><span>חברים בקהילה שאני מלווה יום־יום</span></div>
          <div className="biz-stat"><strong>0</strong><span>מכירות במהלך המפגש. זו הבטחה.</span></div>
        </div>

        {CLIENT_LOGOS.length > 0 && (
          <div className="biz-logos">
            <p className="biz-logos-title">ארגונים שבהם כבר הרציתי</p>
            <div className="biz-logos-row">
              {CLIENT_LOGOS.map((l) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={l.src} src={l.src} alt={l.name} loading="lazy" />
              ))}
            </div>
          </div>
        )}

        <section className="biz-section">
          <h2>
            למה זה <span className="c1">עובד בארגונים?</span>
          </h2>
          <div className="biz-why-org">
            <div className="biz-gain">
              <h3>נושא שמעניין כמעט כל עובד</h3>
              <p>בכל תפקיד, בכל גיל ובכל שכר.</p>
            </div>
            <div className="biz-gain sage">
              <h3>מתאים גם למי שמתחיל מאפס</h3>
              <p>לא צריך שום ידע קודם.</p>
            </div>
            <div className="biz-gain">
              <h3>פרקטי, לא עוד הרצאת השראה</h3>
              <p>יוצאים עם צעדים ברורים שאפשר לעשות כבר השבוע.</p>
            </div>
            <div className="biz-gain sage">
              <h3>בלי מכירה לעובדים</h3>
              <p>אין מוצר, אין מנוי ואין ״הצעה מיוחדת״ בסוף.</p>
            </div>
            <div className="biz-gain">
              <h3>מותאם לארגון ולקהל</h3>
              <p>התוכן נבנה לפי אופי הארגון והעובדים שלכם.</p>
            </div>
          </div>
        </section>

        <section className="biz-section">
          <h2>
            רוב העובדים יודעים שהכסף שלהם נשחק. <span className="c2">מעטים יודעים מה לעשות עם זה.</span>
          </h2>
          <p className="biz-lead">
            הם שומעים על מניות מחברים, רואים ״גורואים״ ברשתות, ומרגישים שזה לא בשבילם: אין זמן, אין ידע, ויש פחד
            לטעות. אז הכסף נשאר בעו״ש, קרן ההשתלמות מתנהלת על אוטומט, וההחלטות נדחות לשנה הבאה. המפגש שלי נועד
            בדיוק לרגע הזה.
          </p>

          <div className="biz-sub-head">עם מה כל עובד יוצא</div>
          <p className="biz-note">בלי להפוך את שוק ההון למקצוע, בלי שעות מול המסך ובלי צורך בידע קודם.</p>
          <div className="biz-grid-2">
            <div className="biz-card">
              <span className="biz-num">1</span>
              <h3>איך מתחילים בכלל</h3>
              <p>מה זה חשבון השקעות ואיפה פותחים אותו: בבנק, בבית השקעות או אצל ברוקר. ומשם להחלטות הראשונות: כמה כסף להשקיע, כמה לסכן בכל עסקה וכמה לקנות.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num sage">2</span>
              <h3>תיק השקעות מציאותי</h3>
              <p>שבנוי לאורח חיים של משרה מלאה וילדים, ודורש מינימום זמן ותשומת לב.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num sage">3</span>
              <h3>ניהול סיכונים כמו מקצוענים</h3>
              <p>כמה מותר להפסיד, איך מפזרים, ואיך לא מחליטים מתוך פחד או התלהבות.</p>
            </div>
            <div className="biz-card">
              <span className="biz-num">4</span>
              <h3>להבדיל בין מידע לרעש</h3>
              <p>איך מזהים הבטחות שווא, ״טיפים חמים״ וקורסים שמוכרים חלומות.</p>
            </div>
          </div>

          <div className="biz-dark" style={{ marginTop: 32 }}>
            <p className="biz-dark-title">ומה המפגש לא</p>
            <ul className="biz-not">
              <li>לא ייעוץ השקעות אישי</li>
              <li>לא המלצות על מניות ספציפיות</li>
              <li>לא מכירה של שום מוצר במהלך המפגש</li>
              <li>לא הבטחות לתשואה</li>
            </ul>
          </div>
        </section>

        <section className="biz-section" id="tracks">
          <h2>
            שלושה מסלולים, <span className="c1">לפי מה שמתאים לכם</span>
          </h2>
          <p className="biz-lead">
            ממפגש אחד ועד תוכנית של 5 מפגשים. כל מסלול שלם בפני עצמו, ובוחרים לפי הזמן והקהל שלכם.
          </p>

          <div className="biz-tracks">
            <div className="biz-track featured">
              <span className="biz-track-badge">הכי מבוקש</span>
              <span className="biz-track-label">מסלול 1</span>
              <h3>מפגש אחד, תמונה מלאה</h3>
              <span className="biz-track-meta">מפגש אחד, 90 דקות</span>
              <span className="biz-track-for">מתאים ל: כנס חברה, יום העשרה, מפגש הנהלה או צוות</span>
              <ul>
                <li>איך ניגשים לכסף שיש בצד</li>
                <li>מה זה תיק השקעות מציאותי</li>
                <li>השקעה לטווח ארוך מול מסחר</li>
                <li>3 צעדים שאפשר לעשות כבר השבוע</li>
              </ul>
            </div>

            <div className="biz-track">
              <span className="biz-track-label">מסלול 2</span>
              <h3>סדנה לעומק</h3>
              <span className="biz-track-meta">3 מפגשים, 90 דקות כל אחד</span>
              <ol>
                <li>הכסף שלי היום: עו״ש, חסכונות, קרן השתלמות, ריבית דריבית</li>
                <li>בונים תיק לטווח ארוך: מדדים, קרנות סל ופיזור</li>
                <li>ניהול סיכונים ומסחר סווינג במינון שפוי</li>
              </ol>
            </div>

            <div className="biz-track">
              <span className="biz-track-label">מסלול 3</span>
              <h3>מהבנה לפעולה</h3>
              <span className="biz-track-meta">5 מפגשים, 90 דקות כל אחד</span>
              <ol>
                <li>הכסף שלי היום ולמה הוא נשחק</li>
                <li>תיק לטווח ארוך: איך בונים, כמה זמן זה לוקח בחודש</li>
                <li>ניהול סיכונים ופסיכולוגיה: איך לא נכנסים לפאניקה</li>
                <li>מסחר סווינג: מה זה, למי זה מתאים, ואיך עושים את זה בזמן קצר</li>
                <li>סדנה מעשית: כל משתתף בונה את תוכנית הפעולה הפיננסית שלו ל־30 הימים הקרובים</li>
              </ol>
            </div>
          </div>

          <div className="biz-dark biz-all">
            <div>
              <h3>בכל המסלולים</h3>
              <p>פרונטלי, בכל הארץ, עם זמן פתוח לשאלות</p>
            </div>
            <div>
              <h3>מתנה לכל משתתף</h3>
              <p>חודש מתנה בקבוצת ״מדברים עסקאות״, בלי כרטיס אשראי ובלי התחייבות</p>
            </div>
            <div>
              <h3>מחיר</h3>
              <p>נקבע אחרי שיחת היכרות קצרה, לפי מסלול וגודל הקבוצה</p>
            </div>
          </div>
          <div className="biz-mid-cta">
            <p>רוצים לבדוק אם זה מתאים לעובדים שלכם?</p>
            <a className="biz-btn biz-btn-primary" href="#contact">{CTA_LABEL}</a>
          </div>
        </section>

        {(TESTIMONIALS.length > 0 || EVENT_PHOTOS.length > 0) && (
          <section className="biz-section">
            <h2>
              מה אומרים <span className="c2">בארגונים</span>
            </h2>
            {TESTIMONIALS.length > 0 && (
              <div className="biz-quotes">
                {TESTIMONIALS.map((t) => (
                  <figure key={t.quote} className="biz-quote">
                    <blockquote>״{t.quote}״</blockquote>
                    <figcaption>
                      <strong>{t.name}</strong>
                      <span>{[t.role, t.org].filter(Boolean).join(', ')}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {EVENT_PHOTOS.length > 0 && (
              <div className="biz-gallery">
                {EVENT_PHOTOS.map((p) => (
                  <figure key={p.src}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.alt} loading="lazy" />
                    {p.caption && <figcaption>{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="biz-section">
          <div className="biz-about">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/business/shiran.jpg" alt="שירן דימור" loading="lazy" />
            <div>
              <h2>
                נעים להכיר, <span className="c2">אני שירן</span>
              </h2>
              <p>
                אני בת 43, אמא לשניים, ומשקיעה וסוחרת כבר 14 שנה. אני לא יועצת, לא סוכנת ולא ״גורו״, ואין לי מוצר
                פיננסי למכור לעובדים שלכם. יש לי ניסיון, כולל הטעויות שעלו לי כסף, ושיטה פשוטה שמתאימה לאנשים עם
                עבודה, משפחה וחיים.
              </p>
              <p>
                אני מאמינה שכל אחד יכול לנהל את הכסף שלו בעצמו, בלי פחד ובלי להתמכר למסך. צריך להבין כמה עקרונות,
                ולהפסיק להקשיב לרעש.
              </p>
            </div>
          </div>

          <div className="biz-grid-3 biz-why" style={{ marginTop: 28 }}>
            <div className="biz-card">
              <h3>כנות מלאה</h3>
              <p>אני מראה גם הפסדים, לא רק הצלחות. ככה לומדים באמת.</p>
            </div>
            <div className="biz-card">
              <h3>בנוי לאנשים עובדים</h3>
              <p>שיטה שמתאימה למשרה מלאה, לא לשעות מול גרפים.</p>
            </div>
            <div className="biz-card">
              <h3>בגובה העיניים</h3>
              <p>בלי מונחים מפחידים, עם המון דוגמאות ושאלות.</p>
            </div>
          </div>

          <div className="biz-sub-head">שאלות ששואלים אותי לפני מפגש</div>
          <div className="biz-faq">
            <div>
              <h3>צריך ידע קודם?</h3>
              <p>לא. מתחילים מאפס ומתקדמים בקצב של הקבוצה.</p>
            </div>
            <div>
              <h3>תמליצי לעובדים על מניות?</h3>
              <p>לא. אני מלמדת איך לחשוב ולהחליט, לא מה לקנות.</p>
            </div>
            <div>
              <h3>יהיה ניסיון למכור משהו?</h3>
              <p>לא. המפגש נקי ממכירות, מהדקה הראשונה עד האחרונה.</p>
            </div>
            <div>
              <h3>כמה כסף צריך כדי להתחיל?</h3>
              <p>נדבר על זה בפתיחות: מה הגיוני להתחיל איתו, ומה לא.</p>
            </div>
          </div>
        </section>

        <section className="biz-dark biz-contact" id="contact">
          <h2>{CTA_LABEL}</h2>
          <p>שיחה קצרה להכיר את הארגון והעובדים, ולבדוק יחד אם זה מתאים לכם. בלי התחייבות.</p>
          <ol className="biz-steps">
            <li><strong>קובעים שיחה או משאירים פרטים</strong><span>בוחרים זמן פנוי ביומן כאן למטה, או משאירים פרטים ואחזור אליכם</span></li>
            <li><strong>שיחת היכרות של 15 דקות</strong><span>מכירים את הארגון, הקהל והמטרות, ובוחרים מסלול</span></li>
            <li><strong>הצעה מסודרת</strong><span>תוכן, מועדים ומחיר, מותאמים לכם</span></li>
          </ol>
          <ContactOptions whatsappUrl={WHATSAPP_URL} />
          <p className="biz-contact-or">או פשוט דברו איתי ישירות:</p>
          <ContactButtons
            whatsappUrl={WHATSAPP_URL}
            phoneDisplay={PHONE_DISPLAY}
            phoneTel={PHONE_TEL}
            email={EMAIL}
            emailSubject={EMAIL_SUBJECT}
          />
        </section>

        <p className="biz-disclaimer">
          המפגשים הם הדרכה פיננסית כללית בלבד, ואינם מהווים ייעוץ השקעות או תחליף לייעוץ המותאם לנתונים ולצרכים של כל
          אדם.
        </p>

        <footer className="biz-foot">
          <Link href="/">shirandimor.com</Link>
        </footer>
      </div>
    </main>
  );
}
