// "תקן לפי ההערה" בסטודיו התוכן: שירן כותבת הערה חופשית על פוסט (טקסט או עיצוב), ו-Claude מחזיר
// גרסה מתוקנת. רק השקפים שהשתנו מרונדרים מחדש - כדי שזה יסתיים בתוך זמן הריצה של הפונקציה.
// כל גרסה קודמת נשמרת ב-revision_history, כדי שאפשר יהיה לחזור אחורה בלחיצה.
import { supabaseAdmin } from '@/lib/instantLogin';
import { renderSlidesToPngBase64 } from '@/lib/marketingCardImage';

const MAX_HISTORY = 10;

type Revision = {
  at: string;
  note: string;
  hook: string;
  caption: string;
  hashtags: string;
  slides_html: string[] | null;
};

const REVISE_SYSTEM_PROMPT = `אתה מעצב וקופירייטר של שירן דימור ("מסחר אחראי במניות"). תקבל פוסט קיים לאינסטגרם/פייסבוק - טקסט, ולפעמים גם שקפים מעוצבים כקובצי HTML - ואת ההערה של שירן. תקן בדיוק את מה שהיא ביקשה, ושום דבר אחר.

כללי טקסט: עברית פשוטה, ישירה וחמה, בגובה העיניים. כנות מלאה - לא מבטיחים רווח, בלי קלישאות גורו ובלי FOMO. בלי עיצוב markdown. אם יש בכיתוב קריאה לפעולה לחודש הראשון ב-₪1 - להשאיר אותה.

כללי עיצוב לשקפים: כל שקף הוא מסמך HTML עצמאי ברוחב 1080px ובגובה קבוע (1350 לפוסט, 1920 לסטורי) - לשמור על המידות, על כיוון RTL, על הפונטים (Rubik, ומספרים ב-JetBrains Mono) ועל פלטת האתר: רקע #1A181C, משטחים #242126, קווים #433D46, ורוד #FF2D78, זהב #FFB648, גרדיאנט ורוד→זהב, טקסט #F5F3F4/#B8B2B9/#8A8389, ירוק #3DDC84 ואדום #FF5C5C רק למשמעות של רווח/הפסד. לוודא שהטקסט נכנס בשקף ולא נחתך (אם מאריכים טקסט - להקטין גופן). בלי סקריפטים ובלי תמונות חיצוניות.

החזר רק את מה שהשתנה, כדי שהתשובה תהיה קצרה:
- שדה טקסט (hook/caption/hashtags) - רק אם שינית אותו.
- slides - רק השקפים ששינית, כל אחד עם האינדקס שלו (מתחיל מ-0) וה-HTML המלא והחדש שלו.
- summary - משפט קצר בעברית שמתאר מה שינית.

ענה אך ורק ב-JSON תקין (בלי טקסט לפני/אחרי, בלי code fence):
{"summary": "...", "hook": "...", "caption": "...", "hashtags": "...", "slides": [{"index": 0, "html": "<!doctype html>..."}]}`;

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return trimmed;
  return trimmed.slice(start, end + 1);
}

async function askClaude(userMessage: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY לא מוגדר');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 12000, output_config: { effort: 'low' }, system: REVISE_SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`שגיאה מ-Anthropic API (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data?.stop_reason === 'max_tokens') throw new Error('התיקון יצא ארוך מדי - נסי הערה ממוקדת יותר (למשל לשקף אחד)');
  const raw = data?.content?.find((b: { type: string }) => b.type === 'text')?.text || '';
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    throw new Error('התשובה מה-AI לא הייתה בפורמט תקין - נסי שוב');
  }
}

