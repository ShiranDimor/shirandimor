'use client';

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type CrmStage = 'lead_new' | 'updates_group' | 'subscriber' | 'churned';

type CrmContact = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  stage: CrmStage;
  status_label: string | null;
  source: string | null;
  follow_up_at: string | null;
  monthly_cost_paid: number | null;
  joined_at: string | null;
  profile_id: string | null;
  tags: string[];
  lead_intent: string | null;
  lead_intent_note: string | null;
  lead_intent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type CrmNote = { id: string; body: string; author: string | null; created_at: string };
type DuplicateGroup = { key: string; contacts: CrmContact[] };

const STAGE_LABEL: Record<CrmStage, string> = {
  lead_new: 'ליד חדש',
  updates_group: 'קבוצת עדכונים',
  subscriber: 'מנוי',
  churned: 'נטש',
};

const STAGE_COLOR: Record<CrmStage, string> = {
  lead_new: 'var(--text-tertiary)',
  updates_group: 'var(--lavender)',
  subscriber: 'var(--profit)',
  churned: 'var(--loss)',
};

const INTENT_LABEL: Record<string, string> = {
  hot: '🔥 חם',
  warm: '🌤️ פושר',
  engaged: '👀 מעורב',
  curious: '🤔 סקרן',
  cold: '❄️ קר',
  support: '🛟 תמיכה',
};

const INTENT_COLOR: Record<string, string> = {
  hot: 'var(--loss)',
  warm: 'var(--orange)',
  engaged: 'var(--lavender)',
  curious: 'var(--text-secondary)',
  cold: 'var(--text-tertiary)',
  support: 'var(--teal)',
};

const HOT_INTENTS = ['hot', 'warm'];

const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-hairline-strong)',
  borderRadius: '8px',
  padding: '11px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
};

function isOverdue(followUpAt: string | null) {
  if (!followUpAt) return false;
  return followUpAt <= new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL');
}

