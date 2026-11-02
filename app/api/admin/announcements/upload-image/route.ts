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

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 8 * 1024 * 1024;

// POST - מעלה תמונה אחת לבאקט הציבורי announcement-images ומחזיר את הכתובת הציבורית שלה,
// כדי לצרף אותה להודעה בלוח המודעות (גם כקלט לניסוח ה-AI וגם להצגה בפועל בהודעה)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'חסר קובץ תמונה' }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך - רק JPEG/PNG/WEBP/GIF' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'התמונה גדולה מדי (מקסימום 8MB)' }, { status: 400 });
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from('announcement-images')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('שגיאה בהעלאת תמונת הודעה', uploadError);
    return NextResponse.json({ error: 'שגיאה בהעלאת התמונה' }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from('announcement-images').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
