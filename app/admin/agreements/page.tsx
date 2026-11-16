'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Field = { key: string; label: string; type?: string; placeholder?: string; remember?: boolean };
type Agreement = { id: string; title: string; version: string; active: boolean; termFields: Field[] };
type Signature = { id: string; created_at: string; agreement_id: string; agreement_version: string; full_name: string; id_number: string; phone: string; email: string; terms: Record<string, string> };

const REMEMBER_KEY = 'sd_agreement_defaults';

// אדמין: יצירת קישור חתימה על הסכם (אישי עם תנאים, או קבוע לכולם) + מי כבר חתם
export default function AgreementsAdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selected, setSelected] = useState('');
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/agreements', { headers: await authHeader(), cache: 'no-store' });
      setChecking(false);
      if (!res.ok) return;
      setIsAdmin(true);
      const json = await res.json();
      setAgreements(json.agreements || []);
      setSignatures(json.signatures || []);
      if (json.dbError) setError(json.dbError);
      setSelected((json.agreements || []).find((a: Agreement) => a.active)?.id || '');
    })().catch(() => setChecking(false));
    try {
      setTerms(JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}'));
    } catch {}
  }, []);

  const agreement = agreements.find((a) => a.id === selected);
  const signedHere = useMemo(() => signatures.filter((s) => s.agreement_id === selected), [signatures, selected]);

  async function createLink() {
    if (!agreement) return;
    setError('');
    setLink('');
    setCopied(false);
    try {
      const remembered: Record<string, string> = {};
      for (const f of agreement.termFields) if (f.remember && terms[f.key]) remembered[f.key] = terms[f.key];
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(remembered));
    } catch {}
    const res = await fetch('/api/admin/agreements', { method: 'POST', headers: await authHeader(), body: JSON.stringify({ agreementId: agreement.id, terms }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || 'לא הצלחנו ליצור קישור');
    setLink(json.url);
  }

  // פותח את ההסכם החתום בחלון חדש, עם כפתורי הורדה ושמירה כ-PDF (הדפסה)
  async function openSigned(id: string) {
    const win = window.open('', '_blank');
    const res = await fetch(`/api/admin/agreements/${id}`, { headers: await authHeader(), cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !win) {
      win?.close();
      setError(json.error || 'לא הצלחנו לפתוח את ההסכם');
      return;
    }
    const doc = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${json.fileName}</title>
<style>body{margin:0;background:#fff}.bar{position:sticky;top:0;display:flex;gap:8px;padding:10px;background:#f4f1ee;border-bottom:1px solid #ddd;font-family:Arial}.bar button{padding:9px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;font-size:14px;cursor:pointer}@media print{.bar{display:none}}</style></head>
<body><div class="bar"><button onclick="window.print()">שמירה כ-PDF / הדפסה</button><button id="dl">הורדה</button></div>${json.html}
<script>document.getElementById('dl').onclick=function(){var b=new Blob(['<!doctype html><meta charset=utf-8>'+document.body.innerHTML.replace(/<div class="bar">[\s\S]*?<\/div>/,'')],{type:'text/html'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=document.title+'.html';a.click();};</script></body></html>`;
    win.document.open();
    win.document.write(doc);
    win.document.close();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {}
  }

  const waText = link ? `היי${terms.studentName ? ` ${terms.studentName.split(' ')[0]}` : ''}, מצרפת את ההסכם לעיון ולחתימה דיגיטלית: ${link}` : '';

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/admin" className="nav-link">ניהול</Link>
      </header>
      <div className="form-title">הסכמים וחתימות</div>
      <div className="form-sub">יוצרים קישור לחתימה דיגיטלית, ורואים מי כבר חתם</div>

      {checking && <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>בודקים...</p>}
      {!checking && !isAdmin && <p style={{ textAlign: 'center' }}>צריך להתחבר כאדמין. <Link href="/login?returnTo=/admin/agreements" style={{ color: 'var(--lavender)' }}>כניסה</Link></p>}

      {isAdmin && (
        <>
          <div className="tp-options" style={{ marginBottom: 18 }}>
            {agreements.map((a) => (
              <button key={a.id} type="button" className={`tp-option-btn${a.id === selected ? ' selected' : ''}`} onClick={() => { setSelected(a.id); setLink(''); }}>
                <span>{a.title}{!a.active && ' (טיוטה - עוד לא פתוח לחתימה)'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{signatures.filter((s) => s.agreement_id === a.id).length} חתמו</span>
              </button>
            ))}
          </div>

          {agreement && (
            <div className="price-card" style={{ textAlign: 'right' }}>
              {agreement.termFields.length > 0 ? (
                <>
                  <p style={{ fontWeight: 700, marginBottom: 12 }}>קישור אישי - התנאים נכנסים להסכם ולא ניתנים לשינוי בקישור</p>
                  {agreement.termFields.map((f) => (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      <input type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} placeholder={f.placeholder} value={terms[f.key] || ''} onChange={(e) => setTerms((t) => ({ ...t, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                  <button type="button" className="btn-primary" onClick={createLink} disabled={!agreement.active}>יצירת קישור לחתימה</button>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 700, marginBottom: 8 }}>קישור אחד קבוע לכולם</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>אפשר לשלוח אותו לכל המנויים יחד. כל אחד ממלא פרטים וחותם בעצמו.</p>
                  <button type="button" className="btn-primary" onClick={createLink} disabled={!agreement.active}>הצגת הקישור</button>
                </>
              )}
              {!agreement.active && <p style={{ fontSize: 12.5, color: 'var(--orange)', marginTop: 10 }}>ההסכם הזה עדיין טיוטה. כשהנוסח יהיה מוכן הוא ייפתח לחתימה.</p>}

              {link && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 12.5, direction: 'ltr', textAlign: 'left', background: 'var(--bg-void)', padding: 10, borderRadius: 8, wordBreak: 'break-all' }}>{link}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-outline" onClick={copy}>{copied ? 'הועתק ✓' : 'העתקת הקישור'}</button>
                    <a className="btn-outline" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>שליחה בוואטסאפ</a>
                    <a className="btn-outline" href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>תצוגה מקדימה</a>
                  </div>
                  {agreement.termFields.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>הקישור בתוקף ל-30 יום.</p>}
                </div>
              )}
              {error && <p style={{ color: 'var(--loss)', fontSize: 13, marginTop: 10 }}>{error}</p>}
            </div>
          )}

          <div className="section-label" style={{ marginTop: 24 }}><h2>מי חתם{agreement ? ` - ${agreement.title}` : ''}</h2><span className="count">{signedHere.length}</span></div>
          {signedHere.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>עוד אין חתימות.</p>
          ) : (
            <div className="trade-table-wrap">
              <table className="trade-table">
                <thead><tr><th>שם</th><th>נחתם</th><th>מסלול</th><th>נייד</th><th>מייל</th><th>הסכם</th></tr></thead>
                <tbody>
                  {signedHere.map((s) => (
                    <tr key={s.id}>
                      <td className="sym-cell">{s.full_name}</td>
                      <td>{new Date(s.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{s.terms?.track === 'extended' ? 'מורחב (6 ח׳)' : s.terms?.track === 'core' ? 'ליווי אישי (4 ח׳)' : '-'}</td>
                      <td dir="ltr">{s.phone}</td>
                      <td dir="ltr">{s.email}</td>
                      <td><button type="button" className="qa-btn" onClick={() => openSigned(s.id)}>צפייה / הורדה</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>&quot;צפייה / הורדה&quot; פותח את ההסכם החתום המלא, כולל החתימה ביד - משם אפשר לשמור כ-PDF. עותק נשלח גם במייל בכל חתימה.</p>
        </>
      )}
    </div>
  );
}
