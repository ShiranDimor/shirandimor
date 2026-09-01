'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';

type GroupType = 'סוחרים' | 'עדכונים';

// תואם ל-MAX_CHARS בlib/whatsappAnalysis.ts - מקוצר כאן כדי לא לשלוח לשרת יותר ממה שהוא ינתח בפועל
const MAX_UPLOAD_CHARS = 300000;

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
  const [processingFile, setProcessingFile] = useState(false);
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setRawText('');
    setProcessingFile(true);

    // ייצוא צ׳אט מוואטסאפ דסקטופ יוצא כקובץ zip שמכיל בפנים את קובץ הטקסט של השיחה - מחלצים
    // אותו ישירות בדפדפן כדי שלא יהיה צורך לפתוח/לחלץ אותו ידנית. קובץ גדול (למשל קבוצה עמוסה
    // עם הרבה היסטוריה) יכול לקחת רגע לחילוץ - processingFile חוסם את כפתור הניתוח באותו זמן.
    //
    // מזהים zip לפי תוכן הקובץ (חתימת "PK" בתחילת הקובץ) ולא לפי סיומת השם - כי שם הקובץ
    // שמגיע מוואטסאפ לפעמים מגיע עם סיומת מוזרה/משובשת (למשל בגלל תערובת עברית+אנגלית),
    // וזיהוי לפי סיומת בלבד החמיץ קבצי zip אמיתיים וגרם להם להיקרא (בטעות) כטקסט גולמי
    try {
      const headerBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isZip = headerBytes[0] === 0x50 && headerBytes[1] === 0x4b; // "PK"

      if (isZip) {
        const zip = await JSZip.loadAsync(file);
        const txtEntry = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.txt'));
        if (!txtEntry) {
          setError('לא נמצא קובץ טקסט של השיחה בתוך קובץ ה-zip');
        } else {
          setRawText(await txtEntry.async('string'));
        }
      } else {
        setRawText(await file.text());
      }
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ');
    }

    setProcessingFile(false);
  }

  async function handleAnalyze() {
    if (processingFile) {
      setError('רגע, עדיין מעבדים את הקובץ...');
      return;
    }
    if (rawText.trim().length < 20) {
      setError('צריך להעלות קובץ או להדביק טקסט של הצ׳אט קודם');
      return;
    }
    setAnalyzing(true);
    setError('');
    setResult(null);

    // שולחים לשרת רק עד MAX_UPLOAD_CHARS - בלי זה, קבוצה עמוסה כמו קבוצת הסוחרים יכולה ליצור
    // גוף בקשה גדול מדי (Vercel חוסם בקשות מעל כמה MB), והבקשה נכשלת עוד לפני שהשרת בכלל
    // מגיע לקיצוץ שלו. ממילא רק ה-MAX_CHARS האחרונים נכנסים לניתוח, אז אין הפסד תוכן.
    const clientTruncated = rawText.length > MAX_UPLOAD_CHARS;
    const bodyToSend = clientTruncated ? rawText.slice(rawText.length - MAX_UPLOAD_CHARS) : rawText;

    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/whatsapp-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ groupType, rawText: bodyToSend, clientTruncated }),
      });
      const data = await res.json().catch(() => null);
      if (!data) {
        setError(`שגיאה בשרת (סטטוס ${res.status}) - ייתכן שהקובץ גדול מדי לשליחה`);
      } else if (!res.ok) {
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

  const filteredHistory = history.filter((h) => h.group_type === groupType);

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
        בוואטסאפ: נכנסים לקבוצה ← שלוש נקודות/הגדרות קבוצה ← עוד ← ייצוא צ׳אט ← בלי מדיה. זה בדרך כלל יוריד קובץ zip (בוואטסאפ דסקטופ) - אפשר להעלות אותו ישירות כמו שהוא, בלי לחלץ אותו ידנית. מעלים אותו כאן ולוחצים ניתוח - הניתוח כולל את הסגנון והשפה שלך, מעורבות בקבוצה, והזדמנויות המרה/שימור.
      </p>

      <div className="journal-form">
        <div className="toggle-row">
          <div className={`toggle-opt ${groupType === 'סוחרים' ? 'long-active' : ''}`} onClick={() => setGroupType('סוחרים')} style={{ cursor: 'pointer' }}>קבוצת הסוחרים</div>
          <div className={`toggle-opt ${groupType === 'עדכונים' ? 'short-active' : ''}`} onClick={() => setGroupType('עדכונים')} style={{ cursor: 'pointer' }}>קבוצת עדכונים</div>
        </div>

        <div className="field">
          <label>קובץ ייצוא הצ׳אט (.txt או .zip כמו שיוצא מוואטסאפ דסקטופ)</label>
          <input ref={fileInputRef} type="file" accept=".txt,.zip" onChange={handleFileChange} style={{ fontSize: '13px' }} />
          {fileName && (
            <p style={{ fontSize: '11.5px', color: processingFile ? 'var(--text-tertiary)' : 'var(--profit)', marginTop: '4px' }}>
              {processingFile ? `מעבדים את ${fileName}...` : `נטען: ${fileName}`}
            </p>
          )}
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

        <button className="btn-primary" onClick={handleAnalyze} disabled={analyzing || processingFile}>
          {analyzing ? 'מנתחים... זה יכול לקחת דקה' : processingFile ? 'מעבדים את הקובץ...' : 'ניתוח'}
        </button>
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

      <div className="section-label" style={{ marginTop: '30px' }}><h2>ניתוחים קודמים · {groupType === 'סוחרים' ? 'קבוצת הסוחרים' : 'קבוצת עדכונים'}</h2><span className="count">{filteredHistory.length}</span></div>
      {loadingHistory && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingHistory && filteredHistory.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין ניתוחים שמורים לקבוצה הזו</p>}
      {filteredHistory.map((h) => (
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
