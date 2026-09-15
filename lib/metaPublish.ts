// פרסום בפועל לעמוד הפייסבוק דרך Meta Graph API. דורש שני משתני סביבה שרק שירן יכולה
// להנפיק (ראו הוראות שנמסרו לה): META_PAGE_ID ו-META_PAGE_ACCESS_TOKEN (טוקן ארוך-טווח).
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
  if (images.length === 0) throw new Error('אין תמונות לפרסום');

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
