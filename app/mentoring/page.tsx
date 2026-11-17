import type { Metadata } from 'next';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import SiteHeader from '@/components/SiteHeader';
import FitCallFlow from './FitCallFlow';
import MentoringStickyCta from './MentoringStickyCta';
import MentoringTracker from './MentoringTracker';
import {
  BETWEEN_SESSIONS,
  DISCLAIMER,
  FAQ,
  FIT_FOR,
  GROUP_MONTHLY_PRICE,
  GROUP_PERKS,
  INCLUDED,
  NOT_FIT_FOR,
  OUTCOMES,
  REVIEW_QUESTIONS,
  SESSIONS,
  TESTIMONIALS,
  TRACKS,
  TRACK_FEATURES,
  WHATSAPP_URL,
} from './content';
import './mentoring.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://shirandimor.com'),
  title: 'ליווי אישי 1:1 בשוק ההון | שירן דימור',
  description:
    'ליווי אישי אחד על אחד, 4 או 6 חודשים: מפגשי Zoom אישיים, יומן מסחר, ניתוח עסקאות ובניית תוכנית מסחר אישית. מתאים גם למי שמתחיל מאפס. בלי הבטחות תשואה.',
  openGraph: {
    title: 'ללמוד לסחור, אחד על אחד | שירן דימור',
    description: 'ליווי אישי למי שרוצה ללמוד את שוק ההון בצורה מסודרת, בקצב שלו, עם מישהי שעוברת איתו על מה שהוא עושה בפועל.',
    images: ['/business/shiran.jpg'],
    locale: 'he_IL',
    type: 'website',
  },
};

// צבעי הפס הימני בשאלות ותשובות - אותו סבב צבעים כמו בדף הבית
const FAQ_ACCENTS = ['var(--profit)', 'var(--teal)', 'var(--orange)', 'var(--lavender)'];

