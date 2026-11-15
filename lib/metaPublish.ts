// פרסום בפועל לעמוד הפייסבוק דרך Meta Graph API. דורש שני משתני סביבה שרק שירן יכולה
// להנפיק (ראו הוראות שנמסרו לה): META_PAGE_ID ו-META_PAGE_ACCESS_TOKEN (טוקן ארוך-טווח).
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/instantLogin';
const GRAPH_API_VERSION = 'v21.0';

function requireCredentials(): { pageId: string; accessToken: string } {
  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    throw new Error('חיבור הפייסבוק עדיין לא מוגדר (META_PAGE_ID / META_PAGE_ACCESS_TOKEN חסרים)');
  }
  return { pageId, accessToken };
}

// טוקן שנוצר דרך "משתמש מערכת" הוא טוקן כללי, לא טוקן עמוד - ופרסום "כעמוד עצמו"
// (published=false + attached_media) דורש ספציפית טוקן עמוד. ממירים כאן תמיד לטוקן
// העמוד האמיתי (אם META_PAGE_ACCESS_TOKEN כבר כזה, הקריאה פשוט מחזירה אותו בחזרה).
async function resolvePageAccessToken(pageId: string, accessToken: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=access_token&access_token=${encodeURIComponent(accessToken)}`);
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`שגיאה בקבלת טוקן גישה לעמוד: ${data?.error?.message || 'לא התקבל טוקן עמוד'}`);
  }
  return data.access_token as string;
}

// מעלה תמונה בודדת כ"לא מפורסמת" (published=false) - חוזר עם photo id שמשמש אח"כ לצירוף
// לפוסט אחד עם כמה תמונות (attached_media), במקום שתי פוסטים נפרדים
async function uploadUnpublishedPhoto(params: { pageId: string; accessToken: string; imageBase64: string; filename: string }): Promise<string> {
  const form = new FormData();
  form.append('published', 'false');
  form.append('access_token', params.accessToken);
  form.append('source', new Blob([Buffer.from(params.imageBase64, 'base64')], { type: 'image/png' }), params.filename);

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${params.pageId}/photos`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(`שגיאה בהעלאת תמונה לפייסבוק: ${data?.error?.message || 'שגיאה לא ידועה'}`);
  return data.id as string;
}

export async function publishPhotoToFacebookPage(params: {
  images: string[];
  caption: string;
}): Promise<{ postId: string }> {
  const { pageId, accessToken: rawToken } = requireCredentials();
  const accessToken = await resolvePageAccessToken(pageId, rawToken);
  const images = params.images.filter(Boolean);

  // בלי תמונה בכלל - פוסט טקסט בלבד לפיד (לא כל פוסט חייב כרטיס גרפי)
  if (images.length === 0) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: params.caption, access_token: accessToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`שגיאה בפרסום לפייסבוק: ${data?.error?.message || 'שגיאה לא ידועה'}`);
    return { postId: data.id as string };
  }

  // פוסט עם תמונה אחת בלבד - זורם ישירות עם caption על התמונה עצמה (מוצג ומפורסם מיד)
  if (images.length === 1) {
    const form = new FormData();
    form.append('caption', params.caption);
    form.append('access_token', accessToken);
    form.append('source', new Blob([Buffer.from(images[0], 'base64')], { type: 'image/png' }), 'post.png');

    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(`שגיאה בפרסום לפייסבוק: ${data?.error?.message || 'שגיאה לא ידועה'}`);
    return { postId: data.post_id || data.id };
  }

  // כמה תמונות - מעלים כל אחת בנפרד כ"לא מפורסמת", ואז יוצרים פוסט אחד בפיד שמצרף את כולן
  const photoIds = await Promise.all(
    images.map((imageBase64, index) => uploadUnpublishedPhoto({ pageId, accessToken, imageBase64, filename: `image-${index}.png` }))
  );

  const feedRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.caption,
      attached_media: photoIds.map((id) => ({ media_fbid: id })),
      access_token: accessToken,
    }),
  });
  const feedData = await feedRes.json();
  if (!feedRes.ok) throw new Error(`שגיאה בפרסום הפוסט המשולב לפייסבוק: ${feedData?.error?.message || 'שגיאה לא ידועה'}`);

  return { postId: feedData.id as string };
}

