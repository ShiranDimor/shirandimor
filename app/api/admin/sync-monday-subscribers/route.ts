import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncMondaySubscribersToSite } from '@/lib/mondaySubscriberSync';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - הרצה ידנית של סנכרון מנויי Monday.com אל חשבונות האתר (ראו lib/mondaySubscriberSync)
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const result = await syncMondaySubscribersToSite();
  return NextResponse.json(result);
}
