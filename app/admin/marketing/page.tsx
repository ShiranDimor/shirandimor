'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Platform = 'instagram' | 'facebook' | 'both';
type ContentType = 'feed_post' | 'reel' | 'story';
type Status = 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';

type Post = {
  id: string;
  platform: Platform;
  content_type: ContentType;
  topic: string;
  hook: string;
  caption: string;
  hashtags: string;
  video_script: string;
  visual_idea: string;
  status: Status;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  source_type: 'manual' | 'trade' | 'whatsapp';
  image_base64: string | null;
  extra_image_base64: string | null;
  external_post_id: string | null;
};

type BrandVoice = {
  tone_notes: string;
  sample_posts: string;
  avoid_notes: string;
};

type TradeSource = {
  id: string;
  symbol: string;
  direction: string;
  openedAt: string;
  closedAt: string;
  pct: number;
};

type WhatsappLatest = {
  id: string;
  group_type: string;
  message_count: number | null;
  created_at: string;
};

const WHATSAPP_GROUP_LABEL: Record<string, string> = { סוחרים: 'קבוצת הסוחרים', עדכונים: 'קבוצת העדכונים' };
const SOURCE_ICON: Record<Post['source_type'], string> = { trade: '📈', whatsapp: '💬', manual: '✍️' };

