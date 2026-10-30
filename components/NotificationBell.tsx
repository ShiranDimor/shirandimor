'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PushNotificationButton from '@/components/PushNotificationButton';

type Item = {
  id: string;
  kind: 'trade' | 'lesson' | 'live' | 'announcement';
  title: string;
  body: string;
  url: string | null;
  created_at: string;
};

const LAST_SEEN_KEY = 'notif_last_seen';
const KIND_ICON: Record<Item['kind'], string> = { trade: '📈', lesson: '📚', live: '🎥', announcement: '📣' };

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}

// פעמון התראות גלובלי - מופיע בכל עמוד (כמו כפתור הוואטסאפ/דור הצף), מציג היסטוריה של
// ההתראות האחרונות שנשלחו (עסקאות/שיעורים/לייבים/מודעות) ומכיל גם את כפתור הפעלת/כיבוי
// התראות הפוש עצמו - כך שהוא נגיש מכל מקום באתר, לא רק מהתיק. ה"חדש" מחושב מול זמן הביקור
// האחרון בפעמון שנשמר בדפדפן (בלי טבלת read-state בשרת, גם כדי שזה יעבוד ללידים אנונימיים)
export default function NotificationBell() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/notifications/feed', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: Item[] = data.items || [];
      setItems(list);

      let lastSeen = 0;
      try {
        lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
      } catch (e) {
        // localStorage חסום (למשל גלישה פרטית) - מתייחסים כאילו הכל חדש
      }
      setUnread(list.filter((it) => new Date(it.created_at).getTime() > lastSeen).length);
    } catch (e) {
      console.error('שגיאה בטעינת פעמון ההתראות', e);
    } finally {
      setReady(true);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setUnread(0);
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      } catch (e) {
        // ignore
      }
    }
  }

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/dor-english') || pathname?.startsWith('/business')) return null;
  if (!ready) return null;

  return (
    <>
      <button type="button" className="notif-bell-btn" onClick={handleToggle} aria-label="התראות">
        🔔
        {unread > 0 && <span className="notif-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-bell-backdrop" onClick={() => setOpen(false)}>
          <div className="notif-bell-panel" onClick={(e) => e.stopPropagation()}>
            <div className="notif-bell-panel-header">
              <span>🔔 התראות</span>
              <button type="button" className="notif-bell-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="notif-bell-list">
              {items.length === 0 && <p className="notif-bell-empty">אין עדיין התראות</p>}
              {items.map((it) => (
                <a key={it.id} href={it.url || '/'} className="notif-bell-item" onClick={() => setOpen(false)}>
                  <span className="notif-bell-icon">{KIND_ICON[it.kind] || '🔔'}</span>
                  <span>
                    <span className="notif-bell-item-title">{it.title}</span>
                    <span className="notif-bell-item-body">{it.body}</span>
                    <span className="notif-bell-item-time">{timeAgo(it.created_at)}</span>
                  </span>
                </a>
              ))}
            </div>
            <div className="notif-bell-settings">
              <PushNotificationButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
