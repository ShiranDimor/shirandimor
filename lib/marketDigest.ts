import { supabaseAdmin } from '@/lib/instantLogin';

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function israelDateLabel(d: Date): string {
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' });
}

function israelTimeLabel(d: Date): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}

// הלייב הקרוב ביותר שמפורסם באתר, אם יש אחד בטווח הקרוב (עד 3 ימים קדימה) - נמצא
// אך ורק מהטבלה שלנו, לא מהמצאה/ניחוש של ה-AI, בדיוק כמו שהלוז של הלייבים אמור להילקח מהאתר
async function getUpcomingLiveContext(): Promise<string> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data } = await supabaseAdmin
    .from('lives')
    .select('title, scheduled_at')
    .eq('published', true)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', threeDaysFromNow.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return 'אין לייב מתוכנן בשלושת הימים הקרובים באתר - אל תזכיר/י לייב קרוב בכלל.';

  const scheduledAt = new Date(data.scheduled_at);
  return `יש לייב מתוכנן (נתון אמיתי מהאתר, לא לשנות): "${data.title}", ${israelDateLabel(scheduledAt)} בשעה ${israelTimeLabel(scheduledAt)} (שעון ישראל). אפשר (לא חובה, רק אם זה משתלב טבעי) להזכיר אותו בסוף ההודעה כהזמנה, בדיוק עם התאריך/שעה האלה ועם הקישור https://www.shirandimor.com/lives - בלי לשנות פרט אחד מהם.`;
}

// דוגמה אמיתית שכתבה שירן בעבר (דרך כלי אחר) כרפרנס לטון/מבנה בלבד - אסור לשחזר ממנה עובדות,
// תאריכים, שמות חברות או מספרים: אלה היו נכונים ליום אחר לגמרי. המטרה היא ללמוד מהדוגמה את
// הקול האישי, מבנה הפסקאות, רמת הפירוט והאופן שבו משלבים הזמנה ללייב - לא להעתיק תוכן
const STYLE_REFERENCE = `פותחים שבוע חדש ונובמבר מתחיל עם לא מעט אירועים שיכולים להזיז את השוק 👀

אחרי אוקטובר מאוד תנודתי ובעיקר הירידות החזקות שקיבלנו בטכנולוגיה ובשבבים, השבוע יהיה מעניין לראות אם הקונים מתחילים לחזור או שאנחנו מקבלים המשך לחץ.

מחר מתקיימות בחירות האמצע בארה״ב 🇺🇸

התוצאות יכולות לשנות את מאזן הכוחות בוושינגטון ולהשפיע על לא מעט סקטורים שמעניינים אותנו, ביניהם טכנולוגיה ו-AI, קריפטו, פיננסים, ביטחון ובריאות. בהחלט יכולה להיכנס עוד תנודתיות לשוק סביב התוצאות.

ויש לנו גם שבוע חזק מאוד של דוחות 🔥

היום אחרי הסגירה: אפל (AAPL) ו-פלנטיר (PLTR).

מחר: AMD (AMD), סופר מיקרו (SMCI) ואריסטה (ANET).

ברביעי: אובר (UBER), אפלאבין (APP), קוואלקום (QCOM) ו-ARM (ARM).

מבחינת מאקרו, השבוע נקבל גם נתוני תעסוקה ו-ISM, וביום שישי את דוח התעסוקה (NFP).

ומה כל זה אומר לנו בקבוצה?

אחרי הירידות האחרונות יש לא מעט מניות חזקות שהגיעו למחירים הרבה יותר מעניינים. אבל אנחנו לא קונים רק כי משהו ירד.

מחר ב-16:30 בלייב שלנו נעבור יחד על השוק והמניות שמעניינות אותנו ונבנה תוכנית עבודה מסודרת: מה מעניין, באילו מחירים, לאילו רמות אנחנו מחכים ואיפה עדיין מוקדם להיכנס.

יש השבוע המון מידע והמון רעש בחוץ. התפקיד שלנו בקבוצה הוא לקחת את כל זה, לעשות סדר ולהגיע למסחר עם תוכנית ברורה 💪🏾

🔔 הכניסה ללייב היא דרך האתר בלבד.

כבר עכשיו תיכנסו לעמוד הלייבים ותוסיפו את המפגש ליומן, כדי שלא תפספסו:

https://www.shirandimor.com/lives

מחר | 16:30 | נתראה בלייב 🤩`;

