// סטודיו תוכן שיווקי - מייצר טיוטות פוסטים/רילס לאינסטגרם ופייסבוק בעזרת AI, בהתאמה לקול
// האישי של שירן (לא "באנלי"/גנרי) - לפי פרופיל הטון שמוגדר בטבלת marketing_brand_voice.
import { stripMarkdown } from '@/lib/supportBot';

export type MarketingPlatform = 'instagram' | 'facebook' | 'both';
export type MarketingContentType = 'feed_post' | 'reel' | 'story';

export type BrandVoice = {
  tone_notes: string;
  sample_posts: string;
  avoid_notes: string;
};

export type GeneratedVariant = {
  hook: string;
  caption: string;
  hashtags: string;
  video_script: string;
  visual_idea: string;
};

const BASE_SYSTEM_PROMPT = `אתה כותב תוכן שיווקי עבור שירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים. אתה כותב טיוטות לפוסטים/רילס לאינסטגרם ופייסבוק - שירן תערוך ותאשר כל טיוטה בעצמה לפני פרסום, אז עדיף טיוטה טובה וממוקדת מאשר טקסט "בטוח" וגנרי.

עקרון-על: אסור שזה יישמע כמו תוכן שיווקי גנרי/"באנלי" - לא קלישאות של גורואים ("פיצחנו את הקוד", "הסוד להצלחה", "כסף קל", "הזדמנות של פעם בחיים"), לא משפטי מוטיבציה ריקים, לא אימוג'ים בכל משפט, לא נוסחאות "שאלה רטורית + 3 טיפים + CTA" חבוטות. המטרה: תוכן שנשמע כמו שירן עצמה כותבת - אדם אמיתי עם דעה, לא מותג.

טון בסיסי (אם לא נאמר אחרת בפרופיל הקול למטה): עברית פשוטה וישירה, חמה, בגובה העיניים, כנה - יש עסקאות מרוויחות ויש מפסידות, אף פעם לא מבטיחים רווח/הצלחה/תשואה. לא לוחצים, לא יוצרים FOMO מלאכותי. מותר קצת הומור טבעי במינון קטן.

כללי פורמט:
- caption: הטקסט המלא של הפוסט כפי שיפורסם (כולל שורות ריקות בין פסקאות אם רלוונטי) - בלי כוכביות/סולמיות/עיצוב markdown, כי זה לא יתרנדר. אימוג'ים בודדים בלבד אם טבעי, לא בכל שורה.
- hook: השורה/משפט הפתיחה שמופיע גם בתוך ה-caption עצמו (חייב לעצור גלילה, לא כותרת גנרית).
- hashtags: 5-10 האשטגים רלוונטיים בעברית ו/או אנגלית, מופרדים ברווח, בלי גדילה מלאכותית של כמות.
- video_script: אם content_type הוא reel - סקריפט קצר לסרטון (עד כ-45 שניות): מה נאמר/קורה על המסך, מבנה של קאט-קאט (לא פסקה רציפה), כולל הצעה למשפט פתיחה חזק ב-2-3 השניות הראשונות. אם content_type הוא feed_post או story - השאר מחרוזת ריקה.
- visual_idea: תיאור קצר (1-3 משפטים) של הרעיון הוויזואלי/סוג התמונה או הקליפ שמתאים - לא ליצור תמונה, רק כיוון לשירן לצילום/עריכה בעצמה.

ענה אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי markdown code fence) במבנה הבא:
{"hook": "...", "caption": "...", "hashtags": "...", "video_script": "...", "visual_idea": "..."}`;

function buildUserPrompt(params: {
  platform: MarketingPlatform;
  contentType: MarketingContentType;
  topic: string;
  brandVoice: BrandVoice;
}): string {
  const { platform, contentType, topic, brandVoice } = params;
  const platformLabel = platform === 'both' ? 'אינסטגרם ופייסבוק' : platform === 'instagram' ? 'אינסטגרם' : 'פייסבוק';
  const contentTypeLabel = contentType === 'reel' ? 'רילס/סרטון קצר' : contentType === 'story' ? 'סטורי' : 'פוסט פיד רגיל';

  const voiceParts: string[] = [];
  if (brandVoice.tone_notes.trim()) voiceParts.push(`תיאור הטון והסגנון של שירן:\n${brandVoice.tone_notes.trim()}`);
  if (brandVoice.sample_posts.trim()) voiceParts.push(`דוגמאות אמיתיות לפוסטים/הודעות של שירן (לחקות את הסגנון, לא להעתיק תוכן):\n${brandVoice.sample_posts.trim()}`);
  if (brandVoice.avoid_notes.trim()) voiceParts.push(`דברים במפורש להימנע מהם:\n${brandVoice.avoid_notes.trim()}`);
  const voiceBlock = voiceParts.length ? voiceParts.join('\n\n') : 'אין פרופיל קול מפורט עדיין - השתמש בטון הבסיסי שהוגדר למעלה.';

  return `כתוב טיוטת ${contentTypeLabel} ל${platformLabel}.

הנושא/הבריף מהמשתמשת:
${topic.trim()}

${voiceBlock}`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return trimmed;
  return trimmed.slice(start, end + 1);
}

