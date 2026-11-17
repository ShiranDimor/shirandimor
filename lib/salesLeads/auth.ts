import { supabaseAdmin } from '@/lib/instantLogin';

// אותה בדיקת הרשאת אדמין שחוזרת בכל ה-API routes הקיימים של האדמין באתר (למשל trial-signups) -
// כאן משותפת כי יש הרבה routes תחת sales-leads
export async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}
