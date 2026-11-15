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
  createInstagramReelContainer,
  publishInstagramReelIfReady,
  publishVideoToFacebookPage,
} from '@/lib/metaPublish';

const MARKETING_MEDIA_BUCKET = 'marketing-media';

export const MAX_PUBLISH_ATTEMPTS = 3;

const SITE_URL = 'https://www.shirandimor.com';

// באינסטגרם קישור בכיתוב לא לחיץ, ולכן הכיתוב אומר "הקישור בביו". בפייסבוק הקישור כן לחיץ -
// אז שם מחליפים את "הקישור בביו" בקישור אמיתי ליעד של הפוסט (cta_path), עם source ייחודי
// לפוסט, כדי שבמשפך באדמין יופיע בדיוק איזה פוסט הביא כל כניסה והצטרפות
function facebookCaption(caption: string, postId: string, ctaPath: string | null): string {
  const path = ctaPath && ctaPath.startsWith('/') ? ctaPath : '/subscribe';
  const url = `${SITE_URL}${path}${path.includes('?') ? '&' : '?'}source=fb_${postId.slice(0, 8)}`;
  return caption.includes('הקישור בביו') ? caption.replace(/הקישור בביו/g, `כאן: ${url}`) : `${caption}\n\n${url}`;
}

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
  cta_path: string | null;
  video_url: string | null;
  video_source_url: string | null;
  ig_container_id: string | null;
};

// סרטון של רילס מגיע מחבילת התוכן ככתובת מקור (video_source_url). כאן הוא מועתק לדלי הציבורי
// באחסון, כדי שהאתר יציג אותו בלוח האישורים ושפייסבוק ואינסטגרם יוכלו להוריד אותו בפרסום.
export async function ensureVideoUploaded(postId: string): Promise<string | null> {
  const { data: post } = await supabaseAdmin.from('marketing_posts').select('id, video_url, video_source_url').eq('id', postId).single();
  if (!post) return null;
  if (post.video_url) return post.video_url;
  if (!post.video_source_url) return null;

  const res = await fetch(post.video_source_url);
  if (!res.ok) throw new Error(`לא הצלחתי להוריד את הסרטון מהמקור (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const objectPath = `reels/${postId}.mp4`;
  const { error } = await supabaseAdmin.storage.from(MARKETING_MEDIA_BUCKET).upload(objectPath, buffer, { contentType: 'video/mp4', upsert: true });
  if (error) throw new Error(`שגיאה בהעלאת הסרטון לאחסון: ${error.message}`);
  const url = supabaseAdmin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl;
  await supabaseAdmin.from('marketing_posts').update({ video_url: url, updated_at: new Date().toISOString() }).eq('id', postId);
  return url;
}

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

export type ChannelResult = { channel: string; ok: boolean; skipped?: boolean; pending?: boolean; error?: string };

// מפרסם את הפוסט לכל הערוצים שעוד לא פורסמו. only מאפשר לכפתור ידני לפרסם ערוץ אחד בלבד.
export async function publishMarketingPost(
  postId: string,
  options: { only?: 'facebook' | 'instagram' } = {}
): Promise<{ results: ChannelResult[]; allDone: boolean }> {
  await renderSlidesIfNeeded(postId);

  const { data, error } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', postId).single();
  if (error || !data) throw new Error('הפוסט לא נמצא');
  const post = data as MarketingPostRow;

  const isReel = post.content_type === 'reel';
  const videoUrl = isReel ? await ensureVideoUploaded(postId) : null;
  if (isReel && !videoUrl) throw new Error('לרילס הזה אין סרטון');

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

  if (isReel && videoUrl) {
    if (wantsFacebook) {
      await attempt('פייסבוק - רילס', Boolean(post.external_post_id), async () => {
        const { postId: id } = await publishVideoToFacebookPage({ videoUrl, description: facebookCaption(caption, post.id, post.cta_path) });
        return { external_post_id: id };
      });
    }
    if (wantsInstagram && !post.ig_post_id) {
      // שלב 1: יצירת מיכל. שלב 2 (בסבב הבא או מיד אם כבר מוכן): פרסום
      try {
        let containerId = post.ig_container_id;
        if (!containerId) {
          containerId = (await createInstagramReelContainer({ videoUrl, caption })).containerId;
          updates.ig_container_id = containerId;
        }
        const published = await publishInstagramReelIfReady(containerId);
        if (published) {
          Object.assign(updates, { ig_post_id: published.postId, ig_permalink: published.permalink, ig_published_at: new Date().toISOString() });
          results.push({ channel: 'אינסטגרם - רילס', ok: true });
        } else {
          results.push({ channel: 'אינסטגרם - רילס', ok: true, pending: true });
        }
      } catch (e) {
        updates.ig_container_id = null; // מיכל שנכשל לא נשמר - בניסיון הבא נוצר חדש
        results.push({ channel: 'אינסטגרם - רילס', ok: false, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
      }
    } else if (wantsInstagram) {
      results.push({ channel: 'אינסטגרם - רילס', ok: true, skipped: true });
    }
  }

  if (!isStoryPost && !isReel) {
    if (wantsFacebook) {
      await attempt('פייסבוק - פיד', Boolean(post.external_post_id), async () => {
        const { postId: id } = await publishPhotoToFacebookPage({ images: feedImages, caption: facebookCaption(caption, post.id, post.cta_path) });
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

  const anyPending = results.some((r) => r.pending);
  if (allDone && everyChannelDone && !anyPending) {
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
