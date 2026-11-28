import { supabaseAdmin } from '@/lib/instantLogin';
import { verifyOptout } from '@/lib/deadlineCampaign';
import { normalizeEmail } from '@/lib/webPush';

// הסרה מרשימת התפוצה של מיילים שיווקיים (לינק חתום בתחתית כל מייל)
async function handle(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get('e'));
  const token = url.searchParams.get('t') || '';
  const ok = verifyOptout(email, token);
  if (ok) await supabaseAdmin.from('email_optouts').upsert({ email }, { onConflict: 'email' });
  const msg = ok ? 'הוסרת מרשימת התפוצה. לא יישלחו אליך עוד מיילים כאלה.' : 'הקישור לא תקין.';
  return new Response(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial;background:#121013;color:#F2EFF1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p style="font-size:18px">${msg}</p></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
export const GET = handle;
export const POST = handle;
