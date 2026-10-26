import type { Metadata } from 'next';
import Link from 'next/link';
import BackButton from './BackButton';
import ContactOptions from './ContactOptions';
import ContactButtons from './ContactButtons';
import './business.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://shirandimor.com'),
  title: 'הרצאות וסדנאות לארגונים | שירן דימור',
  description:
    'הרצאה וסדנאות העשרה לעובדים: איך בונים תיק השקעות מציאותי מהחסכונות, מקרן ההשתלמות ומהכסף שבעו״ש. בלי ייעוץ אישי, בלי המלצות על מניות ובלי מכירות במהלך המפגש.',
  openGraph: {
    title: 'הכסף של העובדים שלכם יכול לעבוד קשה כמוהם',
    description: 'הרצאה וסדנאות העשרה לעובדים עם שירן דימור: מפגש אחד, 3 או 5 מפגשים.',
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
  encodeURIComponent('היי שירן, הגעתי מהעמוד לארגונים ואשמח לשמוע על הרצאה לעובדים שלנו');
const EMAIL_SUBJECT = 'הרצאה לעובדים בארגון שלנו';

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
              <span className="biz-pill">הרצאה וסדנאות לעובדים</span>
              <h1>
                הכסף של העובדים שלכם <span className="c1">יכול לעבוד</span> <span className="c2">קשה כמוהם.</span>
              </h1>
              <p className="biz-hero-sub">
                סדנה פרקטית שמלמדת עובדים לבנות תיק השקעות מציאותי, לחסכונות, לקרן ההשתלמות ולכסף שיושב בבנק.
                בלי קורסים של אלפי שקלים, בלי להפוך את זה למקצוע, ובלי שעות מול המסך.
              </p>
              <div className="biz-actions">
                <a className="biz-btn biz-btn-primary" href="#contact">לתיאום שיחת התאמה</a>
                <a className="biz-btn biz-btn-ghost" href="#tracks">למסלולים</a>
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
          <div className="biz-stat"><strong>0</strong><span>מכירות במהלך ההרצאה. זו הבטחה.</span></div>
        </div>

        <section className="biz-section">
          <h2>
            רוב העובדים יודעים שהכסף שלהם נשחק. <span className="c2">מעטים יודעים מה לעשות עם זה.</span>
          </h2>
          <p className="biz-lead">
            הם שומעים על מניות מחברים, רואים ״גורואים״ ברשתות, ומרגישים שזה לא בשבילם: אין זמן, אין ידע, ויש פחד
            לטעות. אז הכסף נשאר בעו״ש, קרן ההשתלמות מתנהלת על אוטומט, וההחלטות נדחות לשנה הבאה. ההרצאה שלי נועדה
            בדיוק לרגע הזה.
          </p>

          <div className="biz-sub-head">עם מה כל עובד יוצא</div>
          <div className="biz-grid-2">
            <div className="biz-card">
              <span className="biz-num">1</span>
              <h3>מפה ברורה של הכסף שלו</h3>
              <p>עו״ש, חסכונות, קרן השתלמות: מה כל אחד מהם עושה היום, ומה הוא יכול לעשות.</p>
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

          <div className="biz-sub-head sage">ומה הארגון מרוויח</div>
          <div className="biz-grid-3">
            <div className="biz-gain">
              <h3>נושא שכולם רוצים לשמוע</h3>
              <p>כסף מעניין כל עובד, בכל תפקיד ובכל גיל.</p>
            </div>
            <div className="biz-gain sage">
              <h3>ערך שנשאר אחרי המפגש</h3>
              <p>כלים שהעובדים משתמשים בהם בבית, לא רק עוד אירוע.</p>
            </div>
            <div className="biz-gain">
              <h3>שקט נפשי כלכלי</h3>
              <p>פחות דאגות סביב כסף, יותר תחושת שליטה.</p>
            </div>
          </div>

          <div className="biz-dark" style={{ marginTop: 32 }}>
            <p className="biz-dark-title">ומה ההרצאה לא</p>
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
            מהרצאת העשרה חד־פעמית ועד תוכנית שמלווה את העובדים עד שהתיק שלהם בנוי. כל מסלול עומד בפני עצמו.
          </p>

          <div className="biz-tracks">
            <div className="biz-track">
              <span className="biz-track-label">מסלול 1</span>
              <h3>מפגש השראה</h3>
              <span className="biz-track-meta">מפגש אחד, 90 דקות</span>
              <span className="biz-track-for">מתאים ל: כנס חברה, יום העשרה, מפגש הנהלה או צוות</span>
              <ul>
                <li>איך ניגשים לכסף שיש בצד</li>
                <li>מה זה תיק השקעות מציאותי</li>
                <li>השקעה לטווח ארוך מול מסחר</li>
                <li>3 צעדים שאפשר לעשות כבר השבוע</li>
              </ul>
            </div>

            <div className="biz-track featured">
              <span className="biz-track-badge">המומלץ שלי</span>
              <span className="biz-track-label">מסלול 2</span>
              <h3>סדנת יסודות</h3>
              <span className="biz-track-meta">3 מפגשים, 90 דקות כל אחד</span>
              <span className="biz-track-gift">מתנה לכל משתתף: חודש בקהילת ״מדברים עסקאות״, בלי כרטיס אשראי ובלי התחייבות</span>
              <ol>
                <li>הכסף שלי היום: עו״ש, חסכונות, קרן השתלמות, ריבית דריבית</li>
                <li>בונים תיק לטווח ארוך: מדדים, קרנות סל ופיזור</li>
                <li>ניהול סיכונים ומסחר סווינג במינון שפוי</li>
              </ol>
            </div>

            <div className="biz-track">
              <span className="biz-track-label">מסלול 3</span>
              <h3>תוכנית מלאה</h3>
              <span className="biz-track-meta">5 מפגשים, 90 דקות כל אחד</span>
              <span className="biz-track-gift">מתנה לכל משתתף: חודש בקהילת ״מדברים עסקאות״, בלי כרטיס אשראי ובלי התחייבות</span>
              <ol>
                <li>הכסף שלי היום ולמה הוא נשחק</li>
                <li>תיק לטווח ארוך: איך בונים, כמה זמן זה לוקח בחודש</li>
                <li>ניהול סיכונים ופסיכולוגיה: איך לא נכנסים לפאניקה</li>
                <li>מסחר סווינג: מה זה, למי זה מתאים, ואיך עושים את זה בזמן קצר</li>
                <li>סדנה מעשית: כל משתתף בונה תוכנית אישית ל־30 יום</li>
              </ol>
            </div>
          </div>

          <div className="biz-dark biz-all">
            <div>
              <h3>בכל המסלולים</h3>
              <p>פרונטלי, בכל הארץ, עם זמן פתוח לשאלות</p>
            </div>
            <div>
              <h3>מתנה למשתתפים</h3>
              <p>גישה לשאלון ״תוכנית מסחר אישית ל־30 יום״</p>
            </div>
            <div>
              <h3>מחיר</h3>
              <p>נקבע אחרי שיחת התאמה קצרה, לפי מסלול וגודל הקבוצה</p>
            </div>
          </div>
          <div className="biz-mid-cta">
            <a className="biz-btn biz-btn-primary" href="#contact">לקביעת שיחת התאמה ביומן</a>
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

          <div className="biz-sub-head">שאלות ששואלים אותי לפני הרצאה</div>
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
          <h2>בואו נתאים את המפגש לארגון שלכם</h2>
          <p>כל הרצאה נבנית לפי הארגון והעובדים, ולכן הכול מתחיל בשיחת התאמה קצרה.</p>
          <ol className="biz-steps">
            <li><strong>קובעים שיחה או משאירים פרטים</strong><span>בוחרים זמן פנוי ביומן כאן למטה, או משאירים פרטים ואחזור אליכם</span></li>
            <li><strong>שיחת התאמה של 15 דקות</strong><span>מכירים את הארגון, הקהל והמטרות, ובוחרים מסלול</span></li>
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
          ההרצאות הן הדרכה פיננסית כללית בלבד, ואינן מהוות ייעוץ השקעות או תחליף לייעוץ המותאם לנתונים ולצרכים של כל
          אדם.
        </p>

        <footer className="biz-foot">
          <Link href="/">shirandimor.com</Link>
        </footer>
      </div>
    </main>
  );
}
