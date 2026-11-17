import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToEveryone } from '@/lib/webPush';

// לוגיקת השליחה בפועל של התראת פוש על הודעת לוח מודעות - משותפת בין שליחה ידנית מיידית
// (app/api/admin/announcements/[id]/notify) לבין שליחה מתוזמנת (app/api/cron/send-scheduled-announcements),
// כדי ששתי הדרכים יתנהגו בדיוק אותו דבר (אותו payload, אותו רישום ל-notification_sent_at)
export async function sendAnnouncementNotification(announcementId: string) {
  const { data: announcement, error } = await supabaseAdmin.from('announcements').select('*').eq('id', announcementId).maybeSingle();
  if (error || !announcement) return { error: 'ההודעה לא נמצאה' as const };

  const payload = {
    title: `📌 ${announcement.title}`,
    body: announcement.content.length > 120 ? `${announcement.content.slice(0, 117)}...` : announcement.content,
    url: announcement.published ? `/announcements#ann-${announcementId}` : '/admin/announcements',
  };

  const result = await sendPushToEveryone(payload, 'announcement', announcementId);

  const { data: updated } = await supabaseAdmin
    .from('announcements')
    .update({ notification_sent_at: new Date().toISOString(), scheduled_notify_at: null })
    .eq('id', announcementId)
    .select('*')
    .single();

  return { announcement: updated || announcement, result };
}
