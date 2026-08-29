'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function AdminSupportBotPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setChecking(false);
      return;
    }
    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);

    if (profile?.role === 'admin') {
      loadHistory();
    }
  }

  // טוען את היסטוריית השיחה השמורה - כדי שרענון דף או חזרה מאוחר יותר לא יתחילו מהתחלה
  async function loadHistory() {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/support-bot', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } catch (e) {
      // אין צורך להציג שגיאה - פשוט נשארים עם היסטוריה ריקה
    }
    setLoadingHistory(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/support-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ message: text }),
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

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  }

  if (!userEmail) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <a href="/" className="nav-link">בית</a>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a href="/" className="nav-link">בית</a>
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>אין הרשאת ניהול לחשבון המחובר ({userEmail})</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>בוט תמיכה - בדיקה פנימית</h2></div>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
        כלי לדיוק תשובות הבוט - כתבי שאלות כמו שמנוי היה שואל, ותקני אותו כשמשהו לא נכון.
      </p>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px',
        maxHeight: '55vh', overflowY: 'auto', padding: '4px',
      }}>
        {loadingHistory && (
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
            טוענים היסטוריה...
          </p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
            עדיין אין הודעות. תתחילי לכתוב למטה.
          </p>
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
          <div style={{ alignSelf: 'flex-end', fontSize: '12px', color: 'var(--text-tertiary)' }}>הבוט מקליד...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p style={{ fontSize: '12px', color: 'var(--loss)', marginBottom: '10px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="כתבי שאלה כמו שמנוי היה שואל..."
          rows={2}
          style={{ flex: '1 1 0%', minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button className="btn-outline" style={{ width: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={sendMessage} disabled={sending || !input.trim()}>
          שליחה
        </button>
      </div>
    </div>
  );
}