export default function AdminCrmPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all' | 'followup'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [hotOnly, setHotOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const [editForm, setEditForm] = useState<Partial<CrmContact>>({});
  const [tagsInput, setTagsInput] = useState('');

  const [showNewForm, setShowNewForm] = useState(false);
  const [newContact, setNewContact] = useState({ fullName: '', phone: '', email: '', stage: 'lead_new' as CrmStage });
  const [creating, setCreating] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

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
    if (profile?.role === 'admin') loadContacts();
  }

  async function loadContacts() {
    setLoadingContacts(true);
    const { data } = await supabase
      .from('crm_contacts')
      .select('*')
      .order('follow_up_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false });
    if (data) setContacts(data as CrmContact[]);
    setLoadingContacts(false);
  }

  async function loadNotes(contactId: string) {
    setLoadingNotes(true);
    const { data } = await supabase.from('crm_notes').select('*').eq('contact_id', contactId).order('created_at', { ascending: false });
    setNotes((data as CrmNote[]) || []);
    setLoadingNotes(false);
  }

  function selectContact(c: CrmContact) {
    setSelectedId(c.id);
    setEditForm({
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      stage: c.stage,
      status_label: c.status_label,
      follow_up_at: c.follow_up_at,
      monthly_cost_paid: c.monthly_cost_paid,
    });
    setTagsInput((c.tags || []).join(', '));
    setNewNote('');
    loadNotes(c.id);
  }

  function closeDetail() {
    setSelectedId(null);
    setNotes([]);
  }

  async function callCrmApi(path: string, body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'שגיאה');
    return data;
  }

  async function saveContact() {
    if (!selectedId) return;
    setSavingContact(true);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      await callCrmApi('/api/admin/crm/update', {
        contactId: selectedId,
        fullName: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email,
        stage: editForm.stage,
        statusLabel: editForm.status_label,
        followUpAt: editForm.follow_up_at,
        monthlyCost: editForm.monthly_cost_paid,
        tags,
      });
      loadContacts();
      loadNotes(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה בשמירה');
    }
    setSavingContact(false);
  }

  async function addNote() {
    if (!selectedId || !newNote.trim()) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('crm_notes').insert({ contact_id: selectedId, body: newNote.trim(), author: user?.email || 'admin' });
    setSavingNote(false);
    if (!error) {
      setNewNote('');
      loadNotes(selectedId);
    }
  }

  async function markChurned() {
    if (!selectedId) return;
    if (!window.confirm('לסמן את איש הקשר כ"נטש"?')) return;
    try {
      await callCrmApi('/api/admin/crm/update', { contactId: selectedId, stage: 'churned' });
      setEditForm((f) => ({ ...f, stage: 'churned' }));
      loadContacts();
      loadNotes(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  async function deleteContact() {
    if (!selectedId) return;
    if (!window.confirm('למחוק לצמיתות את איש הקשר? כל ההערות שלו יימחקו גם הן.')) return;
    await supabase.from('crm_contacts').delete().eq('id', selectedId);
    closeDetail();
    loadContacts();
  }

  async function promoteToSubscriber() {
    if (!selectedId) return;
    if (!editForm.email) { alert('חסר מייל לאיש הקשר - לא ניתן ליצור חשבון'); return; }
    if (!window.confirm('להפוך למנוי פעיל? ייווצר/יאושר חשבון באתר וישלח מייל כניסה.')) return;
    setPromoting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/crm/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ contactId: selectedId }),
    });
    const data = await res.json();
    setPromoting(false);
    if (!res.ok) {
      alert('שגיאה: ' + (data.error || 'לא הצלחנו לקדם למנוי'));
      return;
    }
    setEditForm((f) => ({ ...f, stage: 'subscriber' }));
    loadContacts();
  }

  async function createContact() {
    if (!newContact.fullName || (!newContact.phone && !newContact.email)) {
      alert('צריך שם, וטלפון או מייל');
      return;
    }
    setCreating(true);
    try {
      await callCrmApi('/api/admin/crm/create', newContact);
      setNewContact({ fullName: '', phone: '', email: '', stage: 'lead_new' });
      setShowNewForm(false);
      loadContacts();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה ביצירה');
    }
    setCreating(false);
  }

  function exportCsv() {
    const headers = ['שם', 'טלפון', 'מייל', 'שלב', 'סטטוס טיפול', 'מקור', 'תאריך פולואפ', 'עלות חודשית', 'תאריך הצטרפות', 'תגיות'];
    const rows = filteredContacts.map((c) => [
      c.full_name || '',
      c.phone || '',
      c.email || '',
      STAGE_LABEL[c.stage],
      c.status_label || '',
      c.source || '',
      c.follow_up_at || '',
      c.monthly_cost_paid ?? '',
      c.joined_at ? formatDate(c.joined_at) : '',
      (c.tags || []).join('; '),
    ]);
    const csv = '﻿' + [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-אנשי-קשר-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSyncSources() {
    setSyncing(true);
    setSyncResult('');
    try {
      const data = await callCrmApi('/api/admin/crm/sync-sources', {});
      setSyncResult(`${data.liveSynced} מהרשמות ללייבים · ${data.referralsSynced} מהפניות · ${data.intentUpdated} עודכנו עם סיווג AI מ"דור"`);
      loadContacts();
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : 'שגיאה בסנכרון');
    }
    setSyncing(false);
  }

  async function loadDuplicates() {
    setLoadingDuplicates(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/crm/merge-duplicates', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    const data = await res.json();
    setDuplicateGroups(data.groups || []);
    setLoadingDuplicates(false);
  }

  async function handleMerge(keepId: string, mergeId: string) {
    setMerging(mergeId);
    try {
      await callCrmApi('/api/admin/crm/merge-duplicates', { keepId, mergeId });
      loadContacts();
      loadDuplicates();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה במיזוג');
    }
    setMerging(null);
  }

  async function moveToStage(contactId: string, stage: CrmStage) {
    try {
      await callCrmApi('/api/admin/crm/update', { contactId, stage });
      loadContacts();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה בהעברת שלב');
    }
  }

  async function handleImportFromMonday() {
    if (!window.confirm('לייבא עכשיו את כל אנשי הקשר מהלוח במאנדיי לתוך ה-CRM כאן? זו פעולה חד-פעמית - מומלץ להריץ פעם אחת בלבד, לפני שמבטלים את המנוי במאנדיי.')) return;
    setImporting(true);
    setImportResult('');
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/import-monday-crm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult('שגיאה: ' + (data.error || 'לא הצלחנו לייבא'));
      } else {
        setImportResult(`יובאו ${data.imported} אנשי קשר · ${data.accountsEnsured} חשבונות מנוי אושרו/נוצרו באתר${data.skippedNoContact ? ` · ${data.skippedNoContact} דולגו (בלי טלפון/מייל)` : ''}${data.errors?.length ? ` · ${data.errors.length} שגיאות` : ''}`);
        loadContacts();
      }
    } catch (e) {
      setImportResult('שגיאה בייבוא ממאנדיי');
    }
    setImporting(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (stageFilter === 'followup') {
      list = list.filter((c) => isOverdue(c.follow_up_at));
    } else if (stageFilter !== 'all') {
      list = list.filter((c) => c.stage === stageFilter);
    }
    if (tagFilter) {
      list = list.filter((c) => (c.tags || []).includes(tagFilter));
    }
    if (hotOnly) {
      list = list.filter((c) => c.lead_intent && HOT_INTENTS.includes(c.lead_intent));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, stageFilter, tagFilter, hotOnly, search]);

  const followupDueCount = useMemo(() => contacts.filter((c) => isOverdue(c.follow_up_at)).length, [contacts]);
  const hotCount = useMemo(() => contacts.filter((c) => c.lead_intent && HOT_INTENTS.includes(c.lead_intent)).length, [contacts]);
  const allTags = useMemo(() => Array.from(new Set(contacts.flatMap((c) => c.tags || []))).sort(), [contacts]);

  if (checking) return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;

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

  const selected = contacts.find((c) => c.id === selectedId) || null;

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label">
        <h2>CRM - לידים ומנויים</h2>
        <span className="count">{contacts.length}</span>
      </div>

      {hotCount > 0 && (
        <button
          onClick={() => setHotOnly(true)}
          style={{
            width: '100%',
            textAlign: 'right',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid var(--loss)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '10px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--loss)',
            cursor: 'pointer',
          }}
        >
          🔥 {hotCount} לידים חמים/פושרים ממתינים - לחיצה כדי לראות
        </button>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Link href="/admin/crm-dashboard" className="btn-outline" style={{ flex: 1, display: 'block', textAlign: 'center', textDecoration: 'none' }}>📊 לוח בקרה עסקי</Link>
        <button className="btn-outline" style={{ flex: 1 }} onClick={exportCsv} disabled={filteredContacts.length === 0}>⇩ ייצוא ל-CSV</button>
      </div>

      <button className="btn-outline" style={{ width: '100%', marginBottom: '10px' }} onClick={() => setShowNewForm((v) => !v)}>
        {showNewForm ? '× ביטול' : '+ איש קשר חדש'}
      </button>

      <details style={{ marginBottom: '14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>📥 ייבוא חד-פעמי ממאנדיי</summary>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '8px 0' }}>
          מעביר לכאן את כל מי שנמצא כרגע בלוח במאנדיי (לידים, קבוצת עדכונים, קבוצת סוחרים) - כדי שאף אחד לא "יאבד" במעבר. מריצים פעם אחת, ורק אז מבטלים את המנוי במאנדיי.
        </p>
        <button className="btn-outline" style={{ width: '100%' }} onClick={handleImportFromMonday} disabled={importing}>
          {importing ? 'מייבאים...' : 'ייבוא עכשיו'}
        </button>
        {importResult && <p style={{ fontSize: '12px', color: importResult.startsWith('שגיאה') ? 'var(--loss)' : 'var(--text-secondary)', marginTop: '8px' }}>{importResult}</p>}
      </details>

      <details style={{ marginBottom: '14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>🔄 סנכרון ממקורות באתר</summary>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '8px 0' }}>
          מביא לתוך ה-CRM הרשמות ללייבים והפניות (חבר מביא חבר) שלא זורמות לכאן אוטומטית, ומרענן
          עבור כל איש קשר את סיווג "דור" (חם/פושר/סקרן/קר) מתוך שיחות בוט התמיכה. מומלץ להריץ מדי כמה ימים.
        </p>
        <button className="btn-outline" style={{ width: '100%' }} onClick={handleSyncSources} disabled={syncing}>
          {syncing ? 'מסנכרנים...' : 'סנכרון עכשיו'}
        </button>
        {syncResult && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>{syncResult}</p>}
      </details>

      <details style={{ marginBottom: '14px' }} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) { setShowDuplicates(true); loadDuplicates(); } }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>🧩 כפילויות אפשריות</summary>
        {loadingDuplicates && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>בודקים...</p>}
        {!loadingDuplicates && showDuplicates && duplicateGroups.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>לא נמצאו כפילויות (לפי שם מלא זהה)</p>}
        {duplicateGroups.map((g) => (
          <div key={g.key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '10px', marginTop: '8px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>{g.contacts[0].full_name}</div>
            {g.contacts.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-tertiary)', padding: '4px 0' }}>
                <span>{c.phone || c.email || '—'} · {STAGE_LABEL[c.stage]}</span>
                <button
                  className="btn-outline"
                  style={{ padding: '3px 8px', fontSize: '11px', width: 'auto' }}
                  disabled={merging === c.id}
                  onClick={() => {
                    const other = g.contacts.find((x) => x.id !== c.id);
                    if (other) handleMerge(c.id, other.id);
                  }}
                >
                  {merging === c.id ? '...' : `שמור את זה, מזג לתוכו`}
                </button>
              </div>
            ))}
          </div>
        ))}
      </details>

      {showNewForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
          <div className="field"><label>שם</label><ClearableInput style={fieldStyle} value={newContact.fullName} onChange={(e) => setNewContact((f) => ({ ...f, fullName: e.target.value }))} onClear={() => setNewContact((f) => ({ ...f, fullName: '' }))} /></div>
          <div className="form-row">
            <div className="field"><label>טלפון</label><ClearableInput style={fieldStyle} value={newContact.phone} onChange={(e) => setNewContact((f) => ({ ...f, phone: e.target.value }))} onClear={() => setNewContact((f) => ({ ...f, phone: '' }))} /></div>
            <div className="field"><label>מייל</label><ClearableInput style={fieldStyle} value={newContact.email} onChange={(e) => setNewContact((f) => ({ ...f, email: e.target.value }))} onClear={() => setNewContact((f) => ({ ...f, email: '' }))} /></div>
          </div>
          <div className="field">
            <label>שלב</label>
            <select style={fieldStyle} value={newContact.stage} onChange={(e) => setNewContact((f) => ({ ...f, stage: e.target.value as CrmStage }))}>
              {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={createContact} disabled={creating}>{creating ? 'יוצרים...' : 'יצירת איש קשר'}</button>
        </div>
      )}

      <div className="field">
        <ClearableInput style={fieldStyle} placeholder="חיפוש לפי שם / טלפון / מייל" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} />
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['all', 'followup', 'lead_new', 'updates_group', 'subscriber', 'churned'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              border: `1px solid ${stageFilter === s ? 'var(--teal)' : 'var(--border-hairline-strong)'}`,
              background: stageFilter === s ? 'var(--teal)' : 'transparent',
              color: stageFilter === s ? 'var(--bg-void)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {s === 'all' ? 'הכל' : s === 'followup' ? `📌 פולואפ (${followupDueCount})` : STAGE_LABEL[s]}
          </button>
        ))}
        <button
          onClick={() => setHotOnly((v) => !v)}
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 600,
            border: `1px solid ${hotOnly ? 'var(--loss)' : 'var(--border-hairline-strong)'}`,
            background: hotOnly ? 'var(--loss)' : 'transparent',
            color: hotOnly ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          🔥 חם/פושר ({hotCount})
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button
          onClick={() => setViewMode('list')}
          style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, border: `1px solid ${viewMode === 'list' ? 'var(--teal)' : 'var(--border-hairline-strong)'}`, background: viewMode === 'list' ? 'var(--teal)' : 'transparent', color: viewMode === 'list' ? 'var(--bg-void)' : 'var(--text-secondary)', cursor: 'pointer' }}
        >
          ☰ רשימה
        </button>
        <button
          onClick={() => setViewMode('kanban')}
          style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, border: `1px solid ${viewMode === 'kanban' ? 'var(--teal)' : 'var(--border-hairline-strong)'}`, background: viewMode === 'kanban' ? 'var(--teal)' : 'transparent', color: viewMode === 'kanban' ? 'var(--bg-void)' : 'var(--text-secondary)', cursor: 'pointer' }}
        >
          🗂️ קנבן
        </button>
      </div>

      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>תגיות:</span>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '11.5px',
                fontWeight: 600,
                border: `1px solid ${tagFilter === t ? 'var(--lavender)' : 'var(--border-hairline-strong)'}`,
                background: tagFilter === t ? 'var(--lavender)' : 'transparent',
                color: tagFilter === t ? 'var(--bg-void)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {loadingContacts && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingContacts && filteredContacts.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין אנשי קשר מתאימים</p>}

      {viewMode === 'list' && filteredContacts.map((c) => (
        <button
          key={c.id}
          onClick={() => selectContact(c)}
          className="admin-row"
          style={{ width: '100%', textAlign: 'right', border: selectedId === c.id ? '1px solid var(--teal)' : undefined, cursor: 'pointer' }}
        >
          <div>
            <div className="name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {c.full_name || 'ללא שם'}
              {c.lead_intent && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: INTENT_COLOR[c.lead_intent] }}>{INTENT_LABEL[c.lead_intent] || c.lead_intent}</span>
              )}
            </div>
            <div className="email">{c.phone || c.email || '—'}</div>
            {c.follow_up_at && (
              <div className="email" style={{ marginTop: '2px', color: isOverdue(c.follow_up_at) ? 'var(--loss)' : undefined }}>
                פולואפ: {formatDate(c.follow_up_at)}
              </div>
            )}
            {c.tags?.length > 0 && (
              <div style={{ marginTop: '3px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {c.tags.map((t) => (
                  <span key={t} style={{ fontSize: '10px', color: 'var(--lavender)' }}>#{t}</span>
                ))}
              </div>
            )}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: STAGE_COLOR[c.stage] }}>{STAGE_LABEL[c.stage]}</span>
        </button>
      ))}

      {viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '20px' }}>
          {(Object.keys(STAGE_LABEL) as CrmStage[]).map((stage) => (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const contactId = e.dataTransfer.getData('text/contact-id');
                if (contactId) moveToStage(contactId, stage);
              }}
              style={{ flex: '0 0 220px', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '10px', minHeight: '120px' }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: STAGE_COLOR[stage], marginBottom: '8px' }}>
                {STAGE_LABEL[stage]} · {filteredContacts.filter((c) => c.stage === stage).length}
              </div>
              {filteredContacts.filter((c) => c.stage === stage).map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/contact-id', c.id)}
                  onClick={() => selectContact(c)}
                  style={{ background: 'var(--bg-void)', border: '1px solid var(--border-hairline)', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', cursor: 'grab', fontSize: '12px' }}
                >
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {c.full_name || 'ללא שם'}
                    {c.lead_intent && HOT_INTENTS.includes(c.lead_intent) && <span style={{ fontSize: '10px' }}>{INTENT_LABEL[c.lead_intent]}</span>}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '10.5px' }}>{c.phone || c.email || '—'}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="qa-popover-backdrop" onClick={closeDetail} />
          <div className="qa-popover" style={{ top: '5vh', left: '50%', transform: 'translateX(-50%)', maxWidth: '480px', width: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="qp-title">{selected.full_name || 'ללא שם'}</div>

            {selected.lead_intent && (
              <div style={{ background: 'var(--bg-void)', border: `1px solid ${INTENT_COLOR[selected.lead_intent]}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '12px', fontSize: '12px' }}>
                <div style={{ color: INTENT_COLOR[selected.lead_intent], fontWeight: 700, marginBottom: selected.lead_intent_note ? '4px' : 0 }}>
                  {INTENT_LABEL[selected.lead_intent] || selected.lead_intent} (מתוך שיחה עם "דור")
                </div>
                {selected.lead_intent_note && <div style={{ color: 'var(--text-secondary)' }}>{selected.lead_intent_note}</div>}
              </div>
            )}

            <div className="field"><label>שם</label><ClearableInput style={fieldStyle} value={editForm.full_name || ''} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} onClear={() => setEditForm((f) => ({ ...f, full_name: '' }))} /></div>
            <div className="form-row">
              <div className="field"><label>טלפון</label><ClearableInput style={fieldStyle} value={editForm.phone || ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} onClear={() => setEditForm((f) => ({ ...f, phone: '' }))} /></div>
              <div className="field"><label>מייל</label><ClearableInput style={fieldStyle} value={editForm.email || ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} onClear={() => setEditForm((f) => ({ ...f, email: '' }))} /></div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>שלב</label>
                <select style={fieldStyle} value={editForm.stage} onChange={(e) => setEditForm((f) => ({ ...f, stage: e.target.value as CrmStage }))}>
                  {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field"><label>תאריך פולואפ</label><input type="date" style={fieldStyle} value={editForm.follow_up_at || ''} onChange={(e) => setEditForm((f) => ({ ...f, follow_up_at: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>סטטוס טיפול</label><ClearableInput style={fieldStyle} value={editForm.status_label || ''} onChange={(e) => setEditForm((f) => ({ ...f, status_label: e.target.value }))} onClear={() => setEditForm((f) => ({ ...f, status_label: '' }))} /></div>
              <div className="field"><label>עלות חודשית (₪)</label><ClearableInput type="number" style={fieldStyle} value={editForm.monthly_cost_paid ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, monthly_cost_paid: e.target.value ? Number(e.target.value) : null }))} onClear={() => setEditForm((f) => ({ ...f, monthly_cost_paid: null }))} /></div>
            </div>
            <div className="field"><label>תגיות (מופרדות בפסיק)</label><ClearableInput style={fieldStyle} placeholder="למשל: VIP, חוזר, מחכה לתשלום" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} onClear={() => setTagsInput('')} /></div>

            <div className="qp-row" style={{ marginBottom: '10px' }}>
              <button className="qp-confirm" onClick={saveContact} disabled={savingContact}>{savingContact ? 'שומרים...' : 'שמירה'}</button>
              <button className="qp-cancel" onClick={closeDetail}>סגירה</button>
            </div>

            <div className="qp-secondary">
              {selected.stage !== 'subscriber' && <button onClick={promoteToSubscriber} disabled={promoting}>{promoting ? 'מקדמים...' : 'הפוך למנוי'}</button>}
              {selected.stage !== 'churned' && <button onClick={markChurned}>סמן כנטש</button>}
              {selected.profile_id && <Link href={`/admin/subscribers/${selected.profile_id}`}>צפייה בחשבון האתר ←</Link>}
              <button className="qp-danger" onClick={deleteContact}>מחיקת איש קשר</button>
            </div>

            <div className="section-label" style={{ marginTop: '18px' }}><h2 style={{ fontSize: '14px' }}>הערות</h2></div>

            <div className="field">
              <textarea
                style={{ ...fieldStyle, minHeight: '64px', resize: 'vertical' }}
                placeholder="הוספת הערה..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>
            <button className="btn-outline" style={{ marginBottom: '14px' }} onClick={addNote} disabled={savingNote || !newNote.trim()}>
              {savingNote ? 'שומרים...' : '+ הוספת הערה'}
            </button>

            {loadingNotes && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>טוענים הערות...</p>}
            {!loadingNotes && notes.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>אין עדיין הערות</p>}
            {notes.map((n) => (
              <div key={n.id} style={{ borderBottom: '1px solid var(--border-hairline)', padding: '10px 0', fontSize: '13px', whiteSpace: 'pre-line' }}>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                  {n.author || 'system'} · {new Date(n.created_at).toLocaleString('he-IL')}
                </div>
                {n.body}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
