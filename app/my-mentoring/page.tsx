'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getResilientUser } from '@/lib/supabase';
import JournalView from '@/components/mentoring/JournalView';
import StudentProfileCard from '@/components/mentoring/StudentProfileCard';
import TradeForm from '@/components/mentoring/TradeForm';
import SessionCard from '@/components/mentoring/SessionCard';
import {
  TASK_STATUS_META, daysLeft, fmtDate, fmtR, fmtUsd, journalStats,
  type MentoringEvent, type MentoringMessage, type MentoringSession, type MentoringStudent, type MentoringTask, type MentoringTrade,
} from '@/lib/mentoring';

// אזור הליווי האישי של התלמיד/ה - נכנסים אליו מכרטיס מודגש בראש /account (אותו חשבון, אותה
// התחברות כמו קבוצת המנויים - בלי אזור אישי נוסף). שלוש לשוניות: יומן (עם הערות שירן על כל
// עסקה), שיעורים (הקלטות + סיכום) ומשימות. אדמין יכולה לפתוח ?student=<id> ולראות בדיוק מה
// התלמיד/ה רואה (צפייה בלבד)

type Tab = 'journal' | 'lessons' | 'tasks' | 'messages';

async function notify(event: MentoringEvent, detail?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  fetch('/api/mentoring/notify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, detail }),
  }).catch(() => {});
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <div className="mt-ring">
      <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden>
        <defs>
          <linearGradient id="mtGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#FF2D78" />
            <stop offset="1" stopColor="#FFB648" />
          </linearGradient>
        </defs>
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--border-hairline-strong)" strokeWidth="6" />
        <circle cx="39" cy="39" r={r} fill="none" stroke="url(#mtGrad)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="mt-ring-label"><div><b>{done}/{total}</b><span>שיעורים</span></div></div>
    </div>
  );
}

