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
  imageBase64: string;
  extraImageBase64?: string | null;
  caption: string;
}): Promise<{ postId: string }> {
  const { pageId, accessToken } = requireCredentials();

  // פוסט עם תמונה אחת בלבד - זורם ישירות עם caption על התמונה עצמה (מוצג ומפורסם מיד)
  if (!params.extraImageBase64) {
    const form = new FormData();
    form.append('caption', params.caption);
    form.append('access_token', accessToken);
    form.append('source', new Blob([Buffer.from(params.imageBase64, 'base64')], { type: 'image/png' }), 'post.png');

    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(`שגיאה בפרסום לפייסבוק: ${data?.error?.message || 'שגיאה לא ידועה'}`);
    return { postId: data.post_id || data.id };
  }

  // שתי תמונות - מעלים כל אחת בנפרד כ"לא מפורסמת", ואז יוצרים פוסט אחד בפיד שמצרף את שתיהן
  const [firstPhotoId, secondPhotoId] = await Promise.all([
    uploadUnpublishedPhoto({ pageId, accessToken, imageBase64: params.imageBase64, filename: 'card.png' }),
    uploadUnpublishedPhoto({ pageId, accessToken, imageBase64: params.extraImageBase64, filename: 'extra.png' }),
  ]);

  const feedRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.caption,
      attached_media: [{ media_fbid: firstPhotoId }, { media_fbid: secondPhotoId }],
      access_token: accessToken,
    }),
  });
  const feedData = await feedRes.json();
  if (!feedRes.ok) throw new Error(`שגיאה בפרסום הפוסט המשולב לפייסבוק: ${feedData?.error?.message || 'שגיאה לא ידועה'}`);

  return { postId: feedData.id as string };
}
