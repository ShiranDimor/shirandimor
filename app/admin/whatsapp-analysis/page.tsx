'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type GroupType = 'סוחרים' | 'עדכונים';

type Analysis = {
  id: string;
  group_type: GroupType;
  message_count: number | null;
  truncated: boolean;
  analysis: string;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminWhatsappAnalysisPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [groupType, setGroupType] = useState<GroupType>('סוחרים');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Analysis | null>(null);

  const [history, setHistory] = useState<Analysis[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (profile?.role === 'admin') loadHistory();
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/whatsapp-analysis', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setHistory(data.analyses || []);
    }
    setLoadingHistory(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result || ''));
    reader.readAsText(file);
  }

  async function handleAnalyze() {
    if (rawText.trim().length < 20) {
      setError('צריך להעלות קובץ או להדביק טקסט של הצ׳אט קודם');
      return;
    }
    setAnalyzing(true);
    setError('');
    setResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/whatsapp-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ groupType, rawText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'שגיאה בניתוח');
      } else {
        setResult(data.analysis);
        setRawText('');
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadHistory();
      }
    } catch {
      setError('שגיאה בשליחת הבקשה');
    }

    setAnalyzing(false);
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
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>ניתוח קבוצות ווטסאפ</h2></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        בוואטסאפ: נכנסים לקבוצה ← שלוש נקודות/הגדרות קבוצה ← עוד ← ייצוא צ׳אט ← בלי מדיה. זה יוצר קובץ טקסט עם כל ההודעות. מעלים אותו כאן ולוחצים ניתוח - הניתוח כולל את הסגנון והשפה שלך, מעורבות בקבוצה, והזדמנויות המרה/שימור.
      </p>

      <div className="journal-form">
        <div className="toggle-row">
          <div className={`toggle-opt ${groupType === 'סוחרים' ? 'long-active' : ''}`} onClick={() => setGroupType('סוחרים')} style={{ cursor: 'pointer' }}>קבוצת הסוחרים</div>
          <div className={`toggle-opt ${groupType === 'עדכונים' ? 'short-active' : ''}`} onClick={() => setGroupType('עדכונים')} style={{ cursor: 'pointer' }}>קבוצת עדכונים</div>
        </div>

        <div className="field">
          <label>קובץ ייצוא הצ׳אט (.txt)</label>
          <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileChange} style={{ fontSize: '13px' }} />
          {fileName && <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>נטען: {fileName}</p>}
        </div>

        <div className="field">
          <label>או להדביק את הטקסט ישירות</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="12/3/25, 14:02 - שירן דימור: ..."
            rows={6}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <button className="btn-primary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? 'מנתחים... זה יכול לקחת דקה' : 'ניתוח'}</button>
        {error && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--loss)' }}>{error}</p>}
      </div>

      {result && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '12px', padding: '18px', marginTop: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
            {result.group_type === 'סוחרים' ? 'קבוצת הסוחרים' : 'קבוצת עדכונים'} · {formatDateTime(result.created_at)}
            {result.truncated && ' · הקובץ היה ארוך מדי ונותח רק החלק האחרון שלו'}
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.analysis}</p>
        </div>
      )}

      <div className="section-label" style={{ marginTop: '30px' }}><h2>ניתוחים קודמים</h2><span className="count">{history.length}</span></div>
      {loadingHistory && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingHistory && history.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין ניתוחים שמורים</p>}
      {history.map((h) => (
        <details key={h.id} className="section-collapse" style={{ marginBottom: '10px' }}>
          <summary>
            <h2 style={{ fontSize: '14px' }}>{h.group_type === 'סוחרים' ? 'קבוצת הסוחרים' : 'קבוצת עדכונים'} · {formatDateTime(h.created_at)}</h2>
          </summary>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 4px' }}>{h.analysis}</p>
        </details>
      ))}
    </div>
  );
}
