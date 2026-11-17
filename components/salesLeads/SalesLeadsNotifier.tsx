'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { fetchFollowupsSummary, FollowupsSummary } from '@/lib/salesLeads/apiClient';
import { formatPhoneIL, telHref, whatsappHref } from '@/lib/salesLeads/phone';

const POLL_MS = 45000;

// Badge קבוע בכל אזור האדמין (Follow-ups שהגיע זמנם/של היום) + Notification בדפדפן כשמגיע
// זמנו של Follow-up, כל עוד האתר פתוח בטאב כלשהו. חשוב: זו לא תשתית Push אמיתית (שהייתה
// דורשת Service Worker + מפתחות VAPID שלא קיימים היום בפרויקט) - ההתראה תלויה בטאב פתוח.
export default function SalesLeadsNotifier() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [summary, setSummary] = useState<FollowupsSummary | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [toastLead, setToastLead] = useState<FollowupsSummary['dueNow'][number] | null>(null);
  const notifiedIds = useRef<Set<string>>(new Set());
  const dismissedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'admin') setIsAdmin(true);
    })();

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    } else {
      setNotifPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    async function poll() {
      try {
        const data = await fetchFollowupsSummary();
        if (cancelled) return;
        setSummary(data);

        const freshlyDue = data.dueNow.filter((d) => !notifiedIds.current.has(d.id));
        for (const lead of freshlyDue) {
          notifiedIds.current.add(lead.id);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(`Follow-up: ${lead.name}`, {
              body: `${formatPhoneIL(lead.phone_normalized)}${lead.next_followup_note ? ' · ' + lead.next_followup_note : ''}`,
              tag: `sales-lead-followup-${lead.id}`,
            });
            n.onclick = () => {
              window.focus();
              window.location.href = `/admin/sales-leads?open=${lead.id}`;
            };
          }
        }

        const nextToast = data.dueNow.find((d) => !dismissedIds.current.has(d.id));
        setToastLead(nextToast || null);
      } catch {
        // שקטה - זו רק תזכורת, לא קריטית מספיק כדי להציג שגיאה למשתמשת
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const attentionCount = (summary?.overdueCount || 0) + (summary?.todayCount || 0);

  function requestNotifPermission(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(setNotifPermission);
    }
  }

  return (
    <>
      {toastLead && (
        <div className="sl-toast">
          <div className="sl-toast-title">⏰ Follow-up: {toastLead.name}</div>
          <div className="sl-toast-body">
            {formatPhoneIL(toastLead.phone_normalized)}
            {toastLead.next_followup_note ? ` · ${toastLead.next_followup_note}` : ''}
          </div>
          <div className="sl-toast-actions">
            <a className="sl-act-call" href={telHref(toastLead.phone_normalized)}>📞 התקשרי</a>
            <a className="sl-act-whatsapp" href={whatsappHref(toastLead.phone_normalized)} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
            <Link href={`/admin/sales-leads?open=${toastLead.id}`}>פתיחת כרטיס</Link>
            <button
              onClick={() => {
                dismissedIds.current.add(toastLead.id);
                setToastLead(null);
              }}
            >
              סגירה
            </button>
          </div>
        </div>
      )}

      {attentionCount > 0 && (
        <Link href="/admin/sales-leads" className="sl-badge-float">
          <span>📋</span>
          <span className="sl-badge-n">{attentionCount}</span>
          {notifPermission === 'default' && (
            <span onClick={requestNotifPermission} title="הפעלת התראות דפדפן" style={{ marginRight: '4px' }}>
              🔔
            </span>
          )}
        </Link>
      )}
    </>
  );
}
