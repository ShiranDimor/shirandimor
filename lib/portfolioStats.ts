const MONTH_LABELS_SHORT = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const MONTH_LABELS_FULL = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export type MonthlyReturn = { key: string; label: string; fullLabel: string; count: number; portfolioPct: number };

type MinimalTrade = { closed_at: string | null; realized_pnl_usd: number | null };

// מקבץ עסקאות סגורות לפי חודש ומחשב, לכל חודש, את הרווח/הפסד הדולרי בפועל ביחס לגודל התיק -
// לא ממוצע אחוזים פשוט של עסקאות בודדות (שנותן משקל שווה לעסקה קטנה וגדולה), ולא אחוז הצלחה
// (שיכול להטעות: 30% הצלחה עם זוכות גדולות יכול להיות חודש רווחי, ו-80% הצלחה עם הפסד בודד
// גדול יכול להיות חודש מפסיד). זו הפונקציה היחידה שמחשבת את זה - גם עמוד הבית וגם /portfolio
// קוראים לה, כדי ששינוי אחד ישפיע על שניהם במקום שהם יוכלו להתפצל ולסתור זה את זה
export function buildMonthlyPortfolioReturns(
  closedTrades: MinimalTrade[],
  initialBalance: number | null,
  limit?: number
): MonthlyReturn[] {
  const byMonth = new Map<string, MinimalTrade[]>();
  for (const t of closedTrades) {
    if (!t.closed_at) continue;
    const d = new Date(t.closed_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(t);
  }
  let months = Array.from(byMonth.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  if (limit) months = months.slice(0, limit);

  return months.map(([key, trades]) => {
    const [year, monthIdx] = key.split('-').map(Number);
    const monthPnlUsd = trades.reduce((s, t) => s + (t.realized_pnl_usd ?? 0), 0);
    return {
      key,
      label: MONTH_LABELS_SHORT[monthIdx],
      fullLabel: `${MONTH_LABELS_FULL[monthIdx]} ${year}`,
      count: trades.length,
      portfolioPct: initialBalance ? (monthPnlUsd / initialBalance) * 100 : 0,
    };
  });
}
