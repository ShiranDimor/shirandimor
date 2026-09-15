import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

const STATUSES = ['draft', 'approved', 'scheduled', 'published', 'archived'];
const EDITABLE_FIELDS = ['hook', 'caption', 'hashtags', 'video_script', 'visual_idea'] as const;

// PATCH - עריכת תוכן הטיוטה, ו/או שינוי סטטוס (למשל אישור/תזמון/סימון כפורסם ידנית)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    if (typeof body[field] === 'string') updates[field] = body[field];
  }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === 'published') updates.published_at = new Date().toISOString();
  }

  if (body.scheduledAt !== undefined) {
    updates.scheduled_at = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;
  }

  // extraImageBase64 - צילום מסך שמעלים ידנית (למשל מקבוצת הוואטסאפ) שמצטרף לכרטיס
  // האוטומטי כשמפרסמים. null מוחק אותו (הסרה/החלפה).
  if (body.extraImageBase64 !== undefined) {
    updates.extra_image_base64 = typeof body.extraImageBase64 === 'string' ? body.extraImageBase64 : null;
  }

  // imageBase64 - כרטיס גרפי ראשי שמעלים ידנית. נחוץ בעיקר לפוסטים מסוג "manual"
  // (בריף חופשי), שאין להם יצירת כרטיס אוטומטית כמו לפוסטי עסקה/ווטסאפ.
  if (body.imageBase64 !== undefined) {
    updates.image_base64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('marketing_posts').update(updates).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ post: data });
}

// DELETE - מחיקת טיוטה (למשל אחד מכמה וריאנטים שלא נבחר)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { error } = await supabaseAdmin.from('marketing_posts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