async function callClaudeJson(system: string, userMessage: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2048, system, messages: [{ role: 'user', content: userMessage }] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === 'text');
  const raw = textBlock?.text || '';
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    throw new Error('התשובה מה-AI לא הייתה בפורמט JSON תקין - נסי שוב');
  }
}

export type TradeContentInput = {
  symbol: string;
  directionLabel: string;
  durationLabel: string;
  pct: number;
  riskRewardLabel: string | null;
  brandVoice: BrandVoice;
};

const TRADE_SYSTEM_PROMPT = `אתה כותב תוכן שיווקי עבור שירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים. תקבל נתונים עובדתיים על עסקה שנסגרה בתיק שלה (סימבול, כיוון, משך, אחוז תוצאה, יחס סיכוי/סיכון) - בלי שום סכום כסף, ואתה כותב מהם פוסט לאינסטגרם/פייסבוק.

עקרון-על: לא תוכן שיווקי גנרי/"באנלי" - לא קלישאות גורואיות, לא "פיצחנו את זה". טון: עברית פשוטה וישירה, חמה, כנה - עסקה מרוויחה ועסקה מפסידה מדוברות באותה כנות, בלי להתנצל על הפסד ובלי להתרברב על רווח. הדגש הוא על התהליך/המשמעת/הלקח, לא רק על התוצאה.

חשוב: אסור להזכיר סכומי כסף בשום פורמט (₪/$) - רק את האחוז ויחס הסיכוי/סיכון שניתנו לך. אסור להמציא פרטים על העסקה שלא ניתנו לך (לא סיבת הכניסה, לא ניתוח טכני ספציפי) - אם ברצונך לתאר שיקול/לקח, תשאיר את זה כללי (למשל "לפי התוכנית מראש", "ניהול סיכון קבוע מראש") ולא כמצאה עובדתית.

ענה אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי markdown code fence):
{"hook": "כותרת פתיחה קצרה וממוקדת - עד 55 תווים, כי היא גם מוצגת בגרפיקה של הפוסט", "caption": "טקסט הפוסט המלא (כולל את ה-hook כשורה ראשונה)", "hashtags": "5-8 האשטגים רלוונטיים מופרדים ברווח"}`;

export async function generateFromTrade(input: TradeContentInput): Promise<{ hook: string; caption: string; hashtags: string }> {
  const voiceParts: string[] = [];
  if (input.brandVoice.tone_notes.trim()) voiceParts.push(`תיאור הטון: ${input.brandVoice.tone_notes.trim()}`);
  if (input.brandVoice.sample_posts.trim()) voiceParts.push(`דוגמאות סגנון: ${input.brandVoice.sample_posts.trim()}`);
  if (input.brandVoice.avoid_notes.trim()) voiceParts.push(`להימנע מ: ${input.brandVoice.avoid_notes.trim()}`);

  const userMessage = `נתוני העסקה:
סימבול: ${input.symbol}
כיוון: ${input.directionLabel}
משך: ${input.durationLabel}
תוצאה: ${input.pct >= 0 ? '+' : ''}${input.pct.toFixed(1)}%
${input.riskRewardLabel ? `יחס סיכוי/סיכון בפועל: ${input.riskRewardLabel}` : ''}

${voiceParts.join('\n') || 'אין פרופיל קול מפורט - השתמש בטון הבסיסי.'}`;

  const parsed = await callClaudeJson(TRADE_SYSTEM_PROMPT, userMessage);
  return {
    hook: stripMarkdown(String(parsed.hook || '')),
    caption: stripMarkdown(String(parsed.caption || '')),
    hashtags: String(parsed.hashtags || ''),
  };
}

