'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Linkify from '@/components/Linkify';

type Conversation = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  user_type: string | null;
  lead_intent: string;
  created_at: string;
  last_message_at: string;
  messageCount: number;
  summary: string | null;
};

type TranscriptMessage = { role: 'user' | 'assistant'; content: string; created_at: string };

const USER_TYPE_LABELS: Record<string, string> = {
  admin_test: 'בדיקה פנימית (אדמין)',
  member_active: 'מנוי/ה פעיל/ה',
  updates_group: 'קבוצת עדכונים',
  lead_new: 'ליד חדש',
  unknown: 'לא ידוע',
};

const LEAD_INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'cold', label: 'קר' },
  { value: 'curious', label: 'סקרן' },
  { value: 'engaged', label: 'מעורב' },
  { value: 'warm', label: 'חם' },
  { value: 'hot', label: 'לוהט' },
  { value: 'support', label: 'תמיכה' },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SupportBotConversationsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }
    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadConversations();
  }

  async function loadConversations() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/support-bot/conversations', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations || []);
    }
    setLoading(false);
  }

  async function toggleTranscript(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLoadingTranscript(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/support-bot/conversations/${id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setTranscript(data.messages || []);
    }
    setLoadingTranscript(false);
  }

  async function setLeadIntent(id: string, leadIntent: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, lead_intent: leadIntent } : c)));
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/admin/support-bot/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ conversationId: id, leadIntent }),
    }).catch(() => {});
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
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
          <Link href="/admin/support-bot" className="nav-link">← לצ'אט הבדיקה</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>מי מתכתב עם דור</h2><span className="count">{conversations.length}</span></div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && conversations.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין שיחות</p>
      )}

      {conversations.map((c) => (
        <div key={c.id} className="admin-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => toggleTranscript(c.id)}>
            <div>
              <div className="name">{c.contact_name || 'ללא שם'}</div>
              <div className="email">{c.contact_phone || c.contact_email || 'אין פרטי קשר עדיין'}</div>
              <div className="email" style={{ marginTop: '2px' }}>
                {USER_TYPE_LABELS[c.user_type || 'unknown']} · {c.messageCount} הודעות · עדכון אחרון {formatDateTime(c.last_message_at)}
              </div>
              {c.summary && (
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {c.summary}
                </div>
              )}
            </div>
            {c.contact_phone && (
              <a
                href={`https://wa.me/${c.contact_phone.replace(/\D/g, '').replace(/^0/, '972')}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--profit)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                וואטסאפ ←
              </a>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {LEAD_INTENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLeadIntent(c.id, opt.value)}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-hairline-strong)',
                  background: c.lead_intent === opt.value ? 'var(--teal)' : 'transparent',
                  color: c.lead_intent === opt.value ? '#08131a' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: c.lead_intent === opt.value ? 700 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {openId === c.id && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: '10px', padding: '10px', maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingTranscript && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>טוענים תמלול...</p>}
              {!loadingTranscript && transcript.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    background: m.role === 'user' ? 'var(--bg-surface-raised)' : 'var(--teal)',
                    color: m.role === 'user' ? 'var(--text-primary)' : '#08131a',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  <Linkify text={m.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
