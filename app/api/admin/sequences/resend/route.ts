import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { resendStep } from '@/lib/sequenceEngine';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

const ERROR_LABELS: Record<string, string> = {
  not_found: 'לא נמצאה רשומה כזו',
  invalid_step: 'הצעד הזה לא קיים ברצף',
  no_valid_device: 'אין מכשיר תקף לשלוח אליו/ה - ההתראות נשברו',
};

// POST - שליחה חוזרת ידנית של צעד ספציפי (ברירת מחדל: הצעד האחרון שנשלח) - לשימוש מעמוד הניהול
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const progressId = typeof body?.progressId === 'string' ? body.progressId : '';
  const stepIndex = typeof body?.stepIndex === 'number' ? body.stepIndex : null;
  if (!progressId || !stepIndex) return NextResponse.json({ error: 'חסר progressId או stepIndex' }, { status: 400 });

  const result = await resendStep(progressId, stepIndex);
  if (!result.ok) {
    return NextResponse.json({ error: ERROR_LABELS[result.error || ''] || result.error || 'שגיאה לא ידועה' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
