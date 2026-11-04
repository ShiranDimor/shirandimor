'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type ApprovedSub = {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  subscription_status: string | null;
  subscription_started_at: string | null;
  subscription_paid_until: string | null;
  hasPushSub: boolean;
};

type RevenueItem = { name: string | null; email: string | null; phone: string | null; joinDate: string | null; price: number };

function normalizePhoneLocal(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

function normalizeEmailLocal(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

export default function AdminSubscribersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [approvedSubs, setApprovedSubs] = useState<ApprovedSub[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'notifications'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [phoneSearch, setPhoneSearch] = useState('');

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [testPushing, setTestPushing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [fillingEmails, setFillingEmails] = useState(false);
  const [fillEmailsMessage, setFillEmailsMessage] = useState('');
  const [fillPreview, setFillPreview] = useState<{ name: string; email: string }[] | null>(null);

  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantName, setGrantName] = useState('');
  const [grantPhone, setGrantPhone] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState('');

  // סיכום ההכנסה (היה פעם עמוד נפרד "/admin/revenue") - עבר לכאן כי זו אותה אוכלוסייה בדיוק
  // (מי שבקבוצת הסוחרים במאנדיי הוא/היא בהכרח מנוי/ה משלם/ת), אין טעם בשתי רשימות נפרדות
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueRecomputing, setRevenueRecomputing] = useState(false);
  const [revenueCount, setRevenueCount] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [revenueMonth, setRevenueMonth] = useState('');
  const [revenueItems, setRevenueItems] = useState<RevenueItem[]>([]);
  const [revenueMissingCost, setRevenueMissingCost] = useState<string[]>([]);
  const [revenueError, setRevenueError] = useState('');

  function formatMonthLabel(month: string) {
    if (!month) return '';
    return new Date(`${month}T12:00:00`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  }

  async function loadRevenue(force = false) {
    force ? setRevenueRecomputing(true) : setRevenueLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/revenue-projection${force ? '?force=1' : ''}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      if (data.error) {
        setRevenueError(data.error);
        setRevenueMonth(data.month || '');
      } else {
        setRevenueError('');
        setRevenueCount(data.count || 0);
        setRevenueTotal(data.totalAmount || 0);
        setRevenueMonth(data.month || '');
        setRevenueItems(data.items || []);
        setRevenueMissingCost(data.missingMonthlyCost || []);
      }
    }
    setRevenueLoading(false);
    setRevenueRecomputing(false);
  }

  async function handleSyncSubscribers() {
    setSyncing(true);
    setSyncMessage('');

    const { data: { session } } = await supabase.auth.getSession();

    try {
      const res = await fetch('/api/sync-subscribers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        const diagText = (data.mondayPhonesCount !== undefined)
          ? ` [אבחון: מאנדיי החזיר ${data.mondayPhonesCount} טלפונים ו-${data.mondayEmailsCount} מיילים]`
          : '';
        const proposedText = data.proposedRemovals?.length > 0 ? ` מועמדים להסרה: ${data.proposedRemovals.join(', ')}` : '';
        setSyncMessage('שגיאה: ' + (data.error || 'לא הצלחנו לבדוק') + diagText + proposedText);
      } else {
        const removedText = data.removed > 0 ? ` (${data.removedNames.join(', ')})` : '';
        const createdText = data.created > 0 ? ` · ${data.created} נוספו ממאנדיי (${data.createdNames.join(', ')})` : '';
        const placeholderText = data.placeholderEmailNames?.length > 0
          ? ` · מתוכם ${data.placeholderEmailNames.length} בלי מייל במאנדיי (${data.placeholderEmailNames.join(', ')}) - נספרים כמנויים אבל לא יוכלו להתחבר בעצמם עד שיהיה להם מייל אמיתי`
          : '';
        const skippedNoContactText = data.skippedNoContact?.length > 0
          ? ` · ${data.skippedNoContact.length} בקבוצת הסוחרים במאנדיי בלי מייל ובלי טלפון בכלל, לא ניתן ליצור להם חשבון (${data.skippedNoContact.join(', ')})`
          : '';
        const unverifiedText = data.unverifiedNoPhone?.length > 0
          ? ` · ⚠️ ${data.unverifiedNoPhone.length} לא נמצאו במאנדיי לפי המייל שלהם אבל אין להם טלפון שמור כדי לוודא - לא הוסרו אוטומטית, כדאי לבדוק ידנית מול מאנדיי: ${data.unverifiedNoPhone.join(', ')}`
          : '';
        const diagText = ` [אבחון: מאנדיי - ${data.mondayTotalContacts} אנשים בקבוצה, ${data.mondayPhonesCount} טלפונים, ${data.mondayEmailsCount} מיילים]`;
        setSyncMessage(
          `נבדקו ${data.checked} מנויים · ${data.removed} הוסרו${removedText}${createdText}${placeholderText}` +
          (data.skippedNoPhone > 0 ? ` · ${data.skippedNoPhone} לא נבדקו (אין טלפון ואין מייל בפרופיל)` : '') +
          skippedNoContactText + unverifiedText + diagText
        );
        loadApprovedSubs();
      }
    } catch (e) {
      setSyncMessage('שגיאה בבדיקה מול מאנדיי');
    }

    setSyncing(false);
  }

  async function handleGrantSubscriber() {
    if (!grantName.trim() || !grantEmail.trim()) {
      setGrantMessage('חסר שם או מייל');
      return;
    }
    setGranting(true);
    setGrantMessage('');

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/grant-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ name: grantName.trim(), phone: grantPhone.trim(), email: grantEmail.trim() }),
    });
    const data = await res.json().catch(() => null);

    setGranting(false);

    if (res.ok) {
      setGrantMessage(`${grantName} נוסף/ה כמנוי/ה בהצלחה`);
      setGrantName('');
      setGrantPhone('');
      setGrantEmail('');
      loadApprovedSubs();
    } else {
      setGrantMessage('שגיאה: ' + (data?.error || 'לא הצלחנו להוסיף'));
    }
  }

  // השלמת מיילים חסרים במאנדיי: קודם תצוגה מקדימה בתוך העמוד, ורק אחרי לחיצה על "אישור" כותבים בפועל
  async function callFillMondayEmails(dryRun: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/monday-fill-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ dryRun }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'שגיאה');
    return data;
  }

  async function handlePreviewMondayEmails() {
    setFillingEmails(true);
    setFillEmailsMessage('');
    setFillPreview(null);
    try {
      const preview = await callFillMondayEmails(true);
      if (preview.filled.length === 0) {
        setFillEmailsMessage(`אין מה להשלים: ${preview.missingEmail} פריטים במאנדיי בלי מייל, ולאף אחד מהם אין מייל מוכר באתר לפי מספר הנייד.`);
      } else {
        setFillPreview(preview.filled);
      }
    } catch (e) {
      setFillEmailsMessage('שגיאה: ' + (e instanceof Error ? e.message : 'לא הצלחנו לבדוק'));
    }
    setFillingEmails(false);
  }

  async function handleConfirmMondayEmails() {
    setFillingEmails(true);
    try {
      const done = await callFillMondayEmails(false);
      setFillEmailsMessage(`עודכנו ${done.filled.length} מיילים במאנדיי.${done.failed.length ? ` נכשלו: ${done.failed.length}.` : ''} נשארו בלי מייל (אין מייל מוכר באתר): ${done.noMatchOnSite.length}.`);
      setFillPreview(null);
    } catch (e) {
      setFillEmailsMessage('שגיאה: ' + (e instanceof Error ? e.message : 'לא הצלחנו לעדכן'));
    }
    setFillingEmails(false);
  }

  async function cancelSubscription(id: string, name: string) {
    if (!window.confirm(`לבטל את חידוש המנוי של ${name}? הגישה שלו תישאר מלאה עד תום התקופה ששילם עליה כבר (לא נחתכת מיידית) - רק אז הוא יחזור להופיע ברשימת הלידים הרגילה.`)) return;
    setCancelling(id);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: id }),
    });

    setCancelling(null);
    if (res.ok) {
      const { paidUntil } = await res.json().catch(() => ({ paidUntil: null }));
      setApprovedSubs((prev) => prev.map((s) => (s.id === id ? { ...s, subscription_status: 'cancelling', subscription_paid_until: paidUntil } : s)));
    }
  }

  async function removeSubscriber(id: string, name: string) {
    if (!window.confirm(`למחוק לצמיתות את המנוי ${name}? הפעולה תסיר את הגישה שלו ואת כל נתוני היומן שלו.`)) return;
    setRemoving(id);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: id }),
    });

    setRemoving(null);
    if (res.ok) {
      loadApprovedSubs();
    }
  }

  // פותח וואטסאפ עם הודעה מוכנה מראש, בלי שליחה אוטומטית - שירן בודקת ולוחצת שליחה בעצמה
  function sendWhatsAppReminder(sub: ApprovedSub) {
    if (!sub.phone) return;
    const firstName = (sub.full_name || '').trim().split(' ')[0] || '';
    const text = `היי${firstName ? ' ' + firstName : ''}, שמתי לב שההתראות באתר אצלך לא מופעלות - ככה מפספסים עדכונים חשובים. כדאי להיכנס לאתר וללחוץ על הפעמון כדי להפעיל אותן מחדש.\n\nתודה!\nשירן`;
    const phoneDigits = sub.phone.replace(/\D/g, '').replace(/^0/, '972');
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, '_blank');
  }

  // שליחת התראת פוש אמיתית רק למנוי/ה הזה - לבדיקת תקלות מול אדם אחד ספציפי, בלי ליצור הודעה
  // בלוח המודעות ובלי לשלוח לאף אחד אחר
  async function sendTestPush(sub: ApprovedSub) {
    const text = window.prompt(`טקסט לבדיקה שתישלח רק ל${sub.full_name || sub.email} (לא תתפרסם בלוח המודעות):`, 'זוהי הודעת בדיקה מהמערכת');
    if (text === null) return;
    setTestPushing(sub.id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/subscribers/${sub.id}/test-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    setTestPushing(null);
    if (!res.ok) { window.alert(`השליחה נכשלה: ${data.error || 'שגיאה'}`); return; }
    if (data.configured === false) { window.alert('התראות פוש לא מוגדרות בשרת'); return; }
    if (data.attempted === 0) { window.alert('אין למנוי/ה הזה שום מכשיר רשום להתראות - לא נשלח כלום'); return; }
    window.alert(`נשלח בפועל ל-${data.sent} מתוך ${data.attempted} מכשירים${data.failed ? ` (${data.failed} נכשלו)` : ''}${data.removedStale ? ` · ${data.removedStale} הרשמות לא-תקפות הוסרו` : ''}`);
  }

  function toggleSort(col: 'date' | 'name' | 'notifications') {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      // 'asc' בהתראות = לא מופעל קודם (מי שצריך טיפול למעלה), לא לפי סדר א"ב
      setSortDir(col === 'name' ? 'asc' : col === 'notifications' ? 'asc' : 'desc');
    }
  }

  useEffect(() => {
    checkAdmin();
  }, []);

  async function loadApprovedSubs() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, phone, full_name, subscription_status, subscription_started_at, subscription_paid_until')
      .eq('role', 'subscriber')
      .neq('subscription_status', 'cancelled') // מי שכבר בוטל סופית (role נשאר subscriber בכוונה, ר' lib/entitlement.ts) לא שייך לרשימת המנויים הפעילים
      .eq('excluded_from_subscriber_list', false) // מנויים שהוענקו ידנית מחוץ למאנדיי (למשל בני משפחה) - לא נספרים כאן כדי שהמספר יישאר תואם לקבוצת הסוחרים במאנדיי, אבל נשארים מנויים מלאים בכל מקום אחר
      .order('subscription_started_at', { ascending: false });
    if (!data) return;

    // מי מהם יש לו/ה כרגע הרשמה פעילה להתראות פוש (באיזשהו מכשיר) - כדי שאפשר יהיה לראות
    // ברשימה עצמה מי "מנוי על הנייר" אבל בפועל לא יקבל/ה שום התראה
    const { data: pushRows } = await supabase.from('push_subscriptions').select('user_id').in('user_id', data.map((d) => d.id)).is('invalid_at', null);
    const withPush = new Set((pushRows || []).map((r) => r.user_id).filter(Boolean));

    setApprovedSubs(data.map((d) => ({ ...d, hasPushSub: withPush.has(d.id) })));
  }

  async function refreshApprovedSubs() {
    setRefreshing(true);
    await loadApprovedSubs();
    setRefreshing(false);
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setChecking(false);
      return;
    }

    setUserEmail(user.email || '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadApprovedSubs();
      loadRevenue();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const phoneSearchDigits = phoneSearch.replace(/\D/g, '');
  const filteredSubs = phoneSearchDigits
    ? approvedSubs.filter((sub) => normalizePhoneLocal(sub.phone).includes(phoneSearchDigits))
    : approvedSubs;

  const sortedSubs = [...filteredSubs].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') {
      return dir * (a.full_name || a.email).localeCompare(b.full_name || b.email, 'he');
    }
    if (sortBy === 'notifications') {
      if (a.hasPushSub === b.hasPushSub) return (a.full_name || a.email).localeCompare(b.full_name || b.email, 'he');
      return dir * (Number(a.hasPushSub) - Number(b.hasPushSub));
    }
    return dir * (new Date(a.subscription_started_at || 0).getTime() - new Date(b.subscription_started_at || 0).getTime());
  });

  // התאמת סכום לכל מנוי/ה (ממאנדיי, לפי טלפון קודם ומייל כגיבוי) - כדי להציג שם וסכום
  // באותה שורה, בלי שתצטרכי לקפוץ בין שתי רשימות נפרדות כדי לדעת מי משלם כמה
  const priceByPhone = new Map<string, number>();
  const priceByEmail = new Map<string, number>();
  for (const item of revenueItems) {
    if (item.phone) priceByPhone.set(normalizePhoneLocal(item.phone), item.price);
    if (item.email) priceByEmail.set(normalizeEmailLocal(item.email), item.price);
  }
  function priceFor(sub: ApprovedSub): number | null {
    const byPhone = sub.phone ? priceByPhone.get(normalizePhoneLocal(sub.phone)) : undefined;
    if (byPhone !== undefined) return byPhone;
    const byEmail = priceByEmail.get(normalizeEmailLocal(sub.email));
    return byEmail !== undefined ? byEmail : null;
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

      <div className="section-label">
        <h2>הכנסה מקבוצת הסוחרים{revenueMonth ? ` - ${formatMonthLabel(revenueMonth)}` : ''}</h2>
      </div>
      {revenueLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>טוענים...</p>
      ) : revenueError ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--loss)', borderRadius: '12px', padding: '18px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--loss)' }}>⚠️ לא הצלחנו לחשב כרגע</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>{revenueError}</div>
          <button className="btn-outline" style={{ width: 'auto', marginTop: '12px', fontSize: '12px', padding: '6px 14px' }} onClick={() => loadRevenue(true)} disabled={revenueRecomputing}>
            {revenueRecomputing ? 'מרעננים...' : 'ניסיון נוסף'}
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '12px', padding: '18px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>₪{revenueTotal.toLocaleString('he-IL')}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>(אחרי מע&quot;מ 18%: ₪{Math.round(revenueTotal * 0.82).toLocaleString('he-IL')})</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '6px' }}>{revenueCount} אנשים בקבוצת הסוחרים</div>
          <button className="btn-outline" style={{ width: 'auto', marginTop: '12px', fontSize: '12px', padding: '6px 14px' }} onClick={() => loadRevenue(true)} disabled={revenueRecomputing}>
            {revenueRecomputing ? 'מרעננים...' : 'רענון'}
          </button>
        </div>
      )}

      {/* מי שעדיין אין לו/ה "עלות חודשית" שמורה מהסנכרון היומי מול מאנדיי (חשבון חדש שעוד לא
          עבר סנכרון, או שהעמודה ריקה במאנדיי) - נספר/ת כרגע לפי מחיר ברירת המחדל (400) */}
      {revenueMissingCost.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px', marginTop: '-10px' }}>
          <p>⚠️ בלי "עלות חודשית" שמורה עדיין (נספרו כ-400 בינתיים): {revenueMissingCost.join(', ')}</p>
        </div>
      )}

      <div className="section-label">
        <h2>מנויים מאושרים</h2>
        <span className="count">{approvedSubs.length}</span>
        {approvedSubs.filter((s) => !s.hasPushSub).length > 0 && (
          <span style={{ fontSize: '11.5px', color: 'var(--loss)', fontWeight: 700, marginRight: '8px' }}>
            🔕 {approvedSubs.filter((s) => !s.hasPushSub).length} לא הפעילו
          </span>
        )}
        <button
          type="button"
          onClick={refreshApprovedSubs}
          disabled={refreshing}
          title="רענון סטטוס ההתראות של כל המנויים"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px', padding: 0, color: 'var(--text-tertiary)' }}
        >
          {refreshing ? '…' : '🔄'}
        </button>
      </div>

      <button className="btn-outline" style={{ width: '100%', marginBottom: '14px' }} onClick={handleSyncSubscribers} disabled={syncing}>
        {syncing ? 'מסנכרנים מול מאנדיי...' : '🔄 סנכרון מלא מול קבוצת הסוחרים במאנדיי'}
      </button>
      {syncMessage && (
        <p style={{ fontSize: '12px', color: syncMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--text-secondary)', marginBottom: '14px', textAlign: 'center' }}>
          {syncMessage}
        </p>
      )}

      <details style={{ marginBottom: '20px' }} open={showGrantForm}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }} onClick={(e) => { e.preventDefault(); setShowGrantForm((v) => !v); }}>
          ➕ הוספת מנוי/ה ידנית (לא דרך מאנדיי - למשל לניסיון)
        </summary>
        <div className="journal-form" style={{ marginTop: '10px' }}>
          <div className="field"><label>שם מלא</label><ClearableInput type="text" value={grantName} onChange={(e) => setGrantName(e.target.value)} onClear={() => setGrantName('')} placeholder="גיל דיקסטרו" /></div>
          <div className="form-row">
            <div className="field"><label>טלפון</label><ClearableInput type="tel" value={grantPhone} onChange={(e) => setGrantPhone(e.target.value)} onClear={() => setGrantPhone('')} placeholder="0542000214" /></div>
            <div className="field"><label>מייל</label><ClearableInput type="email" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} onClear={() => setGrantEmail('')} placeholder="name@example.com" /></div>
          </div>
          <button className="btn-primary" onClick={handleGrantSubscriber} disabled={granting}>{granting ? 'מוסיפים...' : 'הוספה כמנוי/ה'}</button>
          {grantMessage && <p style={{ marginTop: '10px', fontSize: '13px', color: grantMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--profit)' }}>{grantMessage}</p>}
        </div>
      </details>

      <button className="btn-outline" style={{ width: '100%', marginBottom: '16px' }} onClick={handlePreviewMondayEmails} disabled={fillingEmails}>
        {fillingEmails && !fillPreview ? 'בודקים מול מאנדיי...' : '📧 השלמת מיילים חסרים במאנדיי (לפי המיילים שיש באתר)'}
      </button>
      {fillPreview && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', marginBottom: '8px' }}>
            נמצאו {fillPreview.length} אנשים במאנדיי בלי מייל, שיש להם מייל באתר (לפי מספר נייד). זה מה שייכתב במאנדיי:
          </p>
          <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            {fillPreview.map((f, i) => (
              <div key={i}>{f.name} ← <span dir="ltr">{f.email}</span></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmMondayEmails} disabled={fillingEmails}>
              {fillingEmails ? 'מעדכנים...' : `✅ אישור - לעדכן ${fillPreview.length} מיילים במאנדיי`}
            </button>
            <button className="btn-outline" onClick={() => setFillPreview(null)} disabled={fillingEmails}>ביטול</button>
          </div>
        </div>
      )}
      {fillEmailsMessage && (
        <p style={{ fontSize: '12px', color: fillEmailsMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px', textAlign: 'center' }}>
          {fillEmailsMessage}
        </p>
      )}

      <details className="section-collapse">
        <summary>
          <h2>📋 הצגת רשימת המנויים</h2>
          <div className="summary-right">
            <span className="count">{approvedSubs.length}</span>
            <span className="collapse-chevron">▾</span>
          </div>
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <ClearableInput
        type="tel"
        value={phoneSearch}
        onChange={(e) => setPhoneSearch(e.target.value)}
        onClear={() => setPhoneSearch('')}
        placeholder="חיפוש לפי מספר נייד"
        style={{ marginBottom: '6px' }}
      />
      <div className="sort-header">
        <div className={`sort-col ${sortBy === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>
          שם <span className="sort-arrow">{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
        <div className={`sort-col ${sortBy === 'date' ? 'active' : ''}`} onClick={() => toggleSort('date')}>
          תאריך הצטרפות <span className="sort-arrow">{sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
        <div className={`sort-col ${sortBy === 'notifications' ? 'active' : ''}`} onClick={() => toggleSort('notifications')}>
          התראות <span className="sort-arrow">{sortBy === 'notifications' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
      </div>

      {approvedSubs.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>עדיין אין מנויים מאושרים</p>}
      {approvedSubs.length > 0 && sortedSubs.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>לא נמצא מנוי עם המספר הזה</p>}
      {sortedSubs.map((sub) => (
        <div className="admin-row" key={sub.id} style={{ gap: '10px' }}>
          <Link href={`/admin/subscribers/${sub.id}`} style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div>
              <div className="name">
                {sub.full_name || 'ללא שם'}{' '}
                <span
                  title={sub.hasPushSub ? 'יש הרשמה פעילה להתראות פוש' : 'אין הרשמה פעילה להתראות פוש - לא יקבל/תקבל התראות'}
                  style={{ fontSize: '11px', color: sub.hasPushSub ? 'var(--profit)' : 'var(--loss)' }}
                >
                  {sub.hasPushSub ? '🔔' : '🔕'}
                </span>
              </div>
              <div className="email">{sub.email}</div>
              {sub.phone && <div className="email" style={{ marginTop: '2px' }}>{sub.phone}</div>}
              <div className="email" style={{ marginTop: '2px' }}>
                תאריך הצטרפות: {sub.subscription_started_at ? new Date(sub.subscription_started_at).toLocaleDateString('he-IL') : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'left', flexShrink: 0 }}>
              {sub.subscription_status === 'cancelling' ? (
                <div style={{ fontSize: '11px', color: 'var(--loss)', fontWeight: 700 }}>
                  מבטל/ת - גישה עד {sub.subscription_paid_until ? new Date(sub.subscription_paid_until).toLocaleDateString('he-IL') : '—'}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--profit)', fontWeight: 700 }}>{sub.subscription_status === 'active' ? 'פעיל' : sub.subscription_status}</div>
              )}
              {priceFor(sub) !== null && (
                <div style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                  ₪{priceFor(sub)!.toLocaleString('he-IL')}
                </div>
              )}
            </div>
          </Link>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            {!sub.hasPushSub && sub.phone && (
              <button
                className="btn-outline"
                style={{ padding: '5px 10px', fontSize: '11px', whiteSpace: 'nowrap', color: '#25D366', borderColor: '#25D366' }}
                onClick={() => sendWhatsAppReminder(sub)}
                title="שליחת תזכורת בוואטסאפ להפעיל התראות"
              >
                🔔 תזכורת
              </button>
            )}
            <button
              className="btn-outline"
              style={{ padding: '5px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
              onClick={() => sendTestPush(sub)}
              disabled={testPushing === sub.id}
              title="שליחת התראת בדיקה אמיתית רק למנוי/ה הזה - לא מתפרסם בלוח המודעות"
            >
              {testPushing === sub.id ? '…' : '📤 בדיקה'}
            </button>
            <button
              className="btn-outline"
              style={{ padding: '5px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
              onClick={() => cancelSubscription(sub.id, sub.full_name || sub.email)}
              disabled={cancelling === sub.id}
              title="ביטול מנוי - מאבד גישה, נתונים נשארים"
            >
              {cancelling === sub.id ? '…' : 'ביטול מנוי'}
            </button>
            <button
              className="row-delete-btn"
              onClick={() => removeSubscriber(sub.id, sub.full_name || sub.email)}
              disabled={removing === sub.id}
              title="מחיקת חשבון לצמיתות"
            >
              {removing === sub.id ? '…' : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ))}
        </div>
      </details>
    </div>
  );
}
