import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { undoLastRevision } from '@/lib/marketingRevise';

export const maxDuration = 60;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - חזרה לגרסה שלפני התיקון האחרון
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  try {
    await undoLastRevision(params.id);
    const { data: post } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', params.id).single();
    return NextResponse.json({ post });
  } catch (e) {
    console.error('שגיאה בחזרה לגרסה קודמת', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בשחזור' }, { status: 500 });
  }
}