const WHATSAPP_CONTENT_SYSTEM_PROMPT = `אתה כותב תוכן שיווקי עבור שירן דימור, מנטורית למסחר אחראי במניות וחוזים עתידיים. תקבל ייצוא גולמי של קבוצת וואטסאפ (פורמט שורות כמו "12/3/25, 14:02 - שם השולח/ת: תוכן ההודעה").

קריטי - פרטיות: הקובץ עשוי לכלול גם הודעות של חברי/ות קבוצה אחרים (שאלות, תגובות, שיתופים אישיים) ולא רק של שירן דימור עצמה. אסור בהחלט להשתמש, לצטט, לפרפרז, או אפילו לרמוז על תוכן של כל שולח/ת שאינו/ה "שירן דימור" - גם לא בעילום שם. השתמש אך ורק בהודעות ששורת השולח/ת בהן היא באופן מפורש "שירן דימור" (או וריאציה ברורה של השם שלה, לא כינוי כללי). אם לא ניתן לזהות בבירור הודעות שלה בקובץ - אל תמציא תחליף, פשוט ציין זאת ב-topicSummary והחזר hook/caption ריקים.

המשימה: לבחור נקודה/תובנה אחת מעניינת ובעלת ערך אמיתי מתוך מה ששירן עצמה כתבה בפועל (ורק היא), ולנסח ממנה פוסט מלוטש לאינסטגרם/פייסבוק - לא העתק-הדבק של ההודעה המקורית, אלא ניסוח מחדש שקורא כמו פוסט שלם ומגובש, אבל נאמן לעובדות ולדעה שהיא בפועל הביעה שם (בלי להוסיף נתונים/טענות שלא מופיעות בטקסט).

חשוב: אם ברשימה למטה מופיעים "רעיונות שכבר נוצרו מהעלאה הזו" - חובה לבחור נקודה שונה מהם, לא לחזור על אותו רעיון.
אל תזכיר סכומי כסף בשום פורמט. אל תמציא נתוני שוק/מניות שלא הופיעו בטקסט המקורי.

ענה אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי markdown code fence):
{"hook": "כותרת פתיחה קצרה - עד 70 תווים, כי היא גם מוצגת בגרפיקה", "caption": "טקסט הפוסט המלא", "hashtags": "5-8 האשטגים רלוונטיים מופרדים ברווח", "topicSummary": "תקציר קצר (עד 12 מילים) של איזו נקודה נבחרה, לצורך תיעוד פנימי בלבד"}`;

export async function generateFromWhatsapp(params: {
  rawText: string;
  groupLabel: string;
  brandVoice: BrandVoice;
  avoidHooks: string[];
}): Promise<{ hook: string; caption: string; hashtags: string; topicSummary: string }> {
  const voiceParts: string[] = [];
  if (params.brandVoice.tone_notes.trim()) voiceParts.push(`תיאור הטון: ${params.brandVoice.tone_notes.trim()}`);
  if (params.brandVoice.avoid_notes.trim()) voiceParts.push(`להימנע מ: ${params.brandVoice.avoid_notes.trim()}`);

  const MAX_CHARS = 300000;
  const clippedText = params.rawText.length > MAX_CHARS ? params.rawText.slice(params.rawText.length - MAX_CHARS) : params.rawText;

  const userMessage = `מקור: ${params.groupLabel}

${voiceParts.join('\n') || ''}

${params.avoidHooks.length ? `רעיונות שכבר נוצרו מהעלאה הזו (אל תחזור עליהם):\n${params.avoidHooks.map((h) => `- ${h}`).join('\n')}\n` : ''}

ייצוא הצ'אט:
${clippedText}`;

  const parsed = await callClaudeJson(WHATSAPP_CONTENT_SYSTEM_PROMPT, userMessage);
  return {
    hook: stripMarkdown(String(parsed.hook || '')),
    caption: stripMarkdown(String(parsed.caption || '')),
    hashtags: String(parsed.hashtags || ''),
    topicSummary: stripMarkdown(String(parsed.topicSummary || '')),
  };
}

export async function generateMarketingVariant(params: {
  platform: MarketingPlatform;
  contentType: MarketingContentType;
  topic: string;
  brandVoice: BrandVoice;
}): Promise<GeneratedVariant> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: BASE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(params) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === 'text');
  const raw = textBlock?.text || '';

  let parsed: Partial<GeneratedVariant>;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('התשובה מה-AI לא הייתה בפורמט JSON תקין - נסי שוב');
  }

  return {
    hook: stripMarkdown(String(parsed.hook || '')),
    caption: stripMarkdown(String(parsed.caption || '')),
    hashtags: String(parsed.hashtags || ''),
    video_script: stripMarkdown(String(parsed.video_script || '')),
    visual_idea: stripMarkdown(String(parsed.visual_idea || '')),
  };
}