export default function MentoringPage() {
  const core = TRACKS.core;
  const ext = TRACKS.extended;
  const baseSessions = SESSIONS.filter((s) => !s.extended);
  const extraSessions = SESSIONS.filter((s) => s.extended);

  return (
    <div className="wrap mt-page">
      <MentoringTracker />
      <SiteHeader current="/mentoring" />

      {/* 1. Hero */}
      <section className="hero-v2 mt-hero" id="top">
        <div className="eyebrow">ליווי אישי 1:1</div>
        <h1>
          ללמוד לסחור, <em>אחד על אחד.</em>
          <br />
          מהבסיס ועד עסקת Swing.
        </h1>
        <p>ליווי אישי למי שרוצה ללמוד את שוק ההון בצורה מסודרת, בקצב שלו, עם מישהי שעוברת איתו על מה שהוא עושה בפועל.</p>
        <div className="trust-strip mt-hero-stats">
          <div className="trust-item"><div className="num" dir="ltr">4–6</div><div className="lbl">חודשים של תהליך אישי</div></div>
          <div className="trust-item"><div className="num" dir="ltr">6–8</div><div className="lbl">מפגשים אחד על אחד</div></div>
          <div className="trust-item"><div className="num">1</div><div className="lbl">תוכנית מסחר שבנויה בשבילך</div></div>
        </div>
        <a href="#not-for-everyone" className="cta-main mt-cta" data-cta="hero-how">לראות איך הליווי עובד ↓</a>
        <a href="#pricing" className="cta-sub-link" data-cta="hero-pricing">כבר מכירים? <span>ישר למסלולים ולמחירים</span></a>
      </section>

      {/* 2. לא כולם צריכים ליווי אישי */}
      <Reveal>
        <section className="mt-section" id="not-for-everyone">
          <h2 className="mt-h2">לא כולם צריכים <em>ליווי אישי.</em></h2>
          <p className="mt-lead">אפשר ללמוד המון גם לבד. אפשר ללמוד דרך שיעורים, להצטרף לקבוצה או לצפות בלייבים - ולא צריך להוציא על זה אלפי שקלים.</p>
          <div className="mt-alt-links">
            <Link href="/lessons" className="link-card"><div><div className="t">ספריית שיעורים</div><div className="s">וובינרים ומצגות, ללמוד בקצב שלך</div></div><span className="arrow">←</span></Link>
            <Link href="/lives" className="link-card"><div><div className="t">מפגשים בזמן אמת</div><div className="s">לייבים ומסחר בזמן אמת</div></div><span className="arrow">←</span></Link>
            <Link href="/subscribe" className="link-card"><div><div className="t">קבוצת מדברים עסקאות</div><div className="s">לומדים לסחור לצדי, ₪{GROUP_MONTHLY_PRICE} לחודש</div></div><span className="arrow">←</span></Link>
          </div>

          <div className="mt-story">
            <p>אבל יש אנשים שרוצים דרך אחרת. מישהי שעוברת איתם על:</p>
            <ul className="mt-story-list">
              <li>הגרף שלהם.</li>
              <li>העסקה שלהם.</li>
              <li>הטעות שלהם.</li>
              <li>הפעם שבה הם פחדו להיכנס.</li>
              <li>והפעם שבה הם דווקא נכנסו מהר מדי.</li>
            </ul>
            <p>בשבילם בניתי את הליווי האישי.</p>
            <p className="mt-story-punch">המטרה היא לא לתת עוד מידע. המטרה היא לקחת את כל המידע <strong>ולעשות ממנו דרך עבודה.</strong></p>
          </div>
        </section>
      </Reveal>

      {/* 3. למי מתאים / פחות מתאים */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">אז למי הליווי <em>מתאים?</em></h2>
          <p className="mt-lead">גם למי שמתחיל מאפס מוחלט. לא צריך לדעת מה זה נר יפני, איך קונים מניה, מה זה Stop Loss או איך מחשבים סיכון. מתחילים מההתחלה.</p>
          <div className="mt-fit">
            <div className="mt-fit-card yes">
              <div className="mt-fit-title">מתאים ל...</div>
              <ul>{FIT_FOR.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="mt-fit-card no">
              <div className="mt-fit-title">ופחות מתאים ל...</div>
              <ul>{NOT_FIT_FOR.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        </section>
      </Reveal>

      {/* 4. זה לא 6 שיעורים וזהו */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">הליווי לא נגמר <em>כשה־Zoom נסגר.</em></h2>
          <div className="stat-callout mt-callout">
            <div className="sc-num">6</div>
            <p>
              אם היינו עושים 6 שיעורים של שעה וזהו - זה היה קורס פרטי.
              <br />
              <strong>כאן העבודה האמיתית מתרחשת לאורך חודשים</strong>, בין המפגשים: על הגרפים שלך, העסקאות שלך והיומן שלך.
            </p>
          </div>
          <a href="#syllabus" className="mt-text-cta" data-cta="to-syllabus">לראות את הסילבוס ↓</a>
        </section>
      </Reveal>

      {/* 5. הסילבוס */}
      <section className="mt-section" id="syllabus">
        <Reveal>
          <h2 className="mt-h2">ששת המפגשים <em>במסלול 4 החודשים</em></h2>
          <p className="mt-lead">כל מפגש בונה על הקודם. אפשר לפתוח כל אחד ולראות מה עושים בו.</p>
        </Reveal>
        <div className="mt-syllabus">
          {baseSessions.map((s, i) => (
            <Reveal key={s.num} delay={i * 30}>
              <details className="mt-session" open={i === 0}>
                <summary>
                  <span className="mt-session-num">{s.num}</span>
                  <span className="mt-session-title">{s.title}</span>
                  <span className="collapse-chevron" aria-hidden="true">▾</span>
                </summary>
                <ul className="mt-session-items">{s.items.map((it) => <li key={it}>{it}</li>)}</ul>
                {s.note && <p className="mt-session-note">{s.note}</p>}
              </details>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-extended-head">
            <span className="mt-badge-soft">במסלול המורחב · 6 חודשים</span>
            <p>ששת המפגשים הראשונים מכסים את אותו בסיס. שני המפגשים הנוספים מתמקדים בך ובנתונים שכבר נצברו אצלך ביומן.</p>
          </div>
        </Reveal>
        <div className="mt-syllabus">
          {extraSessions.map((s) => (
            <Reveal key={s.num}>
              <details className="mt-session extended">
                <summary>
                  <span className="mt-session-num">{s.num}</span>
                  <span className="mt-session-title">{s.title}</span>
                  <span className="collapse-chevron" aria-hidden="true">▾</span>
                </summary>
                <ul className="mt-session-items">{s.items.map((it) => <li key={it}>{it}</li>)}</ul>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 6. למה חודשים */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">למה חודשים ולא קורס קצר? <em>כי מסחר אי אפשר ללמוד רק מתיאוריה.</em></h2>
          <ul className="mt-lines">
            <li>צריך לראות שוק עולה.</li>
            <li>צריך לראות שוק יורד.</li>
            <li>צריך לעבור שבוע משעמם.</li>
            <li>צריך לעבור יום תנודתי.</li>
            <li>צריך לראות עסקה שמיד עובדת.</li>
            <li>וצריך גם לראות עסקה שלא.</li>
          </ul>
          <p className="mt-lead">רק אז אפשר להתחיל לזהות איך אנחנו באמת מתנהלים. לכן המפגשים נפרסים לאורך התקופה, ולא שבוע אחרי שבוע כמו בקורס.</p>

          <div className="mt-pace" aria-label="המחשה של קצב המפגשים לאורך 4 חודשים">
            <div className="mt-pace-track">
              {[3, 15, 29, 48, 68, 92].map((pos, i) => (
                <span key={pos} className="mt-pace-dot" style={{ insetInlineStart: `${pos}%` }}>{i + 1}</span>
              ))}
            </div>
            <div className="mt-pace-labels">
              <span>חודש 1</span><span>חודש 2</span><span>חודש 3</span><span>חודש 4</span>
            </div>
            <p className="mt-pace-caption">בהתחלה המפגשים צפופים יותר. בהמשך נותנים יותר זמן לתרגול, לעסקאות ולבניית היומן. (המחשה - את הקצב המדויק קובעים יחד)</p>
          </div>
        </section>
      </Reveal>

      {/* 7. מה קורה בין המפגשים */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">ומה קורה <em>בין המפגשים?</em></h2>
          <p className="mt-lead">כאן הידע הופך לשיטת עבודה. בין המפגשים את/ה:</p>
          <div className="tag-row mt-tags">{BETWEEN_SESSIONS.map((t) => <span key={t} className="tag-chip">{t}</span>)}</div>

          <div className="mt-review">
            <p className="mt-review-lead">ואנחנו לא מנתחים רק <s>כמה הרווחת או הפסדת?</s> אלא:</p>
            <ul>{REVIEW_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>

          <h3 className="mt-h3">מה כולל הליווי, בשני המסלולים</h3>
          <div className="perk-list mt-included">{INCLUDED.map((t) => <div key={t}>{t}</div>)}</div>
          <p className="mt-small">ליווי ומענה אישי שוטף לאורך תקופת התהליך - לא שיעור ונעלמים.</p>
        </section>
      </Reveal>

      {/* 8. קבוצת הסוחרים */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">ובזמן הזה את/ה גם <em>בתוך השוק איתנו.</em></h2>
          <p className="mt-lead">הליווי כולל כניסה מלאה לקבוצת הסוחרים &quot;מדברים עסקאות&quot; לאורך כל תקופת המסלול. מה שלומדים אחד על אחד, רואים גם מיושם בתוך שוק אמיתי.</p>
          <div className="mt-group">
            <div className="mt-group-values">
              <div><span className="mt-group-k">במסלול 4 חודשים</span><span className="mt-group-v">4 חודשים ללא עלות נוספת</span><span className="mt-group-s">שווי ₪{core.groupValue}</span></div>
              <div><span className="mt-group-k">במסלול 6 חודשים</span><span className="mt-group-v">6 חודשים ללא עלות נוספת</span><span className="mt-group-s">שווי ₪{ext.groupValue}</span></div>
            </div>
            <div className="tag-row" style={{ marginBottom: 0 }}>{GROUP_PERKS.map((t) => <span key={t} className="tag-chip">{t}</span>)}</div>
            <div className="mt-group-links">
              <Link href="/portfolio">תיק המסחר ←</Link>
              <Link href="/lives">הלייבים ←</Link>
              <Link href="/lessons">ספריית השיעורים ←</Link>
            </div>
            <p className="mt-small" style={{ marginTop: 10 }}>המחיר הרגיל של הקבוצה: ₪{GROUP_MONTHLY_PRICE} לחודש.</p>
          </div>
        </section>
      </Reveal>

      {/* 9. מי אני */}
      <Reveal>
        <section className="about-feature mt-about">
          <div className="af-photo-ring mt-about-ring"><img className="af-photo" src="/business/shiran.jpg" alt="שירן דימור" loading="lazy" /></div>
          <div className="af-text">
            <div className="af-label">מי אני</div>
            <div className="af-main">
              <p>אני שירן דימור, ואני בשוק ההון כבר כ-14 שנה.</p>
              <p>עם השנים הבנתי שהבעיה של רוב האנשים היא לא שאין מספיק מידע. יש יותר מדי. יותר מדי אינדיקטורים, יותר מדי דעות, יותר מדי סרטונים - ויותר מדי אנשים שאומרים מה לקנות.</p>
              <p>בליווי האישי אנחנו עושים בדיוק את ההפך: מורידים רעש, בונים דרך עבודה ברורה, מבינים למה נכנסים לעסקה ולומדים לנהל סיכון.</p>
              <p><strong>והמטרה היא שבסוף התהליך תוכל/י להמשיך גם בלעדיי.</strong></p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* 10. מה יוצאים איתו */}
      <Reveal>
        <section className="mt-section">
          <h2 className="mt-h2">ומה אמור <em>לקרות בסוף?</em></h2>
          <p className="mt-lead">אין כאן הבטחת רווח. יש יכולת שאליה אנחנו שואפים להגיע. בסוף התהליך המטרה היא שתדע/י:</p>
          <ul className="mt-outcomes">{OUTCOMES.map((o) => <li key={o}>{o}</li>)}</ul>
          <div className="quote-block mt-quote">
            <span className="qmark" aria-hidden="true">&quot;</span>
            <p>לא לדעת הכול על שוק ההון.<br />לדעת מה לעשות כשפותחים את הגרף.</p>
          </div>
          <a href="#pricing" className="mt-text-cta" data-cta="to-pricing">למסלולים ולמחירים ↓</a>
        </section>
      </Reveal>

      {/* 11. עדויות - מוצג רק כשיש עדויות אמיתיות ב-content.ts */}
      {TESTIMONIALS.length > 0 && (
        <Reveal>
          <section className="mt-section">
            <h2 className="mt-h2">מה אומרים <em>על הדרך</em></h2>
            <div className="mt-testimonials">
              {TESTIMONIALS.map((t) => (
                <figure key={t.quote} className="mt-testimonial">
                  <blockquote>״{t.quote}״</blockquote>
                  <figcaption><strong>{t.name}</strong>{t.context && <span> · {t.context}</span>}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* 12. מסלולים ומחירים */}
      <section className="mt-section" id="pricing">
        <Reveal>
          <h2 className="mt-h2">שני מסלולים. <em>מחירים גלויים.</em></h2>
          <p className="mt-lead">אותו תהליך ואותה שיטה בשניהם. ההבדל הוא כמה זמן ומפגשים יש לך לעבוד על זה.</p>
        </Reveal>
        <Reveal>
          <div className="groups-compare mt-tracks">
            <div className="group-card paid mt-track">
              <div className="gc-tag">{core.badge}</div>
              <h3>{core.name}</h3>
              <div className="mt-track-meta">{core.months} חודשים · {core.sessions} מפגשים</div>
              <p className="mt-track-for">{core.forWho}</p>
              <div className="gc-perks">{TRACK_FEATURES(core.months, core.sessions, core.groupValue).map((f) => <div key={f}>{f}</div>)}</div>
              <div className="mt-price">
                <span className="mt-price-amount">₪{core.price}</span>
                <span className="mt-price-note">כולל מע&quot;מ</span>
              </div>
              <div className="mt-price-sub">{core.installments}</div>
              <a href="#fit-call" className="gc-cta mt-track-cta" data-cta="price-core" data-cta-kind="book" data-pick-track={core.formValue}>לקביעת שיחת התאמה</a>
            </div>

            <div className="group-card free mt-track">
              <h3>{ext.name}</h3>
              <div className="mt-track-meta">{ext.months} חודשים · {ext.sessions} מפגשים</div>
              <p className="mt-track-for">{ext.forWho}</p>
              <div className="gc-perks">{TRACK_FEATURES(ext.months, ext.sessions, ext.groupValue).map((f) => <div key={f}>{f}</div>)}</div>
              <div className="mt-price">
                <span className="mt-price-amount">₪{ext.price}</span>
                <span className="mt-price-note">כולל מע&quot;מ</span>
              </div>
              <div className="mt-price-sub">{ext.installments}</div>
              <a href="#fit-call" className="gc-cta mt-track-cta" data-cta="price-extended" data-cta-kind="book" data-pick-track={ext.formValue}>לקביעת שיחת התאמה</a>
            </div>
          </div>
        </Reveal>
        <p className="mt-small mt-center">אין רכישה ישירה באתר. זה שירות אישי, ולכן כל הצטרפות מתחילה בשיחה קצרה איתי.</p>
      </section>

      {/* 13. FAQ */}
      <section className="mt-section">
        <Reveal><h2 className="mt-h2">שאלות <em>שכדאי לשאול</em></h2></Reveal>
        <div className="faq-list">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 30}>
              <details className="faq-item" style={{ borderRightColor: FAQ_ACCENTS[i % FAQ_ACCENTS.length] }}>
                <summary>{f.q}</summary>
                {f.a.map((p) => <p key={p}>{p}</p>)}
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 14-15. שיחת התאמה: שאלון + יומן */}
      <section className="mt-section mt-fitcall" id="fit-call">
        <h2 className="mt-h2">בואו נבדוק אם זה <em>באמת מתאים.</em></h2>
        <p className="mt-lead">בשיחה קצרה נבין איפה את/ה נמצא/ת היום, מה רמת הניסיון, מה היית רוצה להשיג, מה עוצר אותך - ואיזה מסלול מתאים, אם בכלל. <strong>השיחה אינה התחייבות להצטרף.</strong></p>
        <FitCallFlow whatsappUrl={WHATSAPP_URL} />
      </section>

      {/* 16. CTA אחרון */}
      <Reveal>
        <section className="quote-block mt-final">
          <span className="qmark" aria-hidden="true">&quot;</span>
          <p>השוק לא תמיד פשוט.<br />אבל לא חייבים ללמוד אותו לבד.</p>
          <div className="mt-final-text">אם עברת על העמוד, ראית את התהליך, את הסילבוס ואת המחירים, ונראה לך שליווי אישי יכול להתאים לך - השלב הבא הוא שיחה קצרה.</div>
          <a href="#fit-call" className="cta-main mt-cta" data-cta="final-book" data-cta-kind="book">לקביעת שיחת התאמה אישית</a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="cta-sub-link">יש שאלה לפני? <span>אפשר לכתוב לי בוואטסאפ</span></a>
        </section>
      </Reveal>

      {/* 17. Disclaimer (הפוטר הכללי של האתר מתווסף אוטומטית מתחת) */}
      <p className="mt-disclaimer">{DISCLAIMER}</p>

      <MentoringStickyCta />
    </div>
  );
}