// פרסום כסטורי לעמוד - מנגנון שונה לגמרי מפרסום לפיד: קודם מעלים את התמונה כ"לא מפורסמת"
// (בדיוק כמו בפוסט עם כמה תמונות), ואז מצרפים אותה לסטורי דרך endpoint ייעודי (photo_stories).
// לסטוריז אין caption/קישור אמיתי - הטקסט המלא (כולל קריאה לפעולה) חייב להיות מודפס בתוך התמונה עצמה.
export async function publishPhotoStoryToFacebookPage(params: { storyImageBase64: string }): Promise<{ postId: string }> {
  const { pageId, accessToken: rawToken } = requireCredentials();
  const accessToken = await resolvePageAccessToken(pageId, rawToken);

  const photoId = await uploadUnpublishedPhoto({ pageId, accessToken, imageBase64: params.storyImageBase64, filename: 'story.png' });

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/photo_stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_id: photoId, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`שגיאה בפרסום הסטורי לפייסבוק: ${data?.error?.message || 'שגיאה לא ידועה'}`);

  return { postId: data.post_id || data.id };
}

// ---------------------------------------------------------------------------------------------
// אינסטגרם (Instagram Graph API, דרך אותו טוקן עמוד). דורש חשבון אינסטגרם מקצועי (עסקי/יוצר)
// שמקושר לעמוד הפייסבוק, וטוקן עם ההרשאות instagram_basic + instagram_content_publish.
// מזהה חשבון האינסטגרם נלקח מ-META_IG_USER_ID אם הוגדר, אחרת נשלף מהעמוד עצמו.
//
// בניגוד לפייסבוק, אינסטגרם לא מקבל העלאת קובץ ישירה - רק כתובת URL ציבורית לתמונת JPEG.
// לכן כל תמונה מומרת ל-JPEG ומועלית קודם לדלי הציבורי marketing-media ב-Supabase.
// ---------------------------------------------------------------------------------------------

const MARKETING_MEDIA_BUCKET = 'marketing-media';
const IG_CAROUSEL_MAX = 10;

async function getInstagramContext(): Promise<{ igUserId: string; accessToken: string }> {
  const { pageId, accessToken: rawToken } = requireCredentials();
  const accessToken = await resolvePageAccessToken(pageId, rawToken);

  if (process.env.META_IG_USER_ID) return { igUserId: process.env.META_IG_USER_ID, accessToken };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`);
  const data = await res.json();
  const igUserId = data?.instagram_business_account?.id;
  if (!res.ok || !igUserId) {
    throw new Error(
      `לא נמצא חשבון אינסטגרם מקצועי שמקושר לעמוד הפייסבוק${data?.error?.message ? ` (${data.error.message})` : ''}. ` +
        'צריך לקשר את חשבון האינסטגרם לעמוד, ולוודא שלטוקן יש הרשאות instagram_basic ו-instagram_content_publish.'
    );
  }
  return { igUserId, accessToken };
}

// ממיר PNG (base64) ל-JPEG ומעלה לדלי הציבורי - מחזיר כתובת שאינסטגרם יכול להוריד ממנה
async function uploadPublicJpeg(imageBase64: string, name: string): Promise<string> {
  const jpeg = await sharp(Buffer.from(imageBase64, 'base64')).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}.jpg`;
  const { error } = await supabaseAdmin.storage.from(MARKETING_MEDIA_BUCKET).upload(objectPath, jpeg, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`שגיאה בהעלאת התמונה לאחסון: ${error.message}`);
  return supabaseAdmin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function igPost(path: string, body: Record<string, unknown>, accessToken: string): Promise<{ id: string }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`שגיאה מאינסטגרם: ${data?.error?.error_user_msg || data?.error?.message || 'שגיאה לא ידועה'}`);
  return { id: data.id as string };
}

