'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import TradeCard from '@/components/mentoring/TradeCard';
import TradeForm from '@/components/mentoring/TradeForm';
import JournalView from '@/components/mentoring/JournalView';
import SessionCard from '@/components/mentoring/SessionCard';
import {
  TASK_STATUS_META, VERDICT_META, daysLeft, fmtDate, fmtR, fmtUsd, journalStats, videoEmbedSrc,
  type MentoringEvent, type MentoringMessage, type MentoringSession, type MentoringStudent, type MentoringTask, type MentoringTrade, type Verdict,
} from '@/lib/mentoring';

// ניהול הליווי האישי: תור "לניתוח" (עסקאות חדשות + משימות שסומנו כבוצעו), יומן מלא, הקלטות
// שיעורים ומשימות - לכל תלמיד/ה. כל פעולה שמשנה משהו אצל התלמיד/ה שולחת לו/ה פוש + מייל
// (/api/mentoring/notify). כתיבה ישירה לטבלאות דרך RLS (is_admin)

type Tab = 'queue' | 'journal' | 'lessons' | 'tasks' | 'settings';
type StudentRow = MentoringStudent & { full_name: string | null; email: string | null; pending: number };

async function notify(event: MentoringEvent, studentId: string, detail?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  await fetch('/api/mentoring/notify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, studentId, detail }),
  }).catch(() => {});
}

const WELCOME_TITLE = 'ברוך הבא לאזור הליווי האישי שלך 🎯';

function welcomeText(firstName: string) {
  return `היי${firstName ? ' ' + firstName : ''},
פתחתי לך באתר אזור ליווי אישי. נכנסים אליו מהאזור האישי הרגיל באתר (shirandimor.com/account), מהכרטיס "הליווי האישי שלי" בראש העמוד. זו אותה כניסה של הקבוצה, בלי סיסמה נוספת.

מה מחכה לך שם:
📓 יומן מסחר - כל עסקה שלך (גם בדמו) נכנסת לשם, ואני עוברת על כל אחת ומשאירה לך משוב.
🎬 שיעורים - ההקלטה של כל שיעור עם סיכום ונקודות מפתח. השיעור הראשון כבר שם.
✅ משימות - מה עושים בין שיעור לשיעור. כשסיימת, מסמנים ✓ ואני עוברת על זה.
🛡️ מחשבון סיכון - כשאתה ממלא עסקה, הוא מראה כמה אתה מסכן מתוך ה-50$ שקבענו, וכמה מניות או חוזים לקנות.
📈 התקדמות - גרף, תובנות ופס התקדמות מול המטרה של 1,000$ בחודש.

מה אני מבקשת ממך השבוע: להיכנס, לעבור על הסיכום של השיעור הראשון ועל המשימות. יש שם גם עסקה לדוגמה שמראה איך ממלאים את היומן.
כל שאלה - תכתוב לי, לא מחכים לשיעור הבא.

שירן`;
}

