import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - מסמן שהמשתמש/ת המחובר/ת (ורק הוא/היא - אין id בגוף הבקשה בכוונה, כדי שאי אפשר
// יהיה "לאשר" בשם מישהו/י אחר/ת) קרא/ה ואישר/ה את תקנון השימוש. ר' components/TermsGate.tsx -
// זה מה שמסיר את החסימה בפעם הבאה שהעמוד נטען
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'צריך להתחבר קודם' }, { status: 401 });

  const acceptedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from('profiles').update({ terms_accepted_at: acceptedAt }).eq('id', user.id);

  if (error) {
    console.error('accept-terms: נכשל עדכון terms_accepted_at', user.id, error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, acceptedAt });
}
