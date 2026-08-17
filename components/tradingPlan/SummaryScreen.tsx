'use client';

import { findOption, findOptions } from '@/lib/tradingPlan/questions';
import { personalizedNote } from '@/lib/tradingPlan/summary';

interface Props {
  answers: Record<string, unknown>;
  onCtaClick: () => void;
}

const CHECKLIST = [
  'האם העסקה מתאימה לתוכנית שלי?',
  'האם יש לי סיבה ברורה לכניסה?',
  'איפה הסטופ שלי?',
  'כמה אני מסכן/ת?',
  'האם יחס הסיכון מול הפוטנציאל הגיוני?',
  'איפה אני מתכנן/ת לקחת רווח?',
  'מה יגרום לי לא לקחת את העסקה?',
];

function joinLabels(values: unknown, questionId: string): string {
  if (Array.isArray(values) && values.length) {
    return findOptions(questionId, values as string[]).map((o) => o.label).join(', ');
  }
  return '—';
}

function singleLabel(value: unknown, questionId: string): string {
  if (typeof value === 'string' && value) {
    return findOption(questionId, value)?.label || value;
  }
  return '—';
}

export default function SummaryScreen({ answers, onCtaClick }: Props) {
  const note = personalizedNote(answers.main_goal as string | undefined);

  const stopBefore = (() => {
    const parts: string[] = [];
    const stopDiscipline = singleLabel(answers.stop_discipline, 'stop_discipline');
    if (stopDiscipline !== '—') parts.push(`מיקום הסטופ - ${stopDiscipline.toLowerCase()}`);
    const risk = singleLabel(answers.risk_per_trade, 'risk_per_trade');
    const riskAmount = typeof answers.risk_per_trade_amount === 'string' ? answers.risk_per_trade_amount : '';
    if (risk !== '—') parts.push(riskAmount ? `כמה אני מסכן/ת (${riskAmount})` : 'כמה אני מסכן/ת');
    return parts.length ? parts.join(' · ') : '—';
  })();

  return (
    <div>
      <div className="tp-step-title">תוכנית המסחר שלי ל-30 הימים הקרובים</div>

      <div className="tp-summary-card">
        <div className="tp-summary-row">
          <div className="tp-summary-label">אני מתמקד/ת ב</div>
          <div className="tp-summary-value">{joinLabels(answers.markets, 'markets')} · {singleLabel(answers.trading_style, 'trading_style')}</div>
        </div>

        <div className="tp-summary-row">
          <div className="tp-summary-label">זמן המסחר שלי</div>
          <div className="tp-summary-value">{singleLabel(answers.available_time, 'available_time')} · {singleLabel(answers.trading_hours, 'trading_hours')}</div>
        </div>

        <div className="tp-summary-row">
          <div className="tp-summary-label">ה-Setup / הכלים שלי</div>
          <div className="tp-summary-value">{joinLabels(answers.entry_tools, 'entry_tools')}</div>
        </div>

        <div className="tp-summary-row">
          <div className="tp-summary-label">לפני כל כניסה אני בודק/ת</div>
          <div className="tp-summary-value">{stopBefore}</div>
        </div>

        <div className="tp-summary-row">
          <div className="tp-summary-label">האתגר המרכזי שלי כרגע</div>
          <div className="tp-summary-value">{joinLabels(answers.management_difficulty, 'management_difficulty') !== '—' ? joinLabels(answers.management_difficulty, 'management_difficulty') : joinLabels(answers.mental_difficulty, 'mental_difficulty')}</div>
        </div>

        <div className="tp-summary-row">
          <div className="tp-summary-label">המטרה שלי לחודש הקרוב</div>
          <div className="tp-summary-value">{singleLabel(answers.main_goal, 'main_goal')}</div>
        </div>

        {typeof answers.definition_of_success === 'string' && answers.definition_of_success && (
          <div className="tp-summary-row">
            <div className="tp-summary-label">סימן להצלחה בשבילי</div>
            <div className="tp-summary-value">{answers.definition_of_success}</div>
          </div>
        )}

        {typeof answers.personal_rule === 'string' && answers.personal_rule && (
          <div className="tp-summary-row">
            <div className="tp-summary-label">הכלל שאני מתחייב/ת לא להפר</div>
            <div className="tp-summary-value">{answers.personal_rule}</div>
          </div>
        )}
      </div>

      {note && <div className="tp-personal-note">{note}</div>}

      <div className="tp-checklist-card">
        <div className="tp-checklist-title">לפני כל עסקה אני עוצר/ת ובודק/ת:</div>
        {CHECKLIST.map((item) => (
          <div key={item} className="tp-checklist-item">{item}</div>
        ))}
        <div className="tp-checklist-footer">אם אין לי תשובה ברורה לאחת השאלות, אולי אני פשוט לא צריך/ה לקחת את העסקה.</div>
      </div>

      <p className="tp-cta-transition">
        עכשיו יש לך תוכנית. החלק המאתגר באמת הוא לעבוד לפיה כשהשוק פתוח ויש כסף אמיתי על המסך :)
        <br /><br />
        בקבוצת "מדברים עסקאות" אנחנו עובדים בדיוק על החלק הזה - לומדים, מנתחים עסקאות, מנהלים אותן בפועל ועובדים עם תוכנית ולא מתוך ניחוש.
      </p>

      <a href="/subscribe" onClick={onCtaClick} className="cta-btn" style={{ textDecoration: 'none' }}>
        רוצה לראות איך זה עובד בקבוצה?
      </a>
    </div>
  );
}