// הודעה חופשית לתלמיד/ה: פוש לנייד (מופיע גם בפעמון באתר) ו/או מייל
function MessageBox({ studentId, firstName }: { studentId: string; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<MentoringMessage[]>([]);
  useEffect(() => {
    supabase.from('mentoring_messages').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => {
        const list = (data || []) as MentoringMessage[];
        setHistory(list);
        // הודעה ראשונה לתלמיד/ה - ממלאים מראש הודעת פתיחה שמסבירה מה יש באזור הליווי
        if (!list.length) { setTitle(WELCOME_TITLE); setMessage(welcomeText(firstName)); }
      });
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');

  async function send() {
    if (!message.trim() || (!push && !email)) return;
    setSending(true); setResult('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/mentoring/notify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'custom', studentId, title, message, channels: { push, email } }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (!res?.ok) { setResult('השליחה נכשלה, נסי שוב'); return; }
    const parts: string[] = [];
    if (push) parts.push(data.pushSent > 0 ? 'נשלח לנייד ✓' : data.pushAttempted > 0 ? 'הפוש לא נמסר' : 'אין לו התראות מופעלות במכשיר');
    if (email) parts.push(data.emailSent ? 'נשלח למייל ✓' : 'המייל לא נשלח');
    setResult(parts.join(' · '));
    if (data.message) setHistory((h) => [data.message as MentoringMessage, ...h]);
    if (data.pushSent > 0 || data.emailSent) { setMessage(''); setTitle(''); }
  }

  if (!open) {
    return <button className="mt-add" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>🔔 שליחת הודעה ל{firstName || 'תלמיד/ה'}{history.length ? <span className="mj-sub" style={{ fontWeight: 400 }}> · {history.length} נשלחו</span> : null}</button>;
  }
  return (
    <div className="mt-form">
      <h3>הודעה ל{firstName || 'תלמיד/ה'}</h3>
      <input className="mt-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת (לא חובה) · ברירת מחדל: הודעה משירן" maxLength={80} />
      <textarea className="mt-textarea" style={{ marginTop: 8, minHeight: message.length > 300 ? 320 : 90 }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="מה רוצה להגיד לו?" />
      <div className="mt-pills" style={{ marginTop: 10 }}>
        <button type="button" className={`mt-pill${push ? ' on' : ''}`} onClick={() => setPush(!push)}>📱 התראה לנייד</button>
        <button type="button" className={`mt-pill${email ? ' on' : ''}`} onClick={() => setEmail(!email)}>✉️ מייל</button>
      </div>
      {result && <p className="mt-sub" style={{ marginTop: 10, color: result.includes('✓') ? 'var(--profit)' : 'var(--lavender)' }}>{result}</p>}
      <div className="mt-actions">
        <button className="mt-btn-small" onClick={send} disabled={sending || !message.trim() || (!push && !email)}>{sending ? 'שולחת...' : 'שליחה'}</button>
        <button className="mt-btn-ghost" onClick={() => { setOpen(false); setResult(''); }}>סגירה</button>
      </div>
      {history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border-hairline)', paddingTop: 12 }}>
          <div className="mj-label">הודעות שנשלחו</div>
          <div className="mt-msgs">
            {history.map((m) => (
              <div key={m.id} className="mt-msg">
                <div className="mt-msg-h"><b>{m.title}</b><span className="mj-sub">{new Date(m.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                <p>{m.body}</p>
                <div className="mj-sub">{m.sent_push ? '📱 נמסר לנייד' : '📱 לא נמסר לנייד'} · {m.sent_email ? '✉️ נשלח למייל' : '✉️ בלי מייל'} · {m.seen_by_student ? '👁 נקרא' : 'עוד לא נקרא'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewBox({ trade, onSaved }: { trade: MentoringTrade; onSaved: (t: MentoringTrade, taskTitle: string | null) => void }) {
  const [verdict, setVerdict] = useState<Verdict | null>(trade.coach_verdict);
  const [comment, setComment] = useState(trade.coach_comment || '');
  const [taskTitle, setTaskTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!comment.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('mentoring_trades').update({
      coach_comment: comment.trim(), coach_verdict: verdict, reviewed_at: new Date().toISOString(), seen_by_student: false,
    }).eq('id', trade.id).select().single();
    setSaving(false);
    if (data) onSaved(data as MentoringTrade, taskTitle.trim() || null);
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-hairline-strong)' }}>
      <div className="mt-pills">
        {(Object.keys(VERDICT_META) as Verdict[]).map((v) => (
          <button key={v} type="button" className={`mt-pill${verdict === v ? ' on' : ''}`} onClick={() => setVerdict(verdict === v ? null : v)}>
            {VERDICT_META[v].icon} {VERDICT_META[v].label}
          </button>
        ))}
      </div>
      <textarea className="mt-textarea" style={{ marginTop: 8, minHeight: 90 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="מה היה טוב, מה לתקן, ומה לעשות בפעם הבאה" />
      <input className="mt-input" style={{ marginTop: 8 }} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="➕ משימה מהעסקה הזו (לא חובה)" />
      <div className="mt-actions">
        <button className="mt-btn-small" onClick={save} disabled={saving || !comment.trim()}>{saving ? 'שולחת...' : trade.reviewed_at ? 'עדכון הערה' : 'שליחת הערה'}</button>
      </div>
    </div>
  );
}

function SessionForm({ studentId, nextNumber, initial, onSaved, onCancel }: {
  studentId: string; nextNumber: number; initial: MentoringSession | null;
  onSaved: (s: MentoringSession, isNew: boolean, notifyStudent: boolean) => void; onCancel: () => void;
}) {
  const [num, setNum] = useState(String(initial?.lesson_number ?? nextNumber));
  const [title, setTitle] = useState(initial?.title || '');
  const [heldAt, setHeldAt] = useState(initial?.held_at || new Date().toISOString().slice(0, 10));
  const [video, setVideo] = useState(initial?.video_url || '');
  const [startMin, setStartMin] = useState(initial?.start_seconds ? String(Math.round(initial.start_seconds / 60)) : '');
  const [slides, setSlides] = useState(initial?.slides_url || '');
  const [summary, setSummary] = useState(initial?.summary || '');
  const [points, setPoints] = useState((initial?.key_points || []).join('\n'));
  const [notifyStudent, setNotifyStudent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!title.trim()) { setError('חסרה כותרת'); return; }
    if (video.trim() && !videoEmbedSrc(video)) { setError('לא זיהיתי את הלינק - הדביקי לינק של YouTube (או Google Drive)'); return; }
    setSaving(true);
    const row = {
      student_id: studentId,
      lesson_number: parseInt(num, 10) || nextNumber,
      title: title.trim(),
      held_at: heldAt,
      video_url: video.trim() || null,
      start_seconds: Math.max(0, Math.round((parseFloat(startMin) || 0) * 60)),
      slides_url: slides.trim() || null,
      summary: summary.trim() || null,
      key_points: points.split('\n').map((p) => p.trim()).filter(Boolean),
      ...(notifyStudent ? { seen_by_student: false } : {}),
    };
    const q = initial
      ? supabase.from('mentoring_sessions').update(row).eq('id', initial.id).select().single()
      : supabase.from('mentoring_sessions').insert(row).select().single();
    const { data, error: dbErr } = await q;
    setSaving(false);
    if (dbErr || !data) { setError('השמירה נכשלה'); return; }
    onSaved(data as MentoringSession, !initial, notifyStudent);
  }

  return (
    <div className="mt-form">
      <h3>{initial ? 'עריכת שיעור' : 'העלאת הקלטת שיעור'}</h3>
      <div className="mt-row">
        <div><label className="mt-label" style={{ marginTop: 0 }}>מספר שיעור</label><input className="mt-input" type="number" value={num} onChange={(e) => setNum(e.target.value)} /></div>
        <div><label className="mt-label" style={{ marginTop: 0 }}>תאריך</label><input className="mt-input" type="date" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} /></div>
      </div>
      <label className="mt-label">כותרת</label>
      <input className="mt-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: ניהול סיכון וגודל פוזיציה ב-MNQ" />
      <label className="mt-label">לינק להקלטה (YouTube לא-רשום, כמו בספריית השיעורים)</label>
      <input className="mt-input" style={{ direction: 'ltr' }} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/..." />
      <div className="mt-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>ביוטיוב: להעלות כ&quot;לא רשום&quot; (Unlisted) - הסרטון מוטמע רק באזור הפרטי שלו/ה. לינק דרייב עובד רק אם הקובץ משותף, ובנייד לא תמיד נטען.</div>
      <label className="mt-label">לינק למצגת (גמא / דרייב / PDF)</label>
      <input className="mt-input" style={{ direction: 'ltr' }} value={slides} onChange={(e) => setSlides(e.target.value)} placeholder="https://gamma.app/..." />
      <label className="mt-label">להתחיל את ההקלטה מדקה (לדלג על ההתחלה)</label>
      <input className="mt-input" type="number" inputMode="numeric" value={startMin} onChange={(e) => setStartMin(e.target.value)} placeholder="0" style={{ maxWidth: 120 }} />
      <label className="mt-label">סיכום קצר</label>
      <textarea className="mt-textarea" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="על מה עבדנו בשיעור" />
      <label className="mt-label">נקודות מפתח (שורה לכל נקודה)</label>
      <textarea className="mt-textarea" value={points} onChange={(e) => setPoints(e.target.value)} placeholder={'סטופ נקבע לפני הכניסה, לא אחריה\nמקסימום 2 עסקאות ביום\n...'} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}>
        <input type="checkbox" checked={notifyStudent} onChange={(e) => setNotifyStudent(e.target.checked)} /> לשלוח לתלמיד/ה התראה + מייל
      </label>
      {error && <p style={{ color: 'var(--loss)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <div className="mt-actions">
        <button className="mt-btn-small" onClick={save} disabled={saving}>{saving ? 'שומרת...' : 'שמירה'}</button>
        <button className="mt-btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

function TaskForm({ studentId, sessions, onSaved }: { studentId: string; sessions: MentoringSession[]; onSaved: (k: MentoringTask) => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('mentoring_tasks').insert({
      student_id: studentId, title: title.trim(), details: details.trim() || null, due_date: due || null, session_id: sessionId || null,
    }).select().single();
    setSaving(false);
    if (data) { onSaved(data as MentoringTask); setTitle(''); setDetails(''); setDue(''); setSessionId(''); }
  }

  return (
    <div className="mt-form">
      <h3>משימה חדשה</h3>
      <input className="mt-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה המשימה" />
      <textarea className="mt-textarea" style={{ marginTop: 8, minHeight: 56 }} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="פירוט (לא חובה)" />
      <div className="mt-row" style={{ marginTop: 8 }}>
        <input className="mt-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="תאריך יעד" />
        <select className="mt-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="שיעור קשור">
          <option value="">בלי שיעור קשור</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>שיעור {s.lesson_number}</option>)}
        </select>
      </div>
      <div className="mt-actions"><button className="mt-btn-small" onClick={save} disabled={saving || !title.trim()}>{saving ? 'שומרת...' : 'הוספה + התראה לתלמיד/ה'}</button></div>
    </div>
  );
}

export default function AdminMentoringPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessions, setSessions] = useState<MentoringSession[]>([]);
  const [trades, setTrades] = useState<MentoringTrade[]>([]);
  const [tasks, setTasks] = useState<MentoringTask[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [sessionForm, setSessionForm] = useState<{ open: boolean; edit: MentoringSession | null }>({ open: false, edit: null });
  const [editingTrade, setEditingTrade] = useState<MentoringTrade | null>(null);
  const [returnNotes, setReturnNotes] = useState<Record<string, string>>({});
  const [newEmail, setNewEmail] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'admin') { setChecking(false); return; }
    setIsAdmin(true);
    const list = await loadStudents();
    const fromUrl = new URLSearchParams(window.location.search).get('student');
    const first = list.find((s) => s.user_id === fromUrl)?.user_id || list.find((s) => s.active)?.user_id || list[0]?.user_id || null;
    setChecking(false);
    if (first) selectStudent(first);
  }

  async function loadStudents(): Promise<StudentRow[]> {
    const { data: rows } = await supabase.from('mentoring_students').select('*').order('created_at', { ascending: false });
    const ids = (rows || []).map((r) => r.user_id);
    if (!ids.length) { setStudents([]); return []; }
    const [{ data: profs }, { data: pendTrades }, { data: pendTasks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', ids),
      supabase.from('mentoring_trades').select('student_id').in('student_id', ids).is('reviewed_at', null),
      supabase.from('mentoring_tasks').select('student_id').in('student_id', ids).eq('status', 'done'),
    ]);
    const list = (rows || []).map((r) => {
      const p = (profs || []).find((x) => x.id === r.user_id);
      const pending = [...(pendTrades || []), ...(pendTasks || [])].filter((x) => x.student_id === r.user_id).length;
      return { ...(r as MentoringStudent), full_name: p?.full_name ?? null, email: p?.email ?? null, pending };
    });
    setStudents(list);
    return list;
  }

  async function selectStudent(id: string) {
    setSelected(id);
    setSessionForm({ open: false, edit: null });
    const url = new URL(window.location.href);
    url.searchParams.set('student', id);
    window.history.replaceState(null, '', url.toString());
    const [{ data: se }, { data: tr }, { data: ta }] = await Promise.all([
      supabase.from('mentoring_sessions').select('*').eq('student_id', id).order('lesson_number', { ascending: true }),
      supabase.from('mentoring_trades').select('*').eq('student_id', id).order('traded_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('mentoring_tasks').select('*').eq('student_id', id).order('created_at', { ascending: false }),
    ]);
    setSessions((se || []) as MentoringSession[]);
    setTrades((tr || []) as MentoringTrade[]);
    setTasks((ta || []) as MentoringTask[]);
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2600);
  }

  async function addStudent() {
    setAddMsg('');
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const { data: prof } = await supabase.from('profiles').select('id, full_name').ilike('email', email).maybeSingle();
    if (!prof) { setAddMsg('לא נמצא חשבון עם המייל הזה - התלמיד/ה צריך/ה להתחבר לאתר פעם אחת קודם'); return; }
    const start = new Date();
    const end = new Date(start); end.setMonth(end.getMonth() + 4);
    const { error } = await supabase.from('mentoring_students').insert({
      user_id: prof.id, started_at: start.toISOString().slice(0, 10), ends_at: end.toISOString().slice(0, 10),
    });
    if (error) { setAddMsg(error.code === '23505' ? 'כבר רשום/ה בליווי' : 'שגיאה בהוספה'); return; }
    setNewEmail('');
    await loadStudents();
    selectStudent(prof.id);
    setTab('settings');
  }

  async function updateStudent(patch: Partial<MentoringStudent>) {
    if (!selected) return;
    const { data } = await supabase.from('mentoring_students').update(patch).eq('user_id', selected).select().single();
    if (data) { setStudents((prev) => prev.map((s) => (s.user_id === selected ? { ...s, ...(data as MentoringStudent) } : s))); showFlash('נשמר ✓'); }
  }

  async function reviewTask(k: MentoringTask, status: 'approved' | 'returned') {
    const note = (returnNotes[k.id] ?? '').trim();
    if (status === 'returned' && !note) { showFlash('כתבי מה לתקן'); return; }
    const { data } = await supabase.from('mentoring_tasks').update({ status, coach_note: note || k.coach_note, seen_by_student: false }).eq('id', k.id).select().single();
    if (data) {
      setTasks((prev) => prev.map((x) => (x.id === k.id ? (data as MentoringTask) : x)));
      notify('task_reviewed', k.student_id, status === 'approved' ? `✅ ${k.title}` : `🛠️ ${k.title}`);
      showFlash(status === 'approved' ? 'המשימה אושרה ✓' : 'הוחזרה לתיקון');
      loadStudents();
    }
  }

  async function deleteTrade(t: MentoringTrade) {
    if (!confirm(`למחוק את העסקה${t.is_example ? ' לדוגמה' : ''}? אי אפשר לשחזר.`)) return;
    const { error } = await supabase.from('mentoring_trades').delete().eq('id', t.id);
    if (error) { showFlash('המחיקה נכשלה'); return; }
    setTrades((prev) => prev.filter((x) => x.id !== t.id));
    if (t.chart_paths?.length) supabase.storage.from('mentoring').remove(t.chart_paths).then(() => {});
    showFlash('העסקה נמחקה');
    loadStudents();
  }

  async function deleteTask(k: MentoringTask) {
    if (!confirm('למחוק את המשימה?')) return;
    await supabase.from('mentoring_tasks').delete().eq('id', k.id);
    setTasks((prev) => prev.filter((x) => x.id !== k.id));
  }

  async function deleteSession(s: MentoringSession) {
    if (!confirm(`למחוק את שיעור ${s.lesson_number}?`)) return;
    await supabase.from('mentoring_sessions').delete().eq('id', s.id);
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
  }

  const student = students.find((s) => s.user_id === selected) || null;
  const pendingTrades = useMemo(() => trades.filter((t) => !t.reviewed_at).sort((a, b) => a.created_at.localeCompare(b.created_at)), [trades]);
  const doneTasks = tasks.filter((k) => k.status === 'done');
  const stats = useMemo(() => journalStats(trades), [trades]);
  const studentName = student?.full_name || student?.email || '';

  if (checking) return <div className="wrap"><p style={{ padding: 40, textAlign: 'center' }}>טוענים...</p></div>;
  if (!isAdmin) return <div className="wrap"><p style={{ padding: 40, textAlign: 'center' }}>אין הרשאה. <Link href="/login">כניסה</Link></p></div>;

  return (
    <div className="wrap mt-wide">
      <header>
        <Link href="/admin" className="brand">ניהול <span>· ליווי אישי</span></Link>
        <Link href="/admin" className="nav-link">← לוח ניהול</Link>
      </header>

      {flash && <div className="mt-chip warm" style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>{flash}</div>}

      <div className="mt-student-chips">
        {students.map((s) => (
          <button key={s.user_id} className={`mt-pill mt-student-chip${s.user_id === selected ? ' on' : ''}`} onClick={() => selectStudent(s.user_id)} style={{ opacity: s.active ? 1 : 0.5 }}>
            {s.full_name || s.email}
            {s.pending > 0 && <span className="mt-badge" style={{ position: 'static', border: 'none' }}>{s.pending}</span>}
          </button>
        ))}
      </div>

      {!student ? (
        <div className="mt-form">
          <h3>עדיין אין תלמידי ליווי</h3>
          <div className="mt-row"><input className="mt-input" style={{ direction: 'ltr' }} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" /><button className="mt-btn-small" onClick={addStudent}>הוספה</button></div>
          {addMsg && <p className="mt-sub" style={{ marginTop: 8 }}>{addMsg}</p>}
        </div>
      ) : (
        <>
          <div className="mt-hero" style={{ justifyContent: 'space-between' }}>
            <div>
              <h1>{studentName}</h1>
              <p>{student.track_label} · שיעור {sessions.length}/{student.total_sessions}{daysLeft(student.ends_at) != null ? ` · עוד ${daysLeft(student.ends_at)} ימים` : ''}</p>
              <p className="mt-sub">{stats.count} עסקאות · {stats.winRate ?? '—'}% הצלחה · {fmtUsd(stats.net)} · ממוצע {fmtR(stats.avgR)} · {stats.planPct ?? '—'}% לפי תוכנית</p>
            </div>
            <Link href={`/my-mentoring?student=${student.user_id}`} className="mt-btn-ghost" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>👁 איך זה נראה לו/ה</Link>
          </div>

          <MessageBox studentId={student.user_id} firstName={(student.full_name || '').trim().split(' ')[0]} />

          <div className="mt-pills" style={{ marginBottom: 16 }}>
            {([
              ['queue', `לניתוח${pendingTrades.length + doneTasks.length ? ` (${pendingTrades.length + doneTasks.length})` : ''}`],
              ['journal', `יומן (${trades.length})`],
              ['lessons', `שיעורים (${sessions.length})`],
              ['tasks', `משימות (${tasks.length})`],
              ['settings', 'הגדרות'],
            ] as [Tab, string][]).map(([k, label]) => (
              <button key={k} className={`mt-pill${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === 'queue' && (
            <>
              {pendingTrades.length === 0 && doneTasks.length === 0 && <div className="mt-empty">הכל מנותח ✨ אין כרגע מה לבדוק.</div>}
              {pendingTrades.map((t) => (
                <TradeCard key={t.id} trade={t} defaultOpen isNew footer={
                  <ReviewBox trade={t} onSaved={async (updated, taskTitle) => {
                    setTrades((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    if (taskTitle) {
                      const { data: k } = await supabase.from('mentoring_tasks').insert({ student_id: t.student_id, title: taskTitle, trade_id: t.id }).select().single();
                      if (k) setTasks((prev) => [k as MentoringTask, ...prev]);
                    }
                    notify('trade_reviewed', t.student_id, `${t.instrument} ${fmtDate(t.traded_at)}`);
                    showFlash('ההערה נשלחה ✓');
                    loadStudents();
                  }} />
                } />
              ))}
              {doneTasks.map((k) => (
                <div key={k.id} className="mt-card new">
                  <div className="mt-card-body" style={{ borderTop: 'none' }}>
                    <div style={{ fontWeight: 600 }}>✅ {k.title}</div>
                    <div className="mt-sub">סומנה כבוצעה {fmtDate(k.done_at)}</div>
                    {k.student_note && <div className="mt-text"><b>{studentName.split(' ')[0]}: </b>{k.student_note}</div>}
                    <textarea className="mt-textarea" style={{ marginTop: 8, minHeight: 48 }} placeholder="משוב (חובה אם מחזירים לתיקון)" value={returnNotes[k.id] ?? ''} onChange={(e) => setReturnNotes((p) => ({ ...p, [k.id]: e.target.value }))} />
                    <div className="mt-actions">
                      <button className="mt-btn-small" onClick={() => reviewTask(k, 'approved')}>אישור ✓</button>
                      <button className="mt-btn-ghost" onClick={() => reviewTask(k, 'returned')}>החזרה לתיקון</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'journal' && (
            <>
              {editingTrade && (
                <TradeForm
                  userId={editingTrade.student_id}
                  riskLimit={student.risk_usd != null ? Number(student.risk_usd) : null}
                  initial={editingTrade}
                  onCancel={() => setEditingTrade(null)}
                  onSaved={(updated) => {
                    setTrades((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    setEditingTrade(null);
                    showFlash('העסקה עודכנה ✓');
                  }}
                />
              )}
              {trades.length === 0 ? <div className="mt-empty">עוד אין עסקאות ביומן.</div> : (
                <JournalView
                  trades={trades}
                  riskLimit={student.risk_usd != null ? Number(student.risk_usd) : null}
                  goalMonthly={student.goal_monthly_usd != null ? Number(student.goal_monthly_usd) : null}
                  renderFooter={(t, close) => (
                    <>
                      <div className="mt-actions">
                        <button className="mt-btn-ghost" onClick={() => { close(); setEditingTrade(t); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>✏️ עריכת העסקה</button>
                        <button className="mt-btn-ghost" style={{ color: 'var(--loss)' }} onClick={() => { close(); deleteTrade(t); }}>🗑 מחיקה</button>
                      </div>
                      <ReviewBox trade={t} onSaved={(updated) => {
                        setTrades((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                        notify('trade_reviewed', t.student_id, `${t.instrument} ${fmtDate(t.traded_at)}`);
                        showFlash('נשמר ✓');
                        loadStudents();
                      }} />
                    </>
                  )}
                />
              )}
            </>
          )}

          {tab === 'lessons' && (
            <>
              {sessionForm.open ? (
                <SessionForm
                  studentId={student.user_id}
                  nextNumber={(sessions[sessions.length - 1]?.lesson_number || 0) + 1}
                  initial={sessionForm.edit}
                  onCancel={() => setSessionForm({ open: false, edit: null })}
                  onSaved={(s, isNew, notifyStudent) => {
                    setSessions((prev) => (isNew ? [...prev, s] : prev.map((x) => (x.id === s.id ? s : x))).sort((a, b) => a.lesson_number - b.lesson_number));
                    setSessionForm({ open: false, edit: null });
                    if (notifyStudent) notify('session_added', student.user_id, `שיעור ${s.lesson_number}: ${s.title}`);
                    showFlash('השיעור נשמר ✓');
                  }}
                />
              ) : (
                <button className="mt-add" onClick={() => setSessionForm({ open: true, edit: null })}>＋ העלאת הקלטת שיעור {(sessions[sessions.length - 1]?.lesson_number || 0) + 1}</button>
              )}
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} footer={
                  <div className="mt-actions">
                    <span className="mt-sub">{s.seen_by_student ? '👁 נצפה' : 'עוד לא נצפה'}</span>
                    <button className="mt-btn-ghost" onClick={() => { setSessionForm({ open: true, edit: s }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>עריכה</button>
                    <button className="mt-btn-ghost" onClick={() => deleteSession(s)}>מחיקה</button>
                  </div>
                } />
              ))}
            </>
          )}

          {tab === 'tasks' && (
            <>
              <TaskForm studentId={student.user_id} sessions={sessions} onSaved={(k) => { setTasks((prev) => [k, ...prev]); notify('task_added', student.user_id, k.title); showFlash('המשימה נוספה ✓'); }} />
              {tasks.map((k) => {
                const meta = TASK_STATUS_META[k.status];
                return (
                  <div key={k.id} className="mt-card">
                    <div className="mt-card-head" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{k.title}</div>
                        {k.details && <div className="mt-text" style={{ marginTop: 4 }}>{k.details}</div>}
                        <div className="mt-sub" style={{ marginTop: 4 }}>{k.due_date ? `עד ${fmtDate(k.due_date)} · ` : ''}{k.seen_by_student ? '👁 נצפתה' : 'עוד לא נצפתה'}</div>
                        {k.student_note && <div className="mt-text"><b>{studentName.split(' ')[0]}: </b>{k.student_note}</div>}
                        {k.coach_note && <div className="mt-text"><b>המשוב שלי: </b>{k.coach_note}</div>}
                      </div>
                      <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                        <span className="mt-status" style={{ color: meta.color }}>{meta.label}</span>
                        <button className="mt-btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => deleteTask(k)}>מחיקה</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'settings' && (
            <div className="mt-form">
              <h3>פרטי הליווי</h3>
              <label className="mt-label" style={{ marginTop: 0 }}>מסלול</label>
              <input className="mt-input" defaultValue={student.track_label} onBlur={(e) => e.target.value !== student.track_label && updateStudent({ track_label: e.target.value })} />
              <div className="mt-row3">
                <div><label className="mt-label">התחלה</label><input className="mt-input" type="date" defaultValue={student.started_at} onBlur={(e) => updateStudent({ started_at: e.target.value })} /></div>
                <div><label className="mt-label">סיום</label><input className="mt-input" type="date" defaultValue={student.ends_at || ''} onBlur={(e) => updateStudent({ ends_at: e.target.value || null })} /></div>
                <div><label className="mt-label">מס׳ שיעורים</label><input className="mt-input" type="number" defaultValue={student.total_sessions} onBlur={(e) => updateStudent({ total_sessions: parseInt(e.target.value, 10) || 6 })} /></div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-hairline)', margin: '16px 0 4px', paddingTop: 12 }}><b style={{ fontSize: 14 }}>נקודת הפתיחה (מוצג לתלמיד/ה)</b></div>
              <div className="mt-row">
                <div><label className="mt-label">ברוקר היום</label><input className="mt-input" defaultValue={student.broker || ''} placeholder="מיטב" onBlur={(e) => updateStudent({ broker: e.target.value.trim() || null })} /></div>
                <div><label className="mt-label">ברוקר שעוברים אליו</label><input className="mt-input" defaultValue={student.planned_broker || ''} placeholder="קולמקס" onBlur={(e) => updateStudent({ planned_broker: e.target.value.trim() || null })} /></div>
              </div>
              <div className="mt-row3">
                <div><label className="mt-label">תיק לסווינג (₪)</label><input className="mt-input" type="number" defaultValue={student.capital_ils ?? ''} onBlur={(e) => updateStudent({ capital_ils: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><label className="mt-label">סיכון לעסקה ($)</label><input className="mt-input" type="number" defaultValue={student.risk_usd ?? ''} onBlur={(e) => updateStudent({ risk_usd: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><label className="mt-label">מטרה חודשית ($)</label><input className="mt-input" type="number" defaultValue={student.goal_monthly_usd ?? ''} onBlur={(e) => updateStudent({ goal_monthly_usd: e.target.value ? Number(e.target.value) : null })} /></div>
              </div>
              <label className="mt-label">על מה עובדים (חששות / קשיים)</label>
              <textarea className="mt-textarea" style={{ minHeight: 56 }} defaultValue={student.concerns || ''} onBlur={(e) => updateStudent({ concerns: e.target.value.trim() || null })} />
              <label className="mt-label">מטרה מרכזית (מוצגת לתלמיד/ה)</label>
              <input className="mt-input" defaultValue={student.goal || ''} placeholder="למשל: 20 עסקאות רצופות לפי התוכנית" onBlur={(e) => updateStudent({ goal: e.target.value.trim() || null })} />
              <label className="mt-label">סגנון ברירת מחדל ביומן</label>
              <select className="mt-select" defaultValue={student.default_style || 'swing'} onChange={(e) => updateStudent({ default_style: e.target.value as 'swing' | 'intraday' })}>
                <option value="swing">סווינג</option>
                <option value="intraday">תוך-יומי</option>
              </select>
              <label className="mt-label">כלי ברירת מחדל ביומן</label>
              <select className="mt-select" defaultValue={student.instruments || 'MNQ'} onChange={(e) => updateStudent({ instruments: e.target.value })}>
                {['MNQ', 'NQ', 'MES', 'ES', 'MGC', 'STOCK'].map((i) => <option key={i} value={i}>{i === 'STOCK' ? 'מניות' : i}</option>)}
              </select>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 13 }}>
                <input type="checkbox" checked={student.active} onChange={(e) => updateStudent({ active: e.target.checked })} />
                ליווי פעיל (כבוי = התלמיד/ה רואה הכל אבל לא יכול/ה להוסיף עסקאות)
              </label>

              <div style={{ borderTop: '1px solid var(--border-hairline)', marginTop: 18, paddingTop: 14 }}>
                <h3>הוספת תלמיד/ת ליווי</h3>
                <div className="mt-row"><input className="mt-input" style={{ direction: 'ltr' }} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" /><button className="mt-btn-small" onClick={addStudent}>הוספה</button></div>
                {addMsg && <p className="mt-sub" style={{ marginTop: 8 }}>{addMsg}</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
