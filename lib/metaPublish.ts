// פרסום בפועל לעמוד הפייסבוק דרך Meta Graph API. דורש שני משתני סביבה שרק שירן יכולה
// להנפיק (ראו הוראות שנמסרו לה): META_PAGE_ID ו-META_PAGE_ACCESS_TOKEN (טוקן ארוך-טווח).
const GRAPH_API_VERSION = 'v21.0';

export async function publishPhotoToFacebookPage(params: {
  imageBase64: string;
  caption: string;
}): Promise<{ postId: string }> {
  const pageId = process.env.META_PAGE_ID;
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    throw new Error('חיבור הפייסבוק עדיין לא מוגדר (META_PAGE_ID / META_PAGE_ACCESS_TOKEN חסרים)');
  }

  const imageBuffer = Buffer.from(params.imageBase64, 'base64');
  const form = new FormData();
  form.append('caption', params.caption);
  form.append('access_token', accessToken);
  form.append('source', new Blob([imageBuffer], { type: 'image/png' }), 'post.png');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/photos`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || 'שגיאה לא ידועה מפייסבוק';
    throw new Error(`שגיאה בפרסום לפייסבוק: ${message}`);
  }

  // תגובת ה-API מחזירה post_id (המזהה המלא של הפוסט בפיד) - אם לא קיים (למשל אם published
  // הוגדר false), נופלים חזרה למזהה התמונה עצמה
  const postId: string = data.post_id || data.id;
  return { postId };
}
