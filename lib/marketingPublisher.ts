// מנוע הפרסום של סטודיו התוכן: מפרסם פוסט אחד לכל הערוצים שהוגדרו לו (פייסבוק, אינסטגרם או
// שניהם; פיד או סטורי), ומדלג על כל ערוץ שכבר פורסם - כך שאפשר להריץ שוב בבטחה אחרי כישלון
// חלקי בלי לפרסם פעמיים. משמש גם את כפתורי הפרסום הידני וגם את התזמון האוטומטי.
//
// התזמון האוטומטי מפרסם רק פוסטים ששירן אישרה בעצמה: סטטוס "מתוזמן" + זמן פרסום. טיוטות
// ופוסטים "מאושרים" בלי זמן לא מתפרסמים לעולם בלי לחיצה שלה.
import { supabaseAdmin } from '@/lib/instantLogin';
import { renderSlidesToPngBase64 } from '@/lib/marketingCardImage';
import {
  publishPhotoToFacebookPage,
  publishPhotoStoryToFacebookPage,
  publishToInstagram,
  publishStoryToInstagram,
} from '@/lib/metaPublish';

export const MAX_PUBLISH_ATTEMPTS = 3;

type MarketingPostRow = {
  id: string;
  platform: 'instagram' | 'facebook' | 'both';
  content_type: 'feed_post' | 'reel' | 'story';
  caption: string | null;
  hashtags: string | null;
  status: string;
  image_base64: string | null;
  extra_images: string[] | null;
  external_post_id: string | null;
  story_image_base64: string | null;
  story_published_at: string | null;
  ig_post_id: string | null;
  ig_story_published_at: string | null;
  slides_html: string[] | null;
  publish_attempts: number | null;
};

const FEED_HEIGHT = 1350;
const STORY_HEIGHT = 1920;