const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'אינסטגרם', facebook: 'פייסבוק', both: 'שתיהן' };
const CONTENT_TYPE_LABEL: Record<ContentType, string> = { feed_post: 'פוסט פיד', reel: 'רילס', story: 'סטורי' };
const STATUS_LABEL: Record<Status, string> = { draft: 'טיוטה', approved: 'מאושר', scheduled: 'מתוזמן', published: 'פורסם', archived: 'בארכיון' };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminMarketingPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [brandVoice, setBrandVoice] = useState<BrandVoice>({ tone_notes: '', sample_posts: '', avoid_notes: '' });
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceSavedMsg, setVoiceSavedMsg] = useState('');

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [contentType, setContentType] = useState<ContentType>('feed_post');
  const [topic, setTopic] = useState('');
  const [variantCount, setVariantCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<Record<string, string>>({});

  const [tradeSources, setTradeSources] = useState<TradeSource[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState('');
  const [generatingTrade, setGeneratingTrade] = useState(false);
  const [tradeGenError, setTradeGenError] = useState('');

  const [whatsappLatest, setWhatsappLatest] = useState<WhatsappLatest | null>(null);
  const [generatingWhatsapp, setGeneratingWhatsapp] = useState(false);
  const [whatsappGenError, setWhatsappGenError] = useState('');

  useEffect(() => {
    checkAdmin();
  }, []);

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` };
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadBrandVoice();
      loadPosts();
      loadTradeSources();
      loadWhatsappLatest();
    }
  }

  async function loadTradeSources() {
    const res = await fetch('/api/admin/marketing/sources/trades', { headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setTradeSources(data.trades || []);
      setSelectedTradeId(data.trades?.[0]?.id || '');
    }
  }

  async function loadWhatsappLatest() {
    const res = await fetch('/api/admin/marketing/sources/whatsapp-latest', { headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setWhatsappLatest(data.latest || null);
    }
  }

  async function handleGenerateFromTrade() {
    if (!selectedTradeId) return;
    setGeneratingTrade(true);
    setTradeGenError('');
    try {
      const res = await fetch('/api/admin/marketing/generate-trade', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ tradeId: selectedTradeId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setTradeGenError(data?.error || 'שגיאה ביצירת התוכן');
      } else {
        setStatusFilter('draft');
        await Promise.all([loadPosts(), loadTradeSources()]);
      }
    } catch {
      setTradeGenError('שגיאה בשליחת הבקשה');
    }
    setGeneratingTrade(false);
  }

  async function handleGenerateFromWhatsapp() {
    setGeneratingWhatsapp(true);
    setWhatsappGenError('');
    try {
      const res = await fetch('/api/admin/marketing/generate-whatsapp', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setWhatsappGenError(data?.error || 'שגיאה ביצירת התוכן');
      } else {
        setStatusFilter('draft');
        await loadPosts();
      }
    } catch {
      setWhatsappGenError('שגיאה בשליחת הבקשה');
    }
    setGeneratingWhatsapp(false);
  }

  async function loadBrandVoice() {
    const res = await fetch('/api/admin/marketing/brand-voice', { headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setBrandVoice({
        tone_notes: data.brandVoice?.tone_notes || '',
        sample_posts: data.brandVoice?.sample_posts || '',
        avoid_notes: data.brandVoice?.avoid_notes || '',
      });
    }
  }

  async function loadPosts() {
    setLoadingPosts(true);
    const res = await fetch('/api/admin/marketing/posts', { headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts || []);
    }
    setLoadingPosts(false);
  }

  async function handleSaveVoice() {
    setSavingVoice(true);
    setVoiceSavedMsg('');
    const res = await fetch('/api/admin/marketing/brand-voice', {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify({ toneNotes: brandVoice.tone_notes, samplePosts: brandVoice.sample_posts, avoidNotes: brandVoice.avoid_notes }),
    });
    setVoiceSavedMsg(res.ok ? 'נשמר' : 'שגיאה בשמירה');
    setSavingVoice(false);
    setTimeout(() => setVoiceSavedMsg(''), 2500);
  }

  async function handleGenerate() {
    if (!topic.trim()) { setGenError('צריך לכתוב נושא/בריף קצר'); return; }
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/admin/marketing/posts', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ platform, contentType, topic, variantCount }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setGenError(data?.error || 'שגיאה ביצירת התוכן');
      } else {
        setTopic('');
        setStatusFilter('draft');
        await loadPosts();
      }
    } catch {
      setGenError('שגיאה בשליחת הבקשה');
    }
    setGenerating(false);
  }

  async function updatePost(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/marketing/posts/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === id ? data.post : p)));
    }
  }

  async function deletePost(id: string) {
    if (!confirm('למחוק את הטיוטה הזו?')) return;
    const res = await fetch(`/api/admin/marketing/posts/${id}`, { method: 'DELETE', headers: await authHeaders() });
    if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleUploadExtraImage(postId: string, file: File) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(`/api/admin/marketing/posts/${postId}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ extraImageBase64: base64 }),
    });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
    }
  }

  async function handleRemoveExtraImage(postId: string) {
    const res = await fetch(`/api/admin/marketing/posts/${postId}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ extraImageBase64: null }),
    });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
    }
  }

  async function handleCopy(post: Post) {
    const text = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // אין הרשאת clipboard (למשל דפדפן חוסם) - שקט, שירן פשוט תסמן ותעתיק ידנית
    }
  }

  async function handlePublishFacebook(postId: string) {
    if (!confirm('לפרסם את הפוסט הזה בפועל לעמוד הפייסבוק שלך עכשיו? זו פעולה שמפרסמת החוצה, לא ניתן לבטל.')) return;
    setPublishingId(postId);
    setPublishError((prev) => ({ ...prev, [postId]: '' }));
    try {
      const res = await fetch('/api/admin/marketing/publish-facebook', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ postId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setPublishError((prev) => ({ ...prev, [postId]: data?.error || 'שגיאה בפרסום' }));
      } else {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
      }
    } catch {
      setPublishError((prev) => ({ ...prev, [postId]: 'שגיאה בשליחת הבקשה' }));
    }
    setPublishingId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const filteredPosts = statusFilter === 'all' ? posts : posts.filter((p) => p.status === statusFilter);

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

      <div className="section-label"><h2>פרופיל הקול שלך</h2></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '14px', lineHeight: 1.6 }}>
        ככל שתתני יותר דוגמאות אמיתיות ותיאור מדויק - כך ה-AI יתרחק מניסוח שיווקי גנרי ויישמע יותר כמוך. אפשר להדביק כאן גם ציטוטים מהוואטסאפ או מפוסטים ישנים שאהבת.
      </p>
      <div className="journal-form">
        <div className="field">
          <label>איך הטון שלך נשמע (למי מדברת, מה מאפיין אותך, מה שונה אצלך)</label>
          <textarea
            value={brandVoice.tone_notes}
            onChange={(e) => setBrandVoice((v) => ({ ...v, tone_notes: e.target.value }))}
            rows={4}
            placeholder="למשל: ישירה, כנה, לא מוכרת חלומות, מדברת כמו חברה שמבינה בשוק..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        <div className="field">
          <label>דוגמאות פוסטים/הודעות אמיתיות שלך (אפשר כמה, מופרדות בשורה ריקה)</label>
          <textarea
            value={brandVoice.sample_posts}
            onChange={(e) => setBrandVoice((v) => ({ ...v, sample_posts: e.target.value }))}
            rows={6}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        <div className="field">
          <label>דברים שממש לא רוצים (ביטויים, טון, סוג תוכן)</label>
          <textarea
            value={brandVoice.avoid_notes}
            onChange={(e) => setBrandVoice((v) => ({ ...v, avoid_notes: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        <button className="btn-primary" onClick={handleSaveVoice} disabled={savingVoice}>
          {savingVoice ? 'שומרים...' : 'שמירת פרופיל הקול'}
        </button>
        {voiceSavedMsg && <p style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--profit)' }}>{voiceSavedMsg}</p>}
      </div>

      <div className="section-label" style={{ marginTop: '30px' }}><h2>יצירת תוכן חדש</h2></div>

      <div className="journal-form" style={{ borderRightColor: 'var(--profit)' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px', fontWeight: 600 }}>📈 עסקה שנסגרה</label>
        {tradeSources.length === 0 ? (
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>אין כרגע עסקאות סגורות בתיק שעדיין לא נוצר להן פוסט.</p>
        ) : (
          <>
            <select
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', marginBottom: '10px' }}
            >
              {tradeSources.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol} · {t.direction === 'short' ? 'שורט' : 'לונג'} · {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(1)}% · נסגרה {formatDateTime(t.closedAt)}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleGenerateFromTrade} disabled={generatingTrade}>
              {generatingTrade ? 'יוצרים תוכן... זה יכול לקחת רגע' : 'צור תוכן מהעסקה הזו'}
            </button>
            {tradeGenError && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--loss)' }}>{tradeGenError}</p>}
          </>
        )}
      </div>

      <div className="journal-form" style={{ borderRightColor: 'var(--teal)' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px', fontWeight: 600 }}>💬 תוכן מקצועי מוואטסאפ</label>
        {!whatsappLatest ? (
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
            עדיין אין העלאת וואטסאפ לשלוף ממנה - צריך להעלות ייצוא צ׳אט קודם ב<Link href="/admin/whatsapp-analysis" style={{ color: 'var(--teal)' }}>עמוד ניתוח קבוצות ווטסאפ</Link>.
          </p>
        ) : (
          <>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
              המקור: {WHATSAPP_GROUP_LABEL[whatsappLatest.group_type] || whatsappLatest.group_type} · הועלה {formatDateTime(whatsappLatest.created_at)} - ה-AI יבחר לבד נקודה מעניינת ושונה מפעם קודמת.
            </p>
            <button className="btn-primary" onClick={handleGenerateFromWhatsapp} disabled={generatingWhatsapp}>
              {generatingWhatsapp ? 'יוצרים תוכן... זה יכול לקחת רגע' : 'צור תוכן מקצועי'}
            </button>
            {whatsappGenError && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--loss)' }}>{whatsappGenError}</p>}
          </>
        )}
      </div>

      <details className="section-collapse" style={{ marginBottom: '20px' }}>
        <summary><h2 style={{ fontSize: '14px' }}>יצירה ידנית / מותאמת אישית</h2></summary>
      <div className="journal-form" style={{ marginTop: '10px' }}>
        <div className="toggle-row">
          {(['instagram', 'facebook', 'both'] as Platform[]).map((p) => (
            <div key={p} className={`toggle-opt ${platform === p ? 'long-active' : ''}`} onClick={() => setPlatform(p)} style={{ cursor: 'pointer' }}>
              {PLATFORM_LABEL[p]}
            </div>
          ))}
        </div>
        <div className="toggle-row" style={{ marginTop: '8px' }}>
          {(['feed_post', 'reel', 'story'] as ContentType[]).map((c) => (
            <div key={c} className={`toggle-opt ${contentType === c ? 'short-active' : ''}`} onClick={() => setContentType(c)} style={{ cursor: 'pointer' }}>
              {CONTENT_TYPE_LABEL[c]}
            </div>
          ))}
        </div>

        <div className="field" style={{ marginTop: '12px' }}>
          <label>על מה הפוסט (נושא, מסר, או בריף חופשי)</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            placeholder="למשל: למה חשוב לקבוע סטופ לוס לפני כניסה לעסקה, ולא אחרי"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <div className="field">
          <label>כמה גרסאות לבחור מהן (1-3)</label>
          <select
            value={variantCount}
            onChange={(e) => setVariantCount(Number(e.target.value))}
            style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px' }}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>

        <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'יוצרים תוכן... זה יכול לקחת רגע' : 'יצירת טיוטה'}
        </button>
        {genError && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--loss)' }}>{genError}</p>}
      </div>
      </details>

      <div className="section-label" style={{ marginTop: '30px' }}>
        <h2>התור שלך</h2>
        <span className="count">{filteredPosts.length}</span>
      </div>

      <div className="toggle-row" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '6px' }}>
        {(['all', 'draft', 'approved', 'scheduled', 'published', 'archived'] as (Status | 'all')[]).map((s) => (
          <div
            key={s}
            className={`toggle-opt ${statusFilter === s ? 'long-active' : ''}`}
            onClick={() => setStatusFilter(s)}
            style={{ cursor: 'pointer', flex: '1 1 auto', minWidth: '70px' }}
          >
            {s === 'all' ? 'הכל' : STATUS_LABEL[s]}
          </div>
        ))}
      </div>

      {loadingPosts && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingPosts && filteredPosts.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין פוסטים במצב הזה</p>}

      {filteredPosts.map((post) => (
        <details key={post.id} className="section-collapse" style={{ marginBottom: '10px' }}>
          <summary>
            <div>
              <h2 style={{ fontSize: '14px' }}>
                {SOURCE_ICON[post.source_type]} {post.hook || post.topic || '(ללא כותרת)'}
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                {PLATFORM_LABEL[post.platform]} · {CONTENT_TYPE_LABEL[post.content_type]} · {STATUS_LABEL[post.status]} · {formatDateTime(post.created_at)}
              </p>
            </div>
          </summary>

          <div style={{ padding: '10px 4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>בריף: {post.topic}</p>

            {post.image_base64 && (
              <div>
                <img
                  src={`data:image/png;base64,${post.image_base64}`}
                  alt="כרטיס גרפי"
                  style={{ width: '100%', maxWidth: '320px', borderRadius: '10px', border: '1px solid var(--border-hairline-strong)', display: 'block', marginBottom: '8px' }}
                />
                <a
                  href={`data:image/png;base64,${post.image_base64}`}
                  download={`${post.topic.slice(0, 30).replace(/[^\w֐-׿]+/g, '-')}.png`}
                  style={{ fontSize: '12px', color: 'var(--teal)' }}
                >
                  הורדת התמונה
                </a>
              </div>
            )}

            <div className="field">
              <label>תמונה נוספת (למשל צילום מסך אמיתי מהקבוצה) - יפורסם כפוסט עם שתי תמונות</label>
              {post.extra_image_base64 ? (
                <div>
                  <img
                    src={`data:image/png;base64,${post.extra_image_base64}`}
                    alt="תמונה נוספת"
                    style={{ width: '100%', maxWidth: '320px', borderRadius: '10px', border: '1px solid var(--border-hairline-strong)', display: 'block', marginBottom: '8px' }}
                  />
                  <button
                    className="nav-link"
                    style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', padding: 0, fontSize: '12px' }}
                    onClick={() => handleRemoveExtraImage(post.id)}
                  >
                    הסרת התמונה הנוספת
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadExtraImage(post.id, file);
                  }}
                  style={{ fontSize: '12.5px' }}
                />
              )}
            </div>

            <div className="field">
              <label>הוק (פתיחה)</label>
              <textarea
                value={post.hook}
                onChange={(e) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, hook: e.target.value } : p)))}
                onBlur={(e) => updatePost(post.id, { hook: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div className="field">
              <label>טקסט הפוסט (caption)</label>
              <textarea
                value={post.caption}
                onChange={(e) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, caption: e.target.value } : p)))}
                onBlur={(e) => updatePost(post.id, { caption: e.target.value })}
                rows={8}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', whiteSpace: 'pre-wrap' }}
              />
            </div>

            <div className="field">
              <label>האשטגים</label>
              <textarea
                value={post.hashtags}
                onChange={(e) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, hashtags: e.target.value } : p)))}
                onBlur={(e) => updatePost(post.id, { hashtags: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            {post.content_type === 'reel' && (
              <div className="field">
                <label>סקריפט לסרטון</label>
                <textarea
                  value={post.video_script}
                  onChange={(e) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, video_script: e.target.value } : p)))}
                  onBlur={(e) => updatePost(post.id, { video_script: e.target.value })}
                  rows={6}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            )}

            <div className="field">
              <label>רעיון ויזואלי (לצילום/עריכה)</label>
              <textarea
                value={post.visual_idea}
                onChange={(e) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, visual_idea: e.target.value } : p)))}
                onBlur={(e) => updatePost(post.id, { visual_idea: e.target.value })}
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={post.status}
                onChange={(e) => updatePost(post.id, { status: e.target.value })}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px' }}
              >
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>

              <input
                type="datetime-local"
                defaultValue={post.scheduled_at ? post.scheduled_at.slice(0, 16) : ''}
                onBlur={(e) => updatePost(post.id, { scheduledAt: e.target.value || null })}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12.5px' }}
              />

              <button className="nav-link" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }} onClick={() => handleCopy(post)}>
                {copiedId === post.id ? 'הועתק!' : 'העתקת טקסט'}
              </button>

              {post.status !== 'published' && (
                <button
                  className="nav-link"
                  style={{ background: 'var(--profit-bg)', border: '1px solid var(--profit)', color: 'var(--profit)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}
                  onClick={() => handlePublishFacebook(post.id)}
                  disabled={publishingId === post.id}
                >
                  {publishingId === post.id ? 'מפרסמים...' : 'פרסום בפועל לפייסבוק'}
                </button>
              )}

              <button className="nav-link" style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', marginRight: 'auto' }} onClick={() => deletePost(post.id)}>
                מחיקה
              </button>
            </div>
            {publishError[post.id] && <p style={{ fontSize: '12px', color: 'var(--loss)' }}>{publishError[post.id]}</p>}
            {post.status === 'published' && post.external_post_id && (
              <a href={`https://www.facebook.com/${post.external_post_id}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--teal)' }}>
                לצפייה בפוסט שפורסם בפייסבוק ←
              </a>
            )}
          </div>
        </details>
      ))}

      <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '24px', lineHeight: 1.6 }}>
        כפתור "פרסום בפועל לפייסבוק" מפרסם ישירות לעמוד שלך דרך Meta Graph API - רק אחרי שאת לוחצת עליו במפורש, אף פוסט לא יוצא לבד. כדי שזה יעבוד, צריך לחבר את עמוד הפייסבוק פעם אחת (META_PAGE_ID ו-META_PAGE_ACCESS_TOKEN ב-Vercel).
      </p>
    </div>
  );
}
