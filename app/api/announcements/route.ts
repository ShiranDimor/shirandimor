import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// GET - כל ההודעות המפורסמות בלוח המודעות, מהחדש לישן - ציבורי לגמרי (גם בלי להתחבר),
// כדי שגם מי שהגיע מהתראת פוש בלי חשבון יוכל לראות את התוכן
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .select('id, title, content, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ announcements: data });
}
