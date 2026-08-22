import { NextResponse } from 'next/server';
import { buildUserPlanEmailHtml } from '@/lib/tradingPlan/emailContent';

// זמני - רינדור בלבד של תבנית מייל התוכנית בלי לשלוח בפועל, כדי לוודא שהתיקון (color-scheme + ניסוח) נכנס
export async function GET() {
  const html = buildUserPlanEmailHtml({
    name: 'בדיקה',
    trading_experience: 'never_traded',
    markets: ['stocks'],
    week_one_win: ['kept_the_rule'],
    personal_rule: 'לא לזוז מהסטופ',
  } as any);
  return new NextResponse(html, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
