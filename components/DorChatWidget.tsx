'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const ANON_ID_KEY = 'dor_anon_id';
const CALLOUT_SEEN_KEY = 'dor_callout_seen';

function getAnonId() {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

// ווידג'ט הצ'אט הציבורי עם דור - מופיע בכל עמוד באתר (חוץ מעמודי הניהול, שבהם כבר יש כלי בדיקה ייעודי).
// עובד גם למי שלא מחובר/ת בכלל (מזהה אנונימי שנשמר בדפדפן), וגם למי שמחובר/ת (מזהה לפי חשבון אמיתי).
export default function DorChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showCallout, setShowCallout] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !historyLoaded) loadHistory();
  }, [open, historyLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // בועת "דור פה!" ליד הכפתור - מופיעה פעם אחת לכל דפדפן (לא בכל טעינת עמוד), כדי למשוך תשומת
  // לב למי שמגיע/ה לאתר בפעם הראשונה ולא בהכרח שם/ה לב שיש בכלל צ'אט. נשארת עד שלוחצים עליה/על
  // הכפתור או על ה-X שלה - לא נעלמת לבד, כדי לא לפספס מי שלא הספיק/ה לשים לב מיד
  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    let seen = true;
    try { seen = localStorage.getItem(CALLOUT_SEEN_KEY) === '1'; } catch {}
    if (seen) return;
    const showTimer = setTimeout(() => setShowCallout(true), 1500);
    return () => clearTimeout(showTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function dismissCallout() {
    setShowCallout(false);
    try { localStorage.setItem(CALLOUT_SEEN_KEY, '1'); } catch {}
  }

  if (pathname?.startsWith('/admin')) return null;

  async function authHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/support-bot?anonId=${encodeURIComponent(getAnonId())}`, { headers });
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } catch (e) {
      // אין צורך להציג שגיאה - פשוט נשארים עם היסטוריה ריקה
    }
    setLoadingHistory(false);
    setHistoryLoaded(true);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const headers = await authHeader();
      const res = await fetch('/api/support-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ message: text, anonId: getAnonId() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'שגיאה בבוט');
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (e) {
      setError('שגיאת רשת');
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {!open && showCallout && (
        <button className="dor-callout" onClick={() => { setOpen(true); dismissCallout(); }}>
          <span className="dor-callout-close" onClick={(e) => { e.stopPropagation(); dismissCallout(); }} role="button" aria-label="סגירה">✕</span>
          יש שאלה? 💬 תשובה פשוטה, בלי רעש
        </button>
      )}

      {!open && (
        <button className={`dor-float-btn${showCallout ? ' dor-float-btn-pulse' : ''}`} onClick={() => { setOpen(true); dismissCallout(); }} aria-label="פתחו צ'אט עם דור">
          💬
        </button>
      )}

      {open && (
        <div className="dor-chat-panel">
          <div className="dor-chat-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>דור</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>העוזרת הדיגיטלית של שירן</div>
            </div>
            <button className="dor-chat-close" onClick={() => setOpen(false)} aria-label="סגירה">✕</button>
          </div>

          <div className="dor-chat-body">
            {loadingHistory && (
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
                טוענים...
              </p>
            )}
            {!loadingHistory && messages.length === 0 && (
              <>
                <div
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                    background: 'var(--teal)',
                    color: '#08131a',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    fontSize: '14px',
                    lineHeight: 1.6,
                  }}
                >
                  היי, אני דור, העוזרת הדיגיטלית של שירן 😊
                  <br />
                  לפני שממשיכים - איך נכון לי לפנות אליך?
                </div>
                <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                  <button className="btn-outline" style={{ width: 'auto' }} onClick={() => sendMessage('בלשון זכר, בבקשה')} disabled={sending}>
                    בלשון זכר
                  </button>
                  <button className="btn-outline" style={{ width: 'auto' }} onClick={() => sendMessage('בלשון נקבה, בבקשה')} disabled={sending}>
                    בלשון נקבה
                  </button>
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--bg-secondary)' : 'var(--teal)',
                  color: m.role === 'user' ? 'var(--text-primary)' : '#08131a',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div style={{ alignSelf: 'flex-end', fontSize: '12px', color: 'var(--text-tertiary)' }}>דור מקלידה...</div>
            )}
            {error && <p style={{ fontSize: '12px', color: 'var(--loss)' }}>{error}</p>}
            <div ref={bottomRef} />
          </div>

          {historyLoaded && messages.length > 0 && (
            <div className="dor-chat-input-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="כתבו הודעה..."
                rows={1}
                style={{ flex: '1 1 0%', minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', resize: 'none', fontFamily: 'inherit' }}
              />
              <button className="btn-outline" style={{ width: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => sendMessage()} disabled={sending || !input.trim()}>
                שליחה
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
