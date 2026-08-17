'use client';

import { classifyProfile } from '@/lib/tradingPlan/profile';
import { getProfileContent } from '@/lib/tradingPlan/profileContent';

interface Props {
  answers: Record<string, unknown>;
  onCtaClick: () => void;
}

const CHECKLIST = [
  'האם העסקה מתאימה לתוכנית?',
  'האם יש סיבה ברורה לכניסה?',
  'איפה הסטופ?',
  'כמה מסתכנים?',
  'האם יחס הסיכון מול הפוטנציאל הגיוני?',
  'איפה מתוכנן לקחת רווח?',
  'מה יגרום לא לקחת את העסקה?',
];

export default function SummaryScreen({ answers, onCtaClick }: Props) {
  const profileId = classifyProfile(answers);
  const content = getProfileContent(profileId);

  const rule = typeof answers.personal_rule === 'string' && answers.personal_rule.trim()
    ? answers.personal_rule
    : content.defaultRule;

  return (
    <div>
      <div className="tp-diagnosis-eyebrow">הפרופיל שלך</div>
      <div className="tp-step-title">{content.title}</div>

      <div className="tp-diagnosis-section">
        <div className="tp-diagnosis-label">מה אני מזהה אצלך</div>
        <p className="tp-diagnosis-para">{content.diagnosis(answers)}</p>
      </div>

      <div className="tp-diagnosis-section">
        <div className="tp-diagnosis-label">מה כבר יש לך</div>
        <div className="tp-strength-list">
          {content.strengths(answers).map((s) => (
            <div key={s} className="tp-strength-item">{s}</div>
          ))}
        </div>
      </div>

      <div className="tp-diagnosis-section">
        <div className="tp-diagnosis-label">מה כנראה מעכב אותך</div>
        <div className="tp-blocker-list">
          {content.blockers.map((b) => (
            <div key={b} className="tp-blocker-item">{b}</div>
          ))}
        </div>
      </div>

      <div className="tp-diagnosis-section">
        <div className="tp-diagnosis-label">מה לא הייתי עושה בחודש הקרוב</div>
        <div className="tp-donot-list">
          {content.dontDo.map((d) => (
            <div key={d} className="tp-donot-item">{d}</div>
          ))}
        </div>
      </div>

      <div className="tp-diagnosis-section">
        <div className="tp-diagnosis-label">שלושת הדברים שהייתי עובד עליהם ב-30 הימים הקרובים</div>
        <div className="tp-tasks-list">
          {content.threeThings.map((t, i) => (
            <div key={t} className="tp-tasks-item">
              <span className="tp-tasks-num">{i + 1}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tp-mission-box">
        <div className="tp-mission-label">המשימה שלך ל-30 יום</div>
        <div className="tp-mission-text">{content.mission}</div>
      </div>

      <div className="tp-mission-box tp-rule-box">
        <div className="tp-mission-label">החוק שלך לחודש הקרוב</div>
        <div className="tp-mission-text">{rule}</div>
      </div>

      <p className="tp-closing-message">{content.closingMessage}</p>

      <div className="tp-checklist-card">
        <div className="tp-checklist-title">לפני כל עסקה אני עוצר/ת ובודק/ת:</div>
        {CHECKLIST.map((item) => (
          <div key={item} className="tp-checklist-item">{item}</div>
        ))}
        <div className="tp-checklist-footer">אם אין תשובה ברורה לאחת השאלות, אולי פשוט לא צריך לקחת את העסקה.</div>
      </div>

      <p className="tp-cta-transition">
        אם אחד הדברים שעלו כאן הוא משהו שלא היית רוצה לעבוד עליו לבד - זה בדיוק המקום שבו קבוצת "מדברים עסקאות" יכולה לעזור: לומדים, מנתחים עסקאות, ומנהלים אותן בפועל עם מסגרת ולא מתוך ניחוש.
      </p>

      <a href="/subscribe" onClick={onCtaClick} className="cta-btn" style={{ textDecoration: 'none' }}>
        רוצה לראות איך זה עובד בקבוצה?
      </a>
    </div>
  );
}