// חבילות תוכן מוכנות נשמרות כ-HTML לכל שקף (slides_html) - כאן הם הופכים לתמונות אמיתיות:
// השקף הראשון לכרטיס הראשי, השאר לתמונות הנוספות (קרוסלה). פוסט שכבר יש לו תמונה לא מרונדר שוב.
export async function renderSlidesIfNeeded(postId: string): Promise<{ rendered: boolean }> {
  const { data: post, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, content_type, slides_html, image_base64')
    .eq('id', postId)
    .single();
  if (error || !post) throw new Error('הפוסט לא נמצא');

  const slides: string[] = Array.isArray(post.slides_html) ? post.slides_html.filter((s: unknown) => typeof s === 'string' && s) : [];
  if (slides.length === 0 || post.image_base64) return { rendered: false };

  const height = post.content_type === 'story' ? STORY_HEIGHT : FEED_HEIGHT;
  const images = await renderSlidesToPngBase64(slides, height);

  const { error: updateError } = await supabaseAdmin
    .from('marketing_posts')
    .update({ image_base64: images[0], extra_images: images.slice(1), slides_rendered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (updateError) throw new Error('שגיאה בשמירת התמונות שנוצרו');

  return { rendered: true };
}

export type ChannelResult = { channel: string; ok: boolean; skipped?: boolean; error?: string };

// מפרסם את הפוסט לכל הערוצים שעוד לא פורסמו. only מאפשר לכפתור ידני לפרסם ערוץ אחד בלבד.
export async function publishMarketingPost(
  postId: string,
  options: { only?: 'facebook' | 'instagram' } = {}
): Promise<{ results: ChannelResult[]; allDone: boolean }> {
  await renderSlidesIfNeeded(postId);

  const { data, error } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', postId).single();
  if (error || !data) throw new Error('הפוסט לא נמצא');
  const post = data as MarketingPostRow;

  if (post.content_type === 'reel') {
    throw new Error('פרסום רילס (וידאו) אוטומטי עוד לא נתמך - צריך להעלות את הסרטון ידנית');
  }

  const wantsFacebook = (post.platform === 'facebook' || post.platform === 'both') && options.only !== 'instagram';
  const wantsInstagram = (post.platform === 'instagram' || post.platform === 'both') && options.only !== 'facebook';
  const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
  const feedImages = [post.image_base64, ...(Array.isArray(post.extra_images) ? post.extra_images : [])].filter((img): img is string => Boolean(img));
  const isStoryPost = post.content_type === 'story';
  const storyImage = isStoryPost ? post.story_image_base64 || post.image_base64 : post.story_image_base64;

  const results: ChannelResult[] = [];
  const updates: Record<string, unknown> = {};

  async function attempt(channel: string, alreadyDone: boolean, run: () => Promise<Record<string, unknown>>) {
    if (alreadyDone) {
      results.push({ channel, ok: true, skipped: true });
      return;
    }
    try {
      Object.assign(updates, await run());
      results.push({ channel, ok: true });
    } catch (e) {
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  if (!isStoryPost) {
    if (wantsFacebook) {
      await attempt('פייסבוק - פיד', Boolean(post.external_post_id), async () => {
        const { postId: id } = await publishPhotoToFacebookPage({ images: feedImages, caption });
        return { external_post_id: id };
      });
    }
    if (wantsInstagram) {
      await attempt('אינסטגרם - פיד', Boolean(post.ig_post_id), async () => {
        const { postId: id, permalink } = await publishToInstagram({ images: feedImages, caption });
        return { ig_post_id: id, ig_permalink: permalink, ig_published_at: new Date().toISOString() };
      });
    }
  }

  // סטורי: לפוסט מסוג סטורי זה התוכן עצמו; לפוסט פיד - רק אם נוצרה לו גרסת סטורי
  if (storyImage) {
    if (wantsFacebook) {
      await attempt('פייסבוק - סטורי', Boolean(post.story_published_at), async () => {
        const { postId: id } = await publishPhotoStoryToFacebookPage({ storyImageBase64: storyImage });
        return { story_external_post_id: id, story_published_at: new Date().toISOString() };
      });
    }
    if (wantsInstagram) {
      await attempt('אינסטגרם - סטורי', Boolean(post.ig_story_published_at), async () => {
        const { postId: id } = await publishStoryToInstagram({ storyImageBase64: storyImage });
        return { ig_story_id: id, ig_story_published_at: new Date().toISOString() };
      });
    }
  } else if (isStoryPost) {
    results.push({ channel: 'סטורי', ok: false, error: 'לסטורי הזה אין תמונה לפרסום' });
  }

  if (results.length === 0) {
    results.push({ channel: 'כללי', ok: false, error: 'אין ערוץ פרסום מתאים לפוסט הזה' });
  }

  const failures = results.filter((r) => !r.ok);
  const allDone = failures.length === 0;
  const now = new Date().toISOString();

  updates.updated_at = now;
  updates.publish_error = allDone ? null : failures.map((f) => `${f.channel}: ${f.error}`).join(' | ');

  // "פורסם" רק כשכל הערוצים שהפוסט אמור לצאת אליהם כבר פורסמו (גם אם בכמה פעמים נפרדות)
  const merged = { ...post, ...updates } as MarketingPostRow & Record<string, unknown>;
  const fullFacebook = post.platform === 'facebook' || post.platform === 'both';
  const fullInstagram = post.platform === 'instagram' || post.platform === 'both';
  const everyChannelDone =
    (!fullFacebook || ((isStoryPost || Boolean(merged.external_post_id)) && (!storyImage || Boolean(merged.story_published_at)))) &&
    (!fullInstagram || ((isStoryPost || Boolean(merged.ig_post_id)) && (!storyImage || Boolean(merged.ig_story_published_at))));

  if (allDone && everyChannelDone) {
    updates.status = 'published';
    updates.published_at = now;
  }
  if (!allDone) {
    updates.publish_attempts = (post.publish_attempts || 0) + 1;
  }

  const { error: saveError } = await supabaseAdmin.from('marketing_posts').update(updates).eq('id', postId);
  if (saveError) console.error('marketingPublisher: הפרסום בוצע אבל שמירת הסטטוס נכשלה', postId, saveError);

  return { results, allDone };
}