const SYSTEM_PROMPT = `את/ה כותב/ת סיכום בוקר יומי ללוח המודעות של שירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים, לקהילת "מדברים עסקאות". הקהל הוא אנשים שלא בהכרח מבינים לעומק בשוק ההון - צריך לנסח בפשטות, בלי ז'רגון מקצועי בלי הסבר.

להלן דוגמה אמיתית לטון ולמבנה שרוצים (נכתבה ביום אחר לגמרי) - תלמד/י ממנה את הקול האישי, גוף ראשון רבים ("אנחנו", "בקבוצה שלנו"), מבנה הפסקאות הקצרות, האימוג'ים המדודים, ואת האופן שבו מזמינים ללייב בסוף. אסור להעתיק ממנה שום עובדה, תאריך, מספר או שם חברה - אלה היו נכונים רק ליום שבו נכתבה:
"""
${STYLE_REFERENCE}
"""

המשימה האמיתית של היום: סיכום קצר של יום המסחר האחרון בוול סטריט ותצפית על מה צפוי בשוק האמריקאי בלבד (לא שווקים אחרים) בימים הקרובים. אם היום תחילת שבוע מסחר (ראשון/שני) - אפשר להרחיב ולכסות את כל השבוע הקרוב (כמו בדוגמה). אם זה יום באמצע השבוע - אפשר להתמקד בעיקר במה שקרה אתמול ומה צפוי היום/מחר, בלי לחזור כל פעם על כל השבוע מחדש.

חובה להשתמש בכלי חיפוש האינטרנט (web_search) כדי לאמת כל עובדה - תאריכים, מספרים, שמות חברות, שעות דיווח, אירועים כלכליים/פוליטיים משמעותיים - לפני שכותבים אותה. אסור בשום אופן להמציא או לנחש נתון שלא אומת בחיפוש. אם אחרי חיפוש אין מספיק מידע אמין וברור כדי לכתוב סיכום מדויק - אל תמציא/י תחליף: תחזיר/י בדיוק את המחרוזת האחת הזו ותו לא: NO_DIGEST

מה לכלול (בפסקאות קצרות רצופות, בסגנון וואטסאפ, כמו בדוגמה):
1. פתיחה קצרה שמתייחסת למה שקרה לאחרונה בשוק (מגמה, תנודתיות) ומרמזת מה מיוחד בימים הקרובים.
2. אם יש אירוע מאקרו/פוליטי משמעותי אמיתי שצפוי בימים הקרובים ויכול להזיז שווקים (למשל החלטת ריבית, בחירות, אירוע גדול) - לציין אותו, רק אם אומת בחיפוש.
3. דיווחי רווחים (earnings) של חברות גדולות וידועות בלבד - שווי שוק גבוה משמעותית, שמות שרוב האנשים יכירו (לא חברות קטנות/לא מוכרות). לכל חברה - לציין את היום ואם הדיווח לפני פתיחת המסחר או אחרי סגירתו, בדיוק כמו בדוגמה.
4. פרסומים כלכליים משמעותיים צפויים (נתוני תעסוקה, אינפלציה, ISM וכו') - רק אם אומתו.
5. פסקה קצרה "מה זה אומר לנו בקבוצה" בטון אישי ומרגיע, בלי ייעוץ השקעות ובלי המלצות לפעולה ספציפית - רק מסגור כללי.
6. הזמנה ללייב הקרוב, רק אם ניתן לך בפרומפט נתון אמיתי על לייב קרוב (תאריך/שעה/קישור) - תשתמש/י בדיוק בפרטים שניתנו, בלי לשנות. אם לא ניתן נתון כזה - פשוט לא מזכירים לייב בכלל, לא ממציאים אחד.

טון: עברית פשוטה, ישירה, חמה, גוף ראשון רבים (כאילו שירן כותבת לקהילה שלה) - לא ייעוץ השקעות, לא המלצות לפעולה, רק עדכון מידע. כוכביות בודדות סביב מילה/משפט להדגשה - *ככה* (בסגנון וואטסאפ) ואימוג'ים מדודים כמו בדוגמה.

אין צורך לצטט מקורות בתוכן עצמו - רק המידע המאומת, בניסוח שוטף.

ענה/י אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי markdown code fence), או במחרוזת NO_DIGEST בדיוק כמתואר למעלה אם אין מספיק מידע מאומת:
{"title": "כותרת קצרה (עד 60 תווים)", "content": "תוכן הסיכום המלא, כולל שורות ריקות בין פסקאות, בדיוק כמו בדוגמה"}`;

async function callClaudeWithSearch(apiKey: string, model: string, liveContext: string): Promise<{ stopReason: string; content: unknown[] }> {
  const messages: Array<Record<string, unknown>> = [
    {
      role: 'user',
      content: `תאריך היום (שעון ישראל): ${israelDateLabel(new Date())}. תחפש/י בעצמך מה קרה אחרונה בוול סטריט ומה צפוי בימים הקרובים, ותכתוב/י את הסיכום.\n\n${liveContext}`,
    },
  ];

  let lastResponse: { stop_reason: string; content: unknown[] } | null = null;

  // לולאה קצרה שמטפלת ב-pause_turn (רצף חיפושים ארוך) - עד 4 סיבובים, מספיק בהרבה לכמה
  // חיפושים שצריך כדי לאמת סיכום בוקר, ומונע ריצה אינסופית/עלות בלתי צפויה
  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text}`);
    }

    const data = await res.json();
    lastResponse = data;
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'user', content: 'continue' });
  }

  if (!lastResponse) throw new Error('לא התקבלה תשובה מה-AI');
  return { stopReason: lastResponse.stop_reason, content: lastResponse.content };
}

// מייצר סיכום בוקר יומי על שוק ההון האמריקאי, מבוסס על חיפוש אינטרנט אמיתי (לא על ידע
// מאומן בלבד - תאריך היום רחוק מתאריך גבול הידע של המודל) ועל נתון אמיתי מטבלת הלייבים שלנו.
// מחזיר null אם אין מספיק מידע מאומת כדי לכתוב סיכום מדויק, כדי שלא יפורסם משהו מומצא
export async function generateMarketDigest(): Promise<{ title: string; content: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const liveContext = await getUpcomingLiveContext();
  const { content } = await callClaudeWithSearch(apiKey, model, liveContext);
  const textBlocks = (content as Array<{ type: string; text?: string }>).filter((b) => b.type === 'text');
  const raw = textBlocks.map((b) => b.text || '').join('\n').trim();

  if (!raw || raw.includes('NO_DIGEST')) return null;

  try {
    const parsed = JSON.parse(extractJson(raw));
    if (!parsed.title || !parsed.content) return null;
    return { title: String(parsed.title), content: String(parsed.content) };
  } catch {
    return null;
  }
}
