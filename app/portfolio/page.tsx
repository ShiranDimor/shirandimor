'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase, getResilientUser } from '@/lib/supabase';
import { hasActiveEntitlement } from '@/lib/entitlement';
import ClearableInput from '@/components/ClearableInput';
import StatsRing from '@/components/StatsRing';
import EquityCurve from '@/components/EquityCurve';
import CalendarHeatmap from '@/components/CalendarHeatmap';
import PushNotificationButton from '@/components/PushNotificationButton';
import Reveal from '@/components/Reveal';
import MonthlyReturnBubbles from '@/components/MonthlyReturnBubbles';
import { buildMonthlyPortfolioReturns } from '@/lib/portfolioStats';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  max_entry_price: number | null;
  target_price: number | null;
  current_price: number | null;
  exit_price: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  shares_calculated: number | null;
  realized_pnl_usd: number | null;
};

const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[parseInt(month, 10) - 1]} ${year}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [openMonthFilter, setOpenMonthFilter] = useState('all');
  const [profitMonthFilter, setProfitMonthFilter] = useState(currentMonthKey);
  const [lossMonthFilter, setLossMonthFilter] = useState(currentMonthKey);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonthIdx, setCalMonthIdx] = useState(() => new Date().getMonth());

  const [risk, setRisk] = useState('');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [tradingPlanHref, setTradingPlanHref] = useState('/trading-plan');

  useEffect(() => {
    load();

    // רענון כשחוזרים לדף - אחרת מי שהדף הזה היה פתוח לו (למשל ברקע, או שהגיע אליו קודם ועבר
    // לאפליקציה אחרת) וחוזר אחרי שעסקה נפתחה/נסגרה במקביל (כולל סגירה אוטומטית בסטופ לוס,
    // שגם שולחת על זה התראה), ימשיך לראות את נתוני התיק הישנים שנטענו לפני השינוי - בדיוק
    // כמו שתוקן בעמוד לוח המודעות
    function refreshIfVisible() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('pageshow', refreshIfVisible);

    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'refresh-data') load();
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowStickyCta(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function load() {
    try {
      fetch('/api/refresh-prices').catch(() => {});

      let accessToken: string | undefined;

      try {
        // getResilientUser נופל חזרה ל-session המקומי אם האימות מול השרת נכשל (רשת חלשה,
        // למשל מיד אחרי לחיצה על התראת פוש) - וגם אם משהו עדיין נכשל כאן, זה לא אמור
        // לחסום את שאר העמוד (כולל התיק הציבורי) מלהיטען, ר' catch בפנים
        const user = await getResilientUser();

        if (user) {
          setLoggedIn(true);
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, subscription_status, subscription_paid_until, full_name, phone, email')
            .eq('id', user.id)
            .single();
          setHasFullAccess(hasActiveEntitlement(profile));
          setIsAdmin(profile?.role === 'admin');

          const prefillParams = new URLSearchParams();
          if (profile?.full_name) prefillParams.set('prefillName', profile.full_name);
          if (profile?.phone) prefillParams.set('prefillPhone', profile.phone);
          if (profile?.email) prefillParams.set('prefillEmail', profile.email);
          setTradingPlanHref(`/trading-plan?${prefillParams.toString()}`);

          const { data: { session } } = await supabase.auth.getSession();
          accessToken = session?.access_token;
          if (accessToken) {
            fetch('/api/trading-plan/my-link', { headers: { Authorization: `Bearer ${accessToken}` } })
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => { if (data?.id) setTradingPlanHref(`/my-plan/${data.id}`); })
              .catch(() => {});
          }
        }
      } catch (authErr) {
        console.error('portfolio auth check failed', authErr);
      }

      // נתוני התיק (כולל סימבולים של עסקאות פתוחות) עוברים דרך /api/portfolio/trades ולא
      // דרך קריאה ישירה מהדפדפן לטבלת trades - כדי שהזכאות (מנוי פעיל?) תיבדק בצד השרת
      // ושהטשטוש של סימבולים למי שאינו זכאי יהיה אכיפה אמיתית, לא רק עיצוב ב-UI
      // פרמטר _t משתנה בכל קריאה (לא רק cache:'no-store') - קו הגנה נוסף נגד כל שכבת קאשינג
      // שעלולה להתייחס לכתובת כמפתח קבוע (CDN, התקנה כאפליקציה במסך הבית וכו') ולהתעלם
      // מכותרות Cache-Control; זה הופך כל קריאה לכתובת שונה בפועל, אז שום קאש לא יכול "להכיר" אותה
      const res = await fetch(`/api/portfolio/trades?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error('שגיאה בטעינת נתוני התיק');
      const { open, closed, initialBalance: fetchedInitialBalance, hasFullAccess: serverFullAccess } = await res.json();

      if (open) setOpenTrades(open);
      if (closed) setClosedTrades(closed);
      if (fetchedInitialBalance !== null && fetchedInitialBalance !== undefined) setInitialBalance(Number(fetchedInitialBalance));
      if (typeof serverFullAccess === 'boolean') setHasFullAccess(serverFullAccess);
    } catch (e) {
      // בלי try/catch כאן, כל שגיאה (רשת, מפתח שגוי וכו') הייתה משאירה את הדף תקוע על "טוענים..." לנצח בלי שום הודעה
      console.error('portfolio load failed', e);
      setLoadError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  function pct(trade: Trade) {
    const current = trade.status === 'open' ? trade.current_price : trade.exit_price;
    if (!current) return 0;
    return ((current - trade.entry_price) / trade.entry_price) * 100 * (trade.direction === 'short' ? -1 : 1);
  }

  // ממפה כל מחיר למיקום באחוזים על פס שמייצג את הטווח המלא בין הסטופ ליעד (0% = סטופ, 100% =
  // יעד) - בלונג stop<entry<target, בשורט target<entry<stop, אז הכיוון של החישוב הפוך בין השניים.
  // clamp ל-[0,100] כדי שסמנים לא "יברחו" חזותית מחוץ לפס גם כשהמחיר חרג מעבר לסטופ/ליעד בפועל
  function targetProgress(trade: Trade) {
    const current = trade.current_price ?? trade.entry_price;
    const { entry_price: entry, stop_loss: stop, target_price: target, direction } = trade;
    if (target === null) return null;

    const isShort = direction === 'short';
    const span = isShort ? stop - target : target - stop;
    if (!span) return null;

    const posPct = (price: number) => {
      const raw = isShort ? ((stop - price) / span) * 100 : ((price - stop) / span) * 100;
      return Math.min(100, Math.max(0, raw));
    };

    const entryPos = posPct(entry);
    const currentPos = posPct(current);
    const rewardSpan = isShort ? entry - target : target - entry;
    const pctToTarget = rewardSpan ? ((isShort ? entry - current : current - entry) / rewardSpan) * 100 : 0;
    const inProfitZone = isShort ? current <= entry : current >= entry;

    return { entryPos, currentPos, pctToTarget, inProfitZone };
  }

  const availableOpenMonths = Array.from(
    new Set(openTrades.map((t) => monthKey(t.opened_at)))
  ).sort().reverse();

  const availableClosedMonths = Array.from(
    new Set([currentMonthKey(), ...closedTrades.filter((t) => t.closed_at).map((t) => monthKey(t.closed_at as string))])
  ).sort().reverse();

  const filteredOpenTrades = openMonthFilter === 'all'
    ? openTrades
    : openTrades.filter((t) => monthKey(t.opened_at) === openMonthFilter);

  const allClosedProfit_ = closedTrades.filter((t) => pct(t) >= 0);
  const allClosedLoss_ = closedTrades.filter((t) => pct(t) < 0);

  const closedProfitTrades = profitMonthFilter === 'all'
    ? allClosedProfit_
    : allClosedProfit_.filter((t) => t.closed_at && monthKey(t.closed_at) === profitMonthFilter);

  const closedLossTrades = lossMonthFilter === 'all'
    ? allClosedLoss_
    : allClosedLoss_.filter((t) => t.closed_at && monthKey(t.closed_at) === lossMonthFilter);

  // "תובנות התיק" מציגות נתוני כל-הזמנים, לא רק החודש שמוצג בלוח השנה - שירן ביקשה מפורשות
  // להסיר את הסינכרון לחודש הנבחר כדי שהמבקרים יראו תמיד את התמונה המלאה
  const closedTradesForInsights = closedTrades;

  const closedProfitForInsights = closedTradesForInsights.filter((t) => pct(t) >= 0).length;
  const winRate = closedTradesForInsights.length > 0 ? (closedProfitForInsights / closedTradesForInsights.length) * 100 : null;

  const closedPcts = closedTradesForInsights.map((t) => pct(t));
  const avgPnlPct = closedPcts.length > 0 ? closedPcts.reduce((s, x) => s + x, 0) / closedPcts.length : null;

  const winPcts = closedPcts.filter((p) => p >= 0);
  const lossPcts = closedPcts.filter((p) => p < 0);
  const avgWinPct = winPcts.length > 0 ? winPcts.reduce((s, x) => s + x, 0) / winPcts.length : 0;
  const avgLossPct = lossPcts.length > 0 ? Math.abs(lossPcts.reduce((s, x) => s + x, 0) / lossPcts.length) : 0;
  const riskReward = avgLossPct > 0 ? avgWinPct / avgLossPct : null;

  const daysToClose = closedTradesForInsights
    .filter((t) => t.closed_at)
    .map((t) => (new Date(t.closed_at as string).getTime() - new Date(t.opened_at).getTime()) / 86400000);
  const avgDaysToClose = daysToClose.length > 0 ? daysToClose.reduce((s, x) => s + x, 0) / daysToClose.length : null;

  const totalTradesCount = openTrades.length + closedTrades.length;

  // רצועת "חודשים אחרונים" שמופיעה לפני לוח השנה - 3 החודשים האחרונים, כדי שהרושם הראשון
  // כשנכנסים לתיק יהיה מגמה כללית ולא חודש בודד שעלול להיראות אדום בלוח השנה. הפונקציה
  // המשותפת (lib/portfolioStats) היא גם זו שמזינה את עמוד הבית - כדי ששני המקומות תמיד
  // יראו בדיוק את אותו מספר לאותו חודש
  const monthlyTrend = buildMonthlyPortfolioReturns(closedTrades, initialBalance, 3);

  // כאן, בניגוד לעמוד הניהול, מציגים את הצמיחה רק באחוזים ולא בסכום דולרי - כדי לא לחשוף
  // את גודל התיק האמיתי בכסף לכל מי שנכנס לעמוד הציבורי
  const equityPoints = (() => {
    if (initialBalance === null) return [];
    const chronological = closedTrades
      .filter((t) => t.closed_at)
      .slice()
      .sort((a, b) => new Date(a.closed_at as string).getTime() - new Date(b.closed_at as string).getTime());
    let running = initialBalance;
    const toPct = (balance: number) => Math.round(((balance - initialBalance) / initialBalance) * 1000) / 10;
    const points = [{ date: 'התחלה', value: toPct(running) }];
    for (const t of chronological) {
      running += t.realized_pnl_usd ?? 0;
      points.push({ date: formatDate(t.closed_at), value: toPct(running) });
    }
    return points;
  })();

  const calItems = closedTrades
    .filter((t) => {
      if (!t.closed_at) return false;
      const d = new Date(t.closed_at);
      return d.getFullYear() === calYear && d.getMonth() === calMonthIdx;
    })
    .map((t) => {
      const cost = t.entry_price * (t.shares_calculated ?? 0);
      const usd = t.realized_pnl_usd ?? 0;
      return {
        day: new Date(t.closed_at as string).getDate(),
        symbol: t.symbol,
        direction: t.direction,
        usd,
        pct: cost > 0 ? (usd / cost) * 100 : 0,
      };
    });

  // גבולות ניווט בלוח השנה - אין סיבה לאפשר לדפדף לחודשים שלפני העסקה הסגורה הראשונה
  // או אחרי החודש הנוכחי, גם אם אין שם שום עסקה
  const closedMonthKeysSorted = Array.from(
    new Set(closedTrades.filter((t) => t.closed_at).map((t) => monthKey(t.closed_at as string)))
  ).sort();
  const earliestMonthKey = closedMonthKeysSorted[0] ?? currentMonthKey();
  const latestMonthKey = currentMonthKey();
  const calMonthKey = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}`;
  const canGoPrevMonth = calMonthKey > earliestMonthKey;
  const canGoNextMonth = calMonthKey < latestMonthKey;

  function goPrevMonth() {
    if (!canGoPrevMonth) return;
    if (calMonthIdx === 0) { setCalYear((y) => y - 1); setCalMonthIdx(11); }
    else setCalMonthIdx((m) => m - 1);
  }

  function goNextMonth() {
    if (!canGoNextMonth) return;
    if (calMonthIdx === 11) { setCalYear((y) => y + 1); setCalMonthIdx(0); }
    else setCalMonthIdx((m) => m + 1);
  }

  const shares = risk && entry && stop
    ? Math.floor(parseFloat(risk) / Math.abs(parseFloat(entry) - parseFloat(stop)))
    : null;

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  if (loadError) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <p style={{ marginBottom: '10px' }}>לא הצלחנו לטעון את התיק כרגע.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        {loggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href="/" className="nav-link">בית</Link>
            {hasFullAccess && !isAdmin && <Link href="/account" className="nav-link">האזור האישי שלי</Link>}
            {hasFullAccess && !isAdmin && <Link href="/journal" className="nav-link">היומן שלי</Link>}
            {hasFullAccess && !isAdmin && <Link href={tradingPlanHref} className="nav-link" style={{ color: '#E8A33D' }}>תוכנית המסחר שלי</Link>}
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href="/" className="nav-link">בית</Link>
            <Link href="/login" className="nav-link">כניסה לסוחרים</Link>
          </div>
        )}
      </header>

      <div className="section-label"><h2>התיק של שירן</h2></div>

      <PushNotificationButton />

      {!hasFullAccess && (
        <div className="lock-banner">
          <div className="lb-icon">🔒</div>
          <div className="lb-text">
            <p className="lb-title">יש כאן עסקאות אמיתיות, אבל הן שמורות למנויים</p>
            <p className="lb-sub">הסימבולים מוסתרים כדי לשמור על פרטיות המנויים - ההצטרפות פותחת גישה לתמונה המלאה: מספרים אמיתיים, כולל הפסדים, ותיק השקעות שאתם בונים <strong style={{ color: 'var(--lavender)' }}>לצדי</strong>.</p>
          </div>
          <div className="lb-cta-row">
            <Link href="/#step2-full-access" className="lb-cta">לגישה מלאה ←</Link>
            <Link href="/?join=1" className="lb-cta-secondary">הצטרפות חינם לעדכונים ←</Link>
          </div>
        </div>
      )}

      {hasFullAccess && (
        <>
          <div className="section-label"><h2>מחשבון גודל פוזיציה</h2></div>
          <div className="calc-panel" style={{ padding: '18px 16px', marginBottom: '28px' }}>
            <div className="form-row" style={{ marginBottom: '10px' }}>
              <div className="field" style={{ marginBottom: 0 }}><label>סיכון כספי ($)</label><ClearableInput type="number" value={risk} onChange={(e) => setRisk(e.target.value)} onClear={() => setRisk('')} placeholder="500" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה ($)</label><ClearableInput type="number" value={entry} onChange={(e) => setEntry(e.target.value)} onClear={() => setEntry('')} placeholder="127.32" /></div>
            </div>
            <div className="field"><label>מחיר סטופ לוס ($)</label><ClearableInput type="number" value={stop} onChange={(e) => setStop(e.target.value)} onClear={() => setStop('')} placeholder="121.00" /></div>
            <div className="calc-result">
              <span className="rlabel">כמות מניות מקסימלית</span>
              <span className="rvalue">{shares !== null && !isNaN(shares) ? shares : '—'}</span>
            </div>
          </div>
        </>
      )}

      <Reveal>
        <div className="section-label"><h2>צמיחת התיק של שירן</h2></div>
        <div className="equity-card">
          <EquityCurve points={equityPoints} prefix="" suffix="%" showDelta={false} />
        </div>
      </Reveal>

      {monthlyTrend.length > 0 && (
        <Reveal delay={60}>
          <div className="section-label" style={{ marginTop: '26px' }}><h2>רווח על תיק ההשקעות - 3 החודשים האחרונים</h2></div>
          <MonthlyReturnBubbles months={monthlyTrend} />
          <p style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '8px' }}>רווח/הפסד בפועל על התיק באותו חודש, לפי חודש שבו העסקה נסגרה - כולל ההפסדים.</p>
        </Reveal>
      )}

      <div id="portfolio-story-area">
        <Reveal delay={100}>
          <div className="section-label" style={{ marginTop: '26px' }}><h2>תובנות התיק של שירן - כל הזמנים</h2></div>
          <div className="insights-panel" style={{ marginBottom: '28px' }}>
            <div className="insights-ring-row">
              <StatsRing
                percent={winRate ?? 0}
                label={`${closedTradesForInsights.length} עסקאות סגורות`}
                sublabel="ב-3 החודשים האחרונים"
              />
            </div>
            <div className="insight-grid">
              <div className="insight-tile">
                <div className="iv">{avgDaysToClose !== null ? avgDaysToClose.toFixed(1) : '—'}</div>
                <div className="il">ימי החזקה בממוצע</div>
              </div>
              <div className="insight-tile">
                <div className="iv" style={{ color: avgPnlPct !== null ? (avgPnlPct >= 0 ? 'var(--profit)' : 'var(--loss)') : undefined }}>
                  {avgPnlPct !== null ? `${avgPnlPct >= 0 ? '+' : ''}${avgPnlPct.toFixed(2)}%` : '—'}
                </div>
                <div className="il">רווח/הפסד ממוצע לעסקה</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{riskReward !== null ? `1:${riskReward.toFixed(1)}` : '—'}</div>
                <div className="il">יחס סיכון-סיכוי</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{totalTradesCount}</div>
                <div className="il">סה&quot;כ עסקאות</div>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="section-label"><h2>לוח שנה</h2></div>
        <div className="equity-card" style={{ marginBottom: '28px' }}>
          {availableClosedMonths.length > 1 && (
            <div className="month-select-wrap" style={{ marginBottom: '14px' }}>
              <select
                className="month-select"
                value={`${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setCalYear(y);
                  setCalMonthIdx(m - 1);
                }}
              >
                {availableClosedMonths.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>
          )}
          <CalendarHeatmap year={calYear} month={calMonthIdx} items={calItems} onPrevMonth={goPrevMonth} onNextMonth={goNextMonth} canGoPrev={canGoPrevMonth} canGoNext={canGoNextMonth} hideUsd />
        </div>
      </div>

      <details className="section-collapse">
        <summary>
          <h2>עסקאות פתוחות</h2>
          <div className="summary-right"><span className="count">{filteredOpenTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableOpenMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={openMonthFilter} onChange={(e) => setOpenMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableOpenMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {filteredOpenTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות פתוחות בטווח הזה</p>
        ) : (
          <div className="tpc-list">
            {filteredOpenTrades.map((trade) => {
              const p = pct(trade);
              const tp = targetProgress(trade);
              const displayPct = tp ? tp.pctToTarget : p;
              const isPositive = tp ? tp.inProfitZone : p >= 0;
              const glowColor = isPositive ? 'rgba(61,220,132,0.8)' : 'rgba(255,92,92,0.8)';
              const dotBg = isPositive ? 'rgba(61,220,132,0.35)' : 'rgba(255,92,92,0.35)';

              return (
                <div key={trade.id} className={`tpc-card ${isPositive ? 'win' : 'lose'}`}>
                  <div className="tpc-glow"></div>
                  <div className="tpc-inner">
                    <div className="tpc-head">
                      <div className="tpc-sym-wrap">
                        <div className="tpc-sym">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <b className={!hasFullAccess ? 'trade-symbol blurred' : ''}>{trade.symbol}</b>
                          {!hasFullAccess && <span className="locked-tag">למנויים</span>}
                        </div>
                        <div className="tpc-live">
                          <span className="tpc-live-dot" style={{ background: isPositive ? 'var(--profit)' : 'var(--loss)', boxShadow: `0 0 5px ${isPositive ? 'var(--profit)' : 'var(--loss)'}` }}></span>
                          ${trade.current_price ?? trade.entry_price}
                        </div>
                      </div>
                      <div className="tpc-pct-wrap">
                        <div className={`tpc-pct ${displayPct >= 0 ? 'pos' : 'neg'}`}>{displayPct < 0 ? '-' : ''}{Math.abs(displayPct).toFixed(0)}%</div>
                        <div className="tpc-pct-label">{tp ? (tp.inProfitZone ? 'מהרווח המתוכנן כבר הושג' : 'מתחת לכניסה') : 'רווח/הפסד נוכחי'}</div>
                      </div>
                    </div>

                    {tp && (
                      <div className="tpc-bar">
                        <div className="tpc-risk" style={{ width: `${tp.entryPos}%` }}></div>
                        {tp.inProfitZone && <div className="tpc-fill" style={{ right: `${tp.entryPos}%`, width: `${Math.max(0, tp.currentPos - tp.entryPos)}%` }}></div>}
                        <div className="tpc-flag">🏁</div>
                        <div className="tpc-stopcap"></div>
                        <div className="tpc-now-outer" style={{ right: `${tp.currentPos}%`, background: `radial-gradient(circle, ${dotBg}, transparent 70%)` }}></div>
                        <div className="tpc-now" style={{ right: `${tp.currentPos}%`, boxShadow: `0 0 0 2px var(--teal), 0 0 10px ${glowColor}` }}></div>
                      </div>
                    )}

                    <div className="tpc-foot">
                      <span>כניסה <b>${trade.entry_price}</b></span>
                      <span>
                        סטופ <b>${trade.stop_loss}</b>
                        {tp && <> · יעד <b>${trade.target_price}</b></>}
                        {!tp && trade.max_entry_price !== null && <> · עד כניסה <b>${trade.max_entry_price}</b></>}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </details>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>עסקאות סגורות</h2></div>

      <details className="section-collapse">
        <summary>
          <h2>נסגרו ברווח</h2>
          <div className="summary-right"><span className="count">{closedProfitTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableClosedMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={profitMonthFilter} onChange={(e) => setProfitMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableClosedMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {closedProfitTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות שנסגרו ברווח בטווח הזה</p>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>סימבול</th>
                  <th>נפתחה ב-</th>
                  <th>נסגרה ב-</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>רווח</th>
                </tr>
              </thead>
              <tbody>
                {closedProfitTrades.map((trade) => {
                  const p = pct(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="sym-cell">
                        <span className="sym-cell-inner">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <span>{trade.symbol}</span>
                        </span>
                      </td>
                      <td>{formatDate(trade.opened_at)}</td>
                      <td>{formatDate(trade.closed_at)}</td>
                      <td>${trade.entry_price}</td>
                      <td>${trade.exit_price}</td>
                      <td className="pnl-cell" style={{ color: 'var(--profit)' }}>{p >= 0 ? '+' : ''}{p.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="section-collapse">
        <summary>
          <h2>נסגרו בהפסד</h2>
          <div className="summary-right"><span className="count">{closedLossTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableClosedMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={lossMonthFilter} onChange={(e) => setLossMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableClosedMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {closedLossTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות שנסגרו בהפסד בטווח הזה</p>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>סימבול</th>
                  <th>נפתחה ב-</th>
                  <th>נסגרה ב-</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>הפסד</th>
                </tr>
              </thead>
              <tbody>
                {closedLossTrades.map((trade) => {
                  const p = pct(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="sym-cell">
                        <span className="sym-cell-inner">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <span>{trade.symbol}</span>
                        </span>
                      </td>
                      <td>{formatDate(trade.opened_at)}</td>
                      <td>{formatDate(trade.closed_at)}</td>
                      <td>${trade.entry_price}</td>
                      <td>${trade.exit_price}</td>
                      <td className="pnl-cell" style={{ color: 'var(--loss)' }}>{p.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {!hasFullAccess && showStickyCta && (
        <div className="sticky-cta">
          <Link href="/?join=1">הפעלת עדכונים בזמן אמת - ללא עלות</Link>
        </div>
      )}
    </div>
  );
}