export async function revisePostFromNote(postId: string, note: string): Promise<{ summary: string }> {
  const { data: post, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, content_type, status, hook, caption, hashtags, slides_html, image_base64, extra_images, revision_history')
    .eq('id', postId)
    .single();
  if (error || !post) throw new Error('הפוסט לא נמצא');

  const slides: string[] = Array.isArray(post.slides_html) ? post.slides_html : [];
  const formatLabel = post.content_type === 'story' ? 'סטורי (1080x1920)' : 'פוסט פיד (1080x1350)';

  const message = [
    `סוג: ${formatLabel}`,
    `hook:\n${post.hook || ''}`,
    `caption:\n${post.caption || ''}`,
    `hashtags:\n${post.hashtags || ''}`,
    slides.length
      ? `שקפים (${slides.length}):\n` + slides.map((html, i) => `--- שקף ${i} ---\n${html}`).join('\n')
      : 'לפוסט הזה אין שקפים מעוצבים כ-HTML - אפשר לתקן רק את הטקסט. אם ההערה היא על התמונה, החזר summary שמסביר שאת התמונה הזו אי אפשר לתקן מכאן.',
    `ההערה של שירן:\n${note}`,
  ].join('\n\n');

  const result = await askClaude(message);

  const updates: Record<string, unknown> = {};
  for (const field of ['hook', 'caption', 'hashtags'] as const) {
    if (typeof result[field] === 'string' && result[field] !== post[field]) updates[field] = result[field];
  }

  // שקפים שהשתנו: מחליפים את ה-HTML ומרנדרים מחדש רק אותם
  const newSlides = [...slides];
  const changedIndexes: number[] = [];
  if (Array.isArray(result.slides)) {
    for (const item of result.slides as { index?: unknown; html?: unknown }[]) {
      const index = Number(item?.index);
      if (Number.isInteger(index) && index >= 0 && index < slides.length && typeof item?.html === 'string' && item.html.includes('<')) {
        newSlides[index] = item.html;
        changedIndexes.push(index);
      }
    }
  }

  if (changedIndexes.length) {
    updates.slides_html = newSlides;
    const height = post.content_type === 'story' ? 1920 : 1350;
    const rendered = await renderSlidesToPngBase64(changedIndexes.map((i) => newSlides[i]), height);
    const images = [post.image_base64, ...(Array.isArray(post.extra_images) ? post.extra_images : [])];
    changedIndexes.forEach((slideIndex, k) => {
      images[slideIndex] = rendered[k];
    });
    // אם התמונות עוד לא נוצרו בכלל, הן ייווצרו כולן בסבב הבא - לא משלימים כאן חלקית
    if (post.image_base64) {
      updates.image_base64 = images[0];
      updates.extra_images = images.slice(1);
    }
  }

  const summary = typeof result.summary === 'string' && result.summary ? result.summary : 'בוצע תיקון';
  if (Object.keys(updates).length === 0) return { summary: `${summary} (לא השתנה דבר בפוסט)` };

  const history: Revision[] = Array.isArray(post.revision_history) ? post.revision_history : [];
  const previous: Revision = {
    at: new Date().toISOString(),
    note,
    hook: post.hook || '',
    caption: post.caption || '',
    hashtags: post.hashtags || '',
    slides_html: slides.length ? slides : null,
  };
  updates.revision_history = [previous, ...history].slice(0, MAX_HISTORY);
  updates.last_revision_summary = summary;
  updates.updated_at = new Date().toISOString();

  // פוסט שכבר אושר ותוזמן חוזר לטיוטה - כדי שגרסה שעוד לא נבדקה לא תתפרסם לבד
  if (post.status === 'scheduled') updates.status = 'draft';

  const { error: saveError } = await supabaseAdmin.from('marketing_posts').update(updates).eq('id', postId);
  if (saveError) throw new Error('שגיאה בשמירת הגרסה המתוקנת');

  return { summary };
}

// חזרה לגרסה הקודמת: משחזרים טקסט ושקפים, והתמונות נוצרות מחדש מהשקפים
export async function undoLastRevision(postId: string): Promise<void> {
  const { data: post, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status, revision_history, slides_html')
    .eq('id', postId)
    .single();
  if (error || !post) throw new Error('הפוסט לא נמצא');

  const history: Revision[] = Array.isArray(post.revision_history) ? post.revision_history : [];
  const [previous, ...rest] = history;
  if (!previous) throw new Error('אין גרסה קודמת לחזור אליה');

  const updates: Record<string, unknown> = {
    hook: previous.hook,
    caption: previous.caption,
    hashtags: previous.hashtags,
    revision_history: rest,
    last_revision_summary: null,
    updated_at: new Date().toISOString(),
  };
  if (post.status === 'scheduled') updates.status = 'draft';

  const restoredSlides = Array.isArray(previous.slides_html) ? previous.slides_html : null;
  if (restoredSlides && JSON.stringify(restoredSlides) !== JSON.stringify(post.slides_html)) {
    updates.slides_html = restoredSlides;
    const { data: full } = await supabaseAdmin.from('marketing_posts').select('content_type').eq('id', postId).single();
    const images = await renderSlidesToPngBase64(restoredSlides, full?.content_type === 'story' ? 1920 : 1350);
    updates.image_base64 = images[0];
    updates.extra_images = images.slice(1);
    updates.slides_rendered_at = new Date().toISOString();
  }

  const { error: saveError } = await supabaseAdmin.from('marketing_posts').update(updates).eq('id', postId);
  if (saveError) throw new Error('שגיאה בשחזור הגרסה הקודמת');
}
