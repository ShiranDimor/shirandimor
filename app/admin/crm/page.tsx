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
  created_at: string;
  updated_at: string;
};

type CrmNote = { id: string; body: string; author: string | null; created_at: string };

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
  }, [contacts, stageFilter, tagFilter, search]);

  const followupDueCount = useMemo(() => contacts.filter((c) => isOverdue(c.follow_up_at)).length, [contacts]);
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

      {filteredContacts.map((c) => (
        <button
          key={c.id}
          onClick={() => selectContact(c)}
          className="admin-row"
          style={{ width: '100%', textAlign: 'right', border: selectedId === c.id ? '1px solid var(--teal)' : undefined, cursor: 'pointer' }}
        >
          <div>
            <div className="name">{c.full_name || 'ללא שם'}</div>
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

      {selected && (
        <>
          <div className="qa-popover-backdrop" onClick={closeDetail} />
          <div className="qa-popover" style={{ top: '5vh', left: '50%', transform: 'translateX(-50%)', maxWidth: '480px', width: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="qp-title">{selected.full_name || 'ללא שם'}</div>

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
