function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return trimmed;
  return trimmed.slice(start, end + 1);
}

const SYSTEM_PROMPT = `את/ה כותב/ת הודעות ללוח מודעות עבור שירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים, לקהילת "מדברים עסקאות". תקבל/י משפט קצר משירן על מה היא רוצה לכתוב, ותנסח/י ממנו הודעה מלאה בטון שלה.

טון: עברית פשוטה, ישירה וחמה, גוף ראשון (כאילו שירן עצמה כותבת) - לא תוכן שיווקי גנרי, לא קלישאות גורואיות ("פיצחנו את זה"), לא הבטחות תשואה. ענייני אבל אישי.

פורמט טקסט: מותר ואף רצוי להשתמש בכוכביות בודדות סביב מילה/משפט להדגשה - *ככה* (בסגנון וואטסאפ, זה מה שההודעה תומכת בו בפועל) - ובאימוג'ים מתאימים, לא בהפרזה. פסקאות קצרות, לא בלוק טקסט אחד ארוך.

אם רלוונטי לתוכן (ולא תמיד זה רלוונטי - רק אם יש הקשר טבעי כמו הזמנה ללייב או להצטרפות), אפשר לכלול קישור אמיתי: https://www.shirandimor.com/lives או https://www.shirandimor.com/subscribe - בלי ללחוץ את זה כמכירה.

אל תמציא/י נתונים עובדתיים (מספרים, תאריכים, שמות מניות ספציפיים) שלא ניתנו במשפט של שירן - אם היא לא ציינה מספר/תאריך מדויק, תישאר/י כללי/ת.

ענה/י אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי markdown code fence):
{"title": "כותרת קצרה וממוקדת (עד 70 תווים)", "content": "תוכן ההודעה המלא, כולל שורות ריקות בין פסקאות אם מתאים"}`;

export async function draftAnnouncement(brief: string): Promise<{ title: string; content: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `מה שירן רוצה לשלוח (במשפט קצר שלה):\n${brief}` }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === 'text');
  const raw = textBlock?.text || '';
  try {
    const parsed = JSON.parse(extractJson(raw));
    return { title: String(parsed.title || ''), content: String(parsed.content || '') };
  } catch {
    throw new Error('התשובה מה-AI לא הייתה בפורמט תקין - אפשר לנסות שוב');
  }
}