// אינסטגרם מעבד כל "מיכל מדיה" ברקע - מפרסמים רק אחרי שהסטטוס FINISHED
async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
    const data = await res.json();
    if (data?.status_code === 'FINISHED') return;
    if (data?.status_code === 'ERROR' || data?.status_code === 'EXPIRED') {
      throw new Error(`אינסטגרם לא הצליח לעבד את המדיה: ${data?.status || data.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('אינסטגרם עדיין מעבד את המדיה - כדאי לנסות שוב בעוד כמה דקות');
}

async function publishContainer(igUserId: string, containerId: string, accessToken: string): Promise<{ postId: string; permalink: string | null }> {
  await waitForContainer(containerId, accessToken);
  const { id: mediaId } = await igPost(`${igUserId}/media_publish`, { creation_id: containerId }, accessToken);

  let permalink: string | null = null;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
    const data = await res.json();
    permalink = typeof data?.permalink === 'string' ? data.permalink : null;
  } catch {
    // הקישור הוא נוחות בלבד - הפוסט כבר פורסם
  }
  return { postId: mediaId, permalink };
}

// פוסט פיד לאינסטגרם: תמונה אחת = פוסט רגיל, כמה תמונות = קרוסלה (עד 10). אינסטגרם חייב תמונה.
export async function publishToInstagram(params: { images: string[]; caption: string }): Promise<{ postId: string; permalink: string | null }> {
  const images = params.images.filter(Boolean).slice(0, IG_CAROUSEL_MAX);
  if (images.length === 0) throw new Error('אינסטגרם לא מאפשר פוסט בלי תמונה');

  const { igUserId, accessToken } = await getInstagramContext();
  const urls = await Promise.all(images.map((img, i) => uploadPublicJpeg(img, `post-${i + 1}`)));

  if (urls.length === 1) {
    const { id } = await igPost(`${igUserId}/media`, { image_url: urls[0], caption: params.caption }, accessToken);
    return publishContainer(igUserId, id, accessToken);
  }

  const children: string[] = [];
  for (const url of urls) {
    const { id } = await igPost(`${igUserId}/media`, { image_url: url, is_carousel_item: true }, accessToken);
    children.push(id);
  }
  for (const child of children) await waitForContainer(child, accessToken);

  const { id } = await igPost(`${igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: params.caption }, accessToken);
  return publishContainer(igUserId, id, accessToken);
}

// סטורי לאינסטגרם - כמו בפייסבוק, אין כיתוב: כל הטקסט צריך להיות בתוך התמונה עצמה
export async function publishStoryToInstagram(params: { storyImageBase64: string }): Promise<{ postId: string; permalink: string | null }> {
  const { igUserId, accessToken } = await getInstagramContext();
  const url = await uploadPublicJpeg(params.storyImageBase64, 'story');
  const { id } = await igPost(`${igUserId}/media`, { image_url: url, media_type: 'STORIES' }, accessToken);
  return publishContainer(igUserId, id, accessToken);
}

// ---------------------------------------------------------------------------------------------
// ריילס (וידאו). הסרטון כבר יושב בדלי הציבורי marketing-media (ר' marketingPublisher -
// ensureVideoUploaded), ופייסבוק ואינסטגרם מורידים אותו משם לפי כתובת.
// אינסטגרם מעבד וידאו לאט (לפעמים יותר מדקה), ולכן הפרסום מתחלק לשני שלבים: יצירת "מיכל" ושמירת
// המזהה שלו, ופרסום בסבב הבא כשהעיבוד הסתיים - כדי לא לחרוג מזמן הריצה של הפונקציה.
// ---------------------------------------------------------------------------------------------
export async function createInstagramReelContainer(params: { videoUrl: string; caption: string }): Promise<{ containerId: string }> {
  const { igUserId, accessToken } = await getInstagramContext();
  const { id } = await igPost(`${igUserId}/media`, { media_type: 'REELS', video_url: params.videoUrl, caption: params.caption, share_to_feed: true }, accessToken);
  return { containerId: id };
}

// מחזיר null אם הסרטון עדיין בעיבוד; זורק שגיאה אם העיבוד נכשל
export async function publishInstagramReelIfReady(containerId: string): Promise<{ postId: string; permalink: string | null } | null> {
  const { igUserId, accessToken } = await getInstagramContext();
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
  const data = await res.json();
  if (data?.status_code === 'ERROR' || data?.status_code === 'EXPIRED') {
    throw new Error(`אינסטגרם לא הצליח לעבד את הסרטון: ${data?.status || data.status_code}`);
  }
  if (data?.status_code !== 'FINISHED') return null;
  return publishContainer(igUserId, containerId, accessToken);
}

export async function publishVideoToFacebookPage(params: { videoUrl: string; description: string }): Promise<{ postId: string }> {
  const { pageId, accessToken: rawToken } = requireCredentials();
  const accessToken = await resolvePageAccessToken(pageId, rawToken);
  const res = await fetch(`https://graph-video.facebook.com/${GRAPH_API_VERSION}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url: params.videoUrl, description: params.description, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`שגיאה מפייסבוק בהעלאת הסרטון: ${data?.error?.error_user_msg || data?.error?.message || 'שגיאה לא ידועה'}`);
  return { postId: data.id as string };
}