export default function MyMentoringPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [student, setStudent] = useState<MentoringStudent | null>(null);
  const [sessions, setSessions] = useState<MentoringSession[]>([]);
  const [trades, setTrades] = useState<MentoringTrade[]>([]);
  const [tasks, setTasks] = useState<MentoringTask[]>([]);
  const [messages, setMessages] = useState<MentoringMessage[]>([]);
  const [tab, setTab] = useState<Tab>('journal');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MentoringTrade | null>(null);
  // מה היה "חדש" ברגע הטעינה - נשאר מודגש לאורך הביקור גם אחרי שסימנו כנקרא בבסיס הנתונים
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const user = await getResilientUser();
    if (!user) { setLoading(false); return; }

    const viewAs = new URLSearchParams(window.location.search).get('student');
    let targetId = user.id;
    if (viewAs && viewAs !== user.id) {
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (me?.role === 'admin') { targetId = viewAs; setReadOnly(true); }
    }
    setUserId(targetId);

    const [{ data: st }, { data: prof }] = await Promise.all([
      supabase.from('mentoring_students').select('*').eq('user_id', targetId).maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', targetId).maybeSingle(),
    ]);
    setFirstName(((prof?.full_name as string) || '').trim().split(' ')[0] || '');
    if (!st) { setLoading(false); return; }
    setStudent(st as MentoringStudent);

    const [{ data: se }, { data: tr }, { data: ta }, { data: ms }] = await Promise.all([
      supabase.from('mentoring_sessions').select('*').eq('student_id', targetId).order('lesson_number', { ascending: true }),
      supabase.from('mentoring_trades').select('*').eq('student_id', targetId).order('traded_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('mentoring_tasks').select('*').eq('student_id', targetId).order('created_at', { ascending: false }),
      supabase.from('mentoring_messages').select('*').eq('student_id', targetId).order('created_at', { ascending: false }),
    ]);
    const M = (ms || []) as MentoringMessage[];
    setMessages(M);
    const S = (se || []) as MentoringSession[];
    const T = (tr || []) as MentoringTrade[];
    const K = (ta || []) as MentoringTask[];
    setSessions(S); setTrades(T); setTasks(K);

    const fresh = new Set<string>([
      ...S.filter((s) => !s.seen_by_student).map((s) => s.id),
      ...T.filter((t) => !t.seen_by_student).map((t) => t.id),
      ...K.filter((k) => !k.seen_by_student).map((k) => k.id),
      ...M.filter((m) => !m.seen_by_student).map((m) => m.id),
    ]);
    setNewIds(fresh);

    // לשונית פתיחה חכמה - מה שהכי דחוף עכשיו
    if (M.some((m) => !m.seen_by_student)) setTab('messages');
    else if (T.some((t) => !t.seen_by_student)) setTab('journal');
    else if (K.some((k) => k.status === 'returned' || (!k.seen_by_student && k.status === 'open'))) setTab('tasks');
    else if (S.some((s) => !s.seen_by_student)) setTab('lessons');

    setLoading(false);
  }

  // סימון "ראיתי" - רק לתלמיד/ה עצמו/ה, לא כשהאדמין צופה
  async function markTradeSeen(t: MentoringTrade) {
    if (readOnly || t.seen_by_student) return;
    setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, seen_by_student: true } : x)));
    await supabase.from('mentoring_trades').update({ seen_by_student: true }).eq('id', t.id);
  }
  async function markSessionSeen(s: MentoringSession) {
    if (readOnly || s.seen_by_student) return;
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, seen_by_student: true } : x)));
    await supabase.from('mentoring_sessions').update({ seen_by_student: true }).eq('id', s.id);
  }
  useEffect(() => {
    if (tab !== 'messages' || readOnly) return;
    const unseen = messages.filter((m) => !m.seen_by_student);
    if (!unseen.length) return;
    setMessages((prev) => prev.map((m) => ({ ...m, seen_by_student: true })));
    supabase.from('mentoring_messages').update({ seen_by_student: true }).in('id', unseen.map((m) => m.id)).then(() => {});
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'tasks' || readOnly) return;
    const unseen = tasks.filter((k) => !k.seen_by_student);
    if (!unseen.length) return;
    setTasks((prev) => prev.map((k) => ({ ...k, seen_by_student: true })));
    supabase.from('mentoring_tasks').update({ seen_by_student: true }).in('id', unseen.map((k) => k.id)).then(() => {});
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleTask(k: MentoringTask) {
    if (readOnly || k.status === 'approved') return;
    const status = k.status === 'done' ? 'open' : 'done';
    const note = taskNotes[k.id] ?? k.student_note ?? '';
    const { data } = await supabase.from('mentoring_tasks').update({ status, student_note: note || null }).eq('id', k.id).select().single();
    if (data) {
      setTasks((prev) => prev.map((x) => (x.id === k.id ? (data as MentoringTask) : x)));
      if (status === 'done') notify('task_done', k.title);
    }
  }

  async function deleteTrade(t: MentoringTrade) {
    if (!confirm('למחוק את העסקה מהיומן?')) return;
    const { error } = await supabase.from('mentoring_trades').delete().eq('id', t.id);
    if (!error) {
      setTrades((prev) => prev.filter((x) => x.id !== t.id));
      if (t.chart_paths?.length) supabase.storage.from('mentoring').remove(t.chart_paths).then(() => {});
    }
  }

  const stats = useMemo(() => journalStats(trades), [trades]);
  const unseenComments = trades.filter((t) => !t.seen_by_student).length;
  const unseenSessions = sessions.filter((s) => !s.seen_by_student).length;
  const unseenMessages = messages.filter((m) => !m.seen_by_student).length;
  const activeTasks = tasks.filter((k) => k.status === 'open' || k.status === 'returned');
  const returnedTasks = tasks.filter((k) => k.status === 'returned');

  if (loading) return <div className="wrap"><p style={{ padding: 40, textAlign: 'center' }}>טוענים...</p></div>;

  if (!userId) {
    return (
      <div className="wrap">
        <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          צריך להתחבר קודם. <Link href="/login" style={{ color: 'var(--teal)' }}>כניסה</Link>
        </p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/account" className="nav-link">האזור האישי</Link>
        </header>
        <div className="mt-empty" style={{ paddingTop: 60 }}>
          האזור הזה פתוח למי שבליווי האישי של שירן.<br />
          <Link href="/mentoring" style={{ color: 'var(--teal)' }}>לפרטים על הליווי האישי ←</Link>
        </div>
      </div>
    );
  }

  const left = daysLeft(student.ends_at);
  const nextLesson = sessions.length + 1;

  let nextStep: { text: React.ReactNode; tab: Tab } | null = null;
  if (unseenMessages) nextStep = { text: <><b>הודעה חדשה משירן</b> - {messages.find((m) => !m.seen_by_student)?.title}</>, tab: 'messages' };
  else if (unseenComments) nextStep = { text: <><b>שירן הגיבה על {unseenComments === 1 ? 'עסקה' : `${unseenComments} עסקאות`}</b> - שווה לקרוא לפני העסקה הבאה</>, tab: 'journal' };
  else if (returnedTasks.length) nextStep = { text: <><b>משימה חזרה לתיקון</b> - {returnedTasks[0].title}</>, tab: 'tasks' };
  else if (unseenSessions) nextStep = { text: <><b>הקלטת השיעור עלתה</b> - יחד עם סיכום ונקודות מפתח</>, tab: 'lessons' };
  else if (activeTasks.length) nextStep = { text: <><b>המשימה הבאה שלך:</b> {activeTasks[activeTasks.length - 1].title}{activeTasks[activeTasks.length - 1].due_date ? ` (עד ${fmtDate(activeTasks[activeTasks.length - 1].due_date)})` : ''}</>, tab: 'tasks' };
  else if (!trades.some((t) => !t.is_example)) nextStep = { text: <><b>התחלה טובה:</b> הוסף/י את העסקה הראשונה ליומן - כל עסקה שנכנסת, אני עוברת עליה</>, tab: 'journal' };

  return (
    <div className="wrap mt-page">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href={readOnly ? `/admin/mentoring?student=${userId}` : '/account'} className="nav-link">{readOnly ? '← חזרה לניהול' : '← האזור האישי'}</Link>
      </header>

      {readOnly && <div className="mt-chip warm" style={{ marginBottom: 10 }}>👁 תצוגת תלמיד/ה - צפייה בלבד</div>}

      <div className="mt-hero">
        <ProgressRing done={sessions.length} total={student.total_sessions} />
        <div>
          <h1>{firstName ? `הליווי של ${firstName}` : 'הליווי האישי שלי'}</h1>
          <p>
            {student.track_label}
            {left != null ? ` · עוד ${left} ימים` : ''}
            {sessions.length < student.total_sessions ? ` · הבא: שיעור ${nextLesson}` : ' · כל השיעורים הושלמו 🎉'}
          </p>
          {student.goal && <p style={{ color: 'var(--lavender)' }}>🎯 {student.goal}</p>}
        </div>
      </div>

      {nextStep && (
        <div className="mt-next" role="button" tabIndex={0} onClick={() => setTab(nextStep!.tab)} onKeyDown={(e) => e.key === 'Enter' && setTab(nextStep!.tab)}>
          {nextStep.text}
        </div>
      )}

      <div className={`mt-tabs${messages.length ? ' four' : ''}`} role="tablist">
        <button role="tab" aria-selected={tab === 'journal'} className={`mt-tab${tab === 'journal' ? ' active' : ''}`} onClick={() => setTab('journal')}>
          יומן{unseenComments > 0 && <span className="mt-badge">{unseenComments}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'lessons'} className={`mt-tab${tab === 'lessons' ? ' active' : ''}`} onClick={() => setTab('lessons')}>
          שיעורים{unseenSessions > 0 && <span className="mt-badge">{unseenSessions}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'tasks'} className={`mt-tab${tab === 'tasks' ? ' active' : ''}`} onClick={() => setTab('tasks')}>
          משימות{activeTasks.length > 0 && <span className="mt-badge">{activeTasks.length}</span>}
        </button>
        {messages.length > 0 && (
          <button role="tab" aria-selected={tab === 'messages'} className={`mt-tab${tab === 'messages' ? ' active' : ''}`} onClick={() => setTab('messages')}>
            הודעות{unseenMessages > 0 && <span className="mt-badge">{unseenMessages}</span>}
          </button>
        )}
      </div>

      {tab === 'journal' && (
        <>
          {!readOnly && (showForm || editing) && (
            <TradeForm
              userId={userId}
              defaultInstrument={student.instruments || 'MNQ'}
              defaultStyle={student.default_style || 'swing'}
              riskLimit={student.risk_usd != null ? Number(student.risk_usd) : null}
              initial={editing}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onSaved={(t, isNew) => {
                setTrades((prev) => (isNew ? [t, ...prev] : prev.map((x) => (x.id === t.id ? t : x))));
                setShowForm(false); setEditing(null);
                if (isNew) notify('trade_submitted', `${t.instrument} ${t.direction === 'long' ? 'לונג' : 'שורט'} · ${fmtUsd(t.pnl_usd)} · ${fmtR(t.r_multiple)}`);
              }}
            />
          )}

          {trades.length === 0 && !showForm ? (
            <>
              {!readOnly && <button className="mt-add" onClick={() => setShowForm(true)}>＋ הוספת עסקה ליומן</button>}
              <div className="mt-empty">היומן עוד ריק.<br />כל עסקה שתיכנס לכאן - שירן עוברת עליה ומשאירה הערה.</div>
            </>
          ) : (
            <JournalView
              trades={trades}
              newIds={newIds}
              riskLimit={student.risk_usd != null ? Number(student.risk_usd) : null}
              goalMonthly={student.goal_monthly_usd != null ? Number(student.goal_monthly_usd) : null}
              onOpenTrade={(t) => markTradeSeen(t)}
              top={!(showForm || editing) ? (
                readOnly
                  ? <button className="mt-add" disabled style={{ opacity: 0.6, cursor: 'default', marginBottom: 0 }}>＋ הוספת עסקה ליומן · כאן מתחיל/ה התלמיד/ה</button>
                  : <button className="mt-add" style={{ marginBottom: 0 }} onClick={() => setShowForm(true)}>＋ הוספת עסקה ליומן</button>
              ) : null}
              renderFooter={(t, close) => (!readOnly && !t.is_example && (!t.reviewed_at || t.exit_price == null) ? (
                <div className="mt-actions">
                  <button className="mt-btn-ghost" onClick={() => { close(); setEditing(t); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t.exit_price == null ? 'עדכון / סגירת עסקה' : 'עריכה'}</button>
                  {!t.reviewed_at && <button className="mt-btn-ghost" onClick={() => { close(); deleteTrade(t); }}>מחיקה</button>}
                </div>
              ) : null)}
            />
          )}
        </>
      )}

      {tab === 'messages' && (
        <div className="mt-msgs">
          {messages.map((m) => (
            <div key={m.id} className={`mt-msg${newIds.has(m.id) ? ' new' : ''}`}>
              <div className="mt-msg-h">
                <span className="mt-avatar" style={{ width: 28, height: 28, fontSize: 13 }}>ש</span>
                <b>{m.title}</b>
                <span className="mj-sub" style={{ marginInlineStart: 'auto' }}>{new Date(m.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'lessons' && (
        <>
          <StudentProfileCard student={student} />
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} isNew={newIds.has(s.id)} defaultOpen={newIds.has(s.id)} onOpen={() => markSessionSeen(s)} />
          ))}
          {Array.from({ length: Math.max(0, student.total_sessions - sessions.length) }).map((_, i) => (
            <div key={i} className="mt-card mt-locked">
              <div className="mt-card-head" style={{ cursor: 'default' }}>
                <span className="mt-lesson-num">{sessions.length + i + 1}</span>
                <div className="mt-sub">{i === 0 ? 'השיעור הבא - ההקלטה תעלה לכאן אחרי השיעור' : 'בהמשך הדרך'}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'tasks' && (
        <>
          {tasks.length === 0 && <div className="mt-empty">אין משימות כרגע.<br />משימות משירן יופיעו כאן אחרי כל שיעור.</div>}
          {tasks.map((k) => {
            const meta = TASK_STATUS_META[k.status];
            const checked = k.status === 'done' || k.status === 'approved';
            return (
              <div key={k.id} className={`mt-card${newIds.has(k.id) || k.status === 'returned' ? ' new' : ''}`}>
                <div className="mt-card-head" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <button
                    className={`mt-check${checked ? ' on' : ''}`}
                    onClick={() => toggleTask(k)}
                    disabled={readOnly || k.status === 'approved'}
                    aria-label={checked ? 'סימון כלא בוצע' : 'סימון כבוצע'}
                    style={{ cursor: readOnly || k.status === 'approved' ? 'default' : 'pointer', background: checked ? undefined : 'none' }}
                  >{checked ? '✓' : ''}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textDecoration: k.status === 'approved' ? 'line-through' : undefined, opacity: k.status === 'approved' ? 0.7 : 1 }}>{k.title}</div>
                    {k.details && <div className="mt-text" style={{ marginTop: 4 }}>{k.details}</div>}
                    <div className="mt-sub" style={{ marginTop: 6 }}>{k.due_date ? `עד ${fmtDate(k.due_date)}` : `ניתנה ${fmtDate(k.created_at)}`}</div>
                    {k.coach_note && (
                      <div className="mt-coach" style={{ marginTop: 8 }}>
                        <div className="mt-coach-head">💬 שירן</div>
                        <p>{k.coach_note}</p>
                      </div>
                    )}
                    {!readOnly && (k.status === 'open' || k.status === 'returned') && (
                      <textarea
                        className="mt-textarea"
                        style={{ minHeight: 48, marginTop: 8 }}
                        placeholder="הערה לשירן (לא חובה) - מה עשית, מה היה קשה"
                        value={taskNotes[k.id] ?? k.student_note ?? ''}
                        onChange={(e) => setTaskNotes((p) => ({ ...p, [k.id]: e.target.value }))}
                      />
                    )}
                    {k.student_note && k.status !== 'open' && k.status !== 'returned' && <div className="mt-text"><b>ההערה שלי: </b>{k.student_note}</div>}
                  </div>
                  <span className="mt-status" style={{ color: meta.color }}>{meta.label}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
