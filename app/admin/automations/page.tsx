'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FormattedText } from '@/lib/formatText';

type AutomationRule = {
  key: string;
  name: string;
  schedule_label: string;
  enabled: boolean;
  last_run_at: string | null;
};

type AutomationDetail = {
  templated: boolean;
  marketDigest?: boolean;
  title_template?: string;
  content_template?: string;
  customized?: boolean;
  placeholders?: Record<string, string>;
  preview?: { title: string; content: string; usedSample: boolean } | null;
};

function formatDateTime(iso: string | null) {
  if (!iso) return 'עוד לא רץ';
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAutomationsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState('');

  // פרטי כל אוטומציה נטענים רק כשפותחים אותה
  const [details, setDetails] = useState<Record<string, AutomationDetail>>({});
  const [editingKey, setEditingKey] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState(''); // "<key>:<פעולה>"

  useEffect(() => {
    checkAdmin();
  }, []);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadRules();
  }

  async function loadRules() {
    setLoading(true);
    const res = await fetch('/api/admin/automations', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules || []);
    }
    setLoading(false);
  }

  async function toggleRule(key: string, enabled: boolean) {
    setTogglingKey(key);
    const res = await fetch(`/api/admin/automations/${key}`, { method: 'PATCH', headers: await authHeader(), body: JSON.stringify({ enabled }) });
    setTogglingKey('');
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => prev.map((r) => (r.key === key ? data.rule : r)));
    }
  }

  async function loadDetail(key: string) {
    const res = await fetch(`/api/admin/automations/${key}`, { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setDetails((prev) => ({ ...prev, [key]: data }));
    } else {
      setDetails((prev) => ({ ...prev, [key]: { templated: false } }));
    }
  }

  function startEdit(key: string) {
    const d = details[key];
    setEditingKey(key);
    setEditTitle(d?.title_template || '');
    setEditContent(d?.content_template || '');
  }

  async function saveTemplate(key: string, reset = false) {
    if (reset && !window.confirm('לחזור לנוסח המקורי? הנוסח הערוך יימחק.')) return;
    setBusy(`${key}:save`);
    const body = reset ? { title_template: null, content_template: null } : { title_template: editTitle, content_template: editContent };
    const res = await fetch(`/api/admin/automations/${key}`, { method: 'PATCH', headers: await authHeader(), body: JSON.stringify(body) });
    setBusy('');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(`השמירה נכשלה: ${data.error || 'שגיאה לא ידועה'}`);
      return;
    }
    setEditingKey('');
    await loadDetail(key);
  }

  async function testToSelf(key: string) {
    setBusy(`${key}:test`);
    const res = await fetch(`/api/admin/automations/${key}/test`, { method: 'POST', headers: await authHeader() });
    const data = await res.json().catch(() => ({}));
    setBusy('');

    if (!res.ok) { window.alert(`השליחה נכשלה: ${data.error || 'שגיאה בשרת'}`); return; }
    if (data.configured === false) { window.alert('התראות פוש לא מוגדרות בשרת - צריך לפנות למפתח'); return; }
    if (data.attempted === 0) { window.alert('אין לך מכשיר רשום לקבלת התראות - יש להפעיל התראות דרך הכפתור בעמוד הבית'); return; }
    if (data.sent > 0) {
      window.alert(`נשלחה בהצלחה ל-${data.sent} מכשיר/ים 🎉${data.usedSample ? '\n(עם נתוני דוגמה - כרגע אין נתונים אמיתיים להודעה הזו)' : ''}`);
      return;
    }
    window.alert(data.removedStale > 0
      ? 'המכשיר שהיה רשום אצלך כבר לא תקף (הוסר) - יש להפעיל התראות מחדש בעמוד הבית'
      : 'השליחה נכשלה בפועל - יש לבדוק שההתראות עדיין מופעלות אצלך במכשיר');
  }

  async function runNow(key: string) {
    if (!window.confirm('ליצור עכשיו טיוטה בלוח המודעות עם הנוסח הזה? (שום דבר לא מתפרסם ולא נשלח - רק טיוטה לאישור)')) return;
    setBusy(`${key}:run`);
    const res = await fetch(`/api/admin/automations/${key}/run`, { method: 'POST', headers: await authHeader() });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) { window.alert(data.error || 'שגיאה ביצירת הטיוטה'); return; }
    if (window.confirm('הטיוטה נוצרה בלוח המודעות ✅\nלעבור ללוח המודעות כדי לאשר ולפרסם?')) {
      window.location.href = '/admin/announcements';
    }
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

      <div className="section-label"><h2>אוטומציות</h2><span className="count">{rules.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        כל אוטומציה מכינה טיוטה בלוח המודעות ושולחת לך התראת פוש לבדיקה - שום דבר לא מתפרסם או נשלח לבד, בלי אישור שלך ב-/admin/announcements. לחיצה על אוטומציה פותחת את ההודעה - אפשר לערוך את הנוסח, לשלוח בדיקה לעצמי וליצור טיוטה עכשיו.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && rules.map((rule) => {
        const d = details[rule.key];
        const editing = editingKey === rule.key;
        return (
          <details
            key={rule.key}
            className="section-collapse"
            onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !details[rule.key]) loadDetail(rule.key); }}
          >
            <summary>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{rule.name}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {rule.schedule_label} · רץ לאחרונה: {formatDateTime(rule.last_run_at)}
                  {d?.customized && <span style={{ color: 'var(--lavender)' }}> · ✏️ נוסח ערוך</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px 14px', fontSize: '12.5px', color: rule.enabled ? 'var(--profit)' : 'var(--text-tertiary)' }}
                    onClick={() => toggleRule(rule.key, !rule.enabled)}
                    disabled={togglingKey === rule.key}
                  >
                    {togglingKey === rule.key ? '…' : rule.enabled ? '✅ מופעל' : '⛔ כבוי'}
                  </button>
                </span>
                <span className="collapse-chevron">▾</span>
              </div>
            </summary>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px' }}>
              {!d && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

              {d && !d.templated && (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: d.marketDigest ? '10px' : 0 }}>
                    ההודעה הזו נכתבת מחדש ע&quot;י AI בכל בוקר לפי מה שקרה בשוק, אז אין לה נוסח קבוע לעריכה. הטיוטה של כל יום מחכה ב<Link href="/admin/announcements" style={{ color: 'var(--teal)' }}>לוח המודעות</Link> - שם אפשר לבדוק, לשלוח לעצמי ולאשר.
                  </p>
                  {d.marketDigest && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => testToSelf(rule.key)} disabled={busy === `${rule.key}:test`} title="שליחת התראת בדיקה רק אלי">
                        {busy === `${rule.key}:test` ? '…' : '🔔 בדיקה לעצמי'}
                      </button>
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => runNow(rule.key)} disabled={busy === `${rule.key}:run`} title="מכין את הסיכום עכשיו ויוצר טיוטה בלוח המודעות, בלי לחכות לשעה הקבועה">
                        {busy === `${rule.key}:run` ? 'מכין...' : '📝 יצירת טיוטה עכשיו'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {d?.templated && !editing && (
                <>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                    {d.preview?.usedSample ? 'תצוגה מקדימה (עם נתוני דוגמה - כרגע אין נתונים אמיתיים להודעה הזו):' : 'תצוגה מקדימה - כך ההודעה הייתה יוצאת עכשיו:'}
                  </div>
                  {d.preview && (
                    <div style={{ background: 'var(--bg-void)', border: '1px solid var(--border-hairline-strong)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 700, marginBottom: '8px' }}>{d.preview.title}</div>
                      <p style={{ fontSize: '14.5px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}><FormattedText text={d.preview.content} /></p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => startEdit(rule.key)}>✏️ עריכה</button>
                    <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => testToSelf(rule.key)} disabled={busy === `${rule.key}:test`} title="שליחת התראת בדיקה רק אלי">
                      {busy === `${rule.key}:test` ? '…' : '🔔 בדיקה לעצמי'}
                    </button>
                    <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => runNow(rule.key)} disabled={busy === `${rule.key}:run`} title="יוצר טיוטה בלוח המודעות עכשיו, בלי לחכות לתזמון">
                      {busy === `${rule.key}:run` ? '…' : '📝 יצירת טיוטה עכשיו'}
                    </button>
                    {d.customized && (
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => saveTemplate(rule.key, true)} disabled={busy === `${rule.key}:save`}>
                        ↩️ חזרה לנוסח המקורי
                      </button>
                    )}
                  </div>
                </>
              )}

              {d?.templated && editing && (
                <>
                  <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="כותרת" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <textarea className="tp-text-input" style={{ marginBottom: '6px' }} placeholder="תוכן ההודעה" rows={12} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                    טיפ: *מילה או משפט בין כוכביות* יוצג <strong>מודגש</strong> · קישור (https://...) הופך ללחיץ אוטומטית
                  </p>
                  {d.placeholders && Object.keys(d.placeholders).length > 0 && (
                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '10px', lineHeight: 1.7 }}>
                      משתנים שמתמלאים אוטומטית (להשאיר בדיוק כך, כולל הסוגריים):
                      {Object.entries(d.placeholders).map(([name, label]) => (
                        <div key={name}><code dir="ltr">{`{${name}}`}</code> - {label}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '12.5px' }} onClick={() => saveTemplate(rule.key)} disabled={busy === `${rule.key}:save` || !editTitle.trim() || !editContent.trim()}>
                      {busy === `${rule.key}:save` ? 'שומר...' : '💾 שמירה'}
                    </button>
                    <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => setEditingKey('')}>ביטול</button>
                  </div>
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
