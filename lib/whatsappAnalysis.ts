// מנתח ייצוא צ'אט וואטסאפ (קובץ טקסט שמופק מ"ייצוא צ'אט" בוואטסאפ) עבור אחת משתי הקבוצות של
// שירן - כדי שהיא תקבל תמונה על מה קורה בקבוצה בלי לעבור על הכל ידנית, וגם כדי שהניתוחים
// האלה ישמשו בהמשך ללמידת השפה והטון שלה (למשל לכיוונון "דור")
import { stripMarkdown } from '@/lib/supportBot';

const WHATSAPP_ANALYSIS_SYSTEM_PROMPT = `אתה עוזר ניתוח עסקי לשירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים שמנהלת שתי קבוצות וואטסאפ: "מדברים עסקאות" (קבוצת הסוחרים, בתשלום) ו"מדברים עסקאות - קבוצת עדכונים" (חינמית). היא מעבירה לך קובץ ייצוא צ'אט גולמי מוואטסאפ (שורות בפורמט כמו "12/3/25, 14:02 - שם: תוכן ההודעה"), ואתה מנתח אותו עבורה.

כתוב בעברית, טקסט רגיל בלי markdown (בלי כוכביות, בלי סולמיות, בלי קווים מפרידים), במבנה הבא, כל חלק בפסקה קצרה וממוקדת:

1. הטון והשפה של שירן - איך היא מדברת בפועל בקבוצה (ישירות, חום, הומור, מונחים חוזרים, איך היא מגיבה לשאלות ולהתלבטויות) - כדי שאפשר יהיה להכיר את הסגנון האמיתי שלה, לא רק לתאר באופן כללי. תן דוגמאות קצרות מצוטטות אם יש כאלה שממחישות טוב.

2. מעורבות ופעילות - מי פעיל/ה ומי שקט/ה, שינויים בולטים במעורבות לאורך התקופה שמופיעה בקובץ, שאלות שנשארו בלי מענה.

3. הזדמנויות המרה ושימור - רגעים שבהם מישהו/י הראה עניין אמיתי, התלבטות, או פתיחות שיכלו להוביל להצעה/שדרוג ולא נוצלו, וגם דוגמאות למה שכן עבד טוב.

4. המלצות קונקרטיות - 2-4 המלצות ברורות ומעשיות לשיפור ההמרה או השימור בקבוצה הזו, מבוססות על מה שראית בפועל בקובץ ולא כלליות.

אם הקובץ קצר מדי או לא מכיל מספיק תוכן relevanti לניתוח מסוים - תגיד את זה בקצרה באותו סעיף במקום להמציא תובנות. אל תמציא שמות, ציטוטים או אירועים שלא מופיעים בפועל בטקסט שקיבלת.`;

// שורות "רעש טכני" שוואטסאפ מוסיף אוטומטית לייצוא - לא הודעות אנושיות אמיתיות, ורק מקשות
// על המודל (ועל מי שקורא) להתמקד בתוכן הרלוונטי. מסירים אותן לפני שליחה לניתוח בלבד -
// raw_text שנשמר במסד הנתונים נשאר המקור המלא והלא-מסונן
const SYSTEM_NOISE_PATTERNS = [
  /יצא\/?ה? מהקבוצה/,
  /הצטרפ(ו|ה|ת) באמצעות קישור הזמנה/,
  /הוסיפ(ו|ה|ת) את/,
  /הוסר(ה|ו)? מהקבוצה/,
  /שינ(ה|תה) את (מספר הטלפון|הנושא|תמונת הקבוצה)/,
  /קוד האבטחה .* השתנה/,
  /\[התראת מערכת\]/,
  /\[שיחה\]/,
  /<מדיה לא נכללה>/,
  /ההודעות והשיחות מוצפנות מקצה לקצה/,
];

function stripSystemNoise(rawText: string): string {
  return rawText
    .split('\n')
    .filter((line) => !SYSTEM_NOISE_PATTERNS.some((p) => p.test(line)))
    .join('\n');
}

const MAX_CHARS = 300000; // ~75k טוקנים - שומר מרווח בטוח מתחת לחלון ההקשר של המודל גם עבור ייצוא ארוך מאוד

// חותך מהתחלה ושומר את הסוף (ההודעות האחרונות) - הן הכי רלוונטיות לניתוח מעורבות ושימור עדכני
export function truncateForAnalysis(rawText: string): { text: string; truncated: boolean } {
  if (rawText.length <= MAX_CHARS) return { text: rawText, truncated: false };
  return { text: rawText.slice(rawText.length - MAX_CHARS), truncated: true };
}

export async function analyzeWhatsappExport(rawText: string, groupType: 'סוחרים' | 'עדכונים'): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
  const cleanedText = stripSystemNoise(rawText);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: WHATSAPP_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `זהו ייצוא של קבוצת "${groupType === 'סוחרים' ? 'מדברים עסקאות (קבוצת הסוחרים, בתשלום)' : 'מדברים עסקאות - קבוצת עדכונים (חינמית)'}" (הודעות מערכת כמו הצטרפויות/יציאות כבר הוסרו):\n\n${cleanedText}` }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === 'text');
  return stripMarkdown(textBlock?.text || 'לא הופק ניתוח.');
}
