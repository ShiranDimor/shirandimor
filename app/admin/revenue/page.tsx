'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type SubscriberItem = {
  name: string | null;
  email: string | null;
  phone: string | null;
  joinDate: string | null;
  price: number;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export default function AdminRevenuePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [items, setItems] = useState<SubscriberItem[]>([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState<string[]>([]);
  const [missingMonthlyCost, setMissingMonthlyCost] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(true);

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
    if (profile?.role === 'admin') loadData();
  }

  async function loadData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/revenue-projection', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setCount(data.count || 0);
      setTotalAmount(data.totalAmount || 0);
      setItems(data.items || []);
      setDuplicatesRemoved(data.duplicatesRemoved || []);
      setMissingMonthlyCost(data.missingMonthlyCost || []);
    }
    setLoading(false);
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

      <div className="section-label"><h2>הכנסה מקבוצת הסוחרים</h2></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        כמות האנשים וסך העלות החודשית כפי שרשומים ממש עכשיו בקבוצת "קבוצת סוחרים" במאנדיי - מי שלא נמצא בקבוצה הזו לא נכלל בכלל.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && (
        <>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>₪{totalAmount.toLocaleString('he-IL')}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{count} אנשים בקבוצת הסוחרים</div>
          </div>

          <div
            className="section-label"
            style={{ marginTop: '10px', cursor: 'pointer' }}
            onClick={() => setListOpen((v) => !v)}
          >
            <h2 style={{ fontSize: '15px' }}>
              <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: listOpen ? 'rotate(90deg)' : 'rotate(0deg)', marginLeft: '4px' }}>›</span>
              הרשימה המלאה
            </h2>
            <span className="count">{count}</span>
          </div>
          {listOpen && items.map((u, i) => (
            <div key={i} className="admin-row">
              <div>
                <div className="name">{u.name || '—'}</div>
                <div className="email">{u.phone || u.email || '—'}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(u.joinDate)} · ₪{u.price}</div>
            </div>
          ))}

          {missingMonthlyCost.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--loss)', marginTop: '20px', lineHeight: 1.6 }}>
              אין עלות חודשית רשומה במאנדיי (חושב לפי ברירת מחדל 400 ₪): {missingMonthlyCost.join(', ')}
            </p>
          )}

          {duplicatesRemoved.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '10px', lineHeight: 1.6 }}>
              הוסרו מהחישוב ככפילויות (אותו טלפון/מייל מופיע כמה פעמים במאנדיי - נספר פעם אחת בלבד): {duplicatesRemoved.join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
