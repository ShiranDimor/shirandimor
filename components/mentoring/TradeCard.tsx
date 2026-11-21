'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { STYLE_LABEL, VERDICT_META, fmtDate, fmtR, fmtUsd, isOpenTrade, pointValue, type MentoringTrade } from '@/lib/mentoring';

// צילומי הגרף ב-bucket פרטי - מייצרים כתובות חתומות לשעה, רק כשהכרטיס נפתח
function useSignedUrls(paths: string[], enabled: boolean) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('mentoring').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!cancelled) setUrls((data || []).map((d) => d.signedUrl).filter(Boolean) as string[]);
    });
    return () => { cancelled = true; };
  }, [paths.join('|'), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

const FUTURES = ['MNQ', 'NQ', 'MES', 'ES', 'MGC'];

function fmtPrice(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// "מפת העסקה" - כל המחירים על קו אחד: אזור הסיכון (סטופ←כניסה) באדום, אזור היעד (כניסה←יעד)
// בירוק, והיציאה בפועל כנקודה. רואים במבט אחד את התוכנית מול הביצוע
function TradeMap({ t }: { t: MentoringTrade }) {
  const pts = [t.stop_price, t.entry_price, t.target_price, t.exit_price].filter((v): v is number => v != null);
  if (t.entry_price == null || pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 6; // אחוזים בכל צד כדי שהתוויות לא ייחתכו
  const pos = (v: number) => pad + ((v - min) / span) * (100 - pad * 2);
  const seg = (a: number, b: number) => ({ left: `${pos(Math.min(a, b))}%`, width: `${Math.abs(pos(a) - pos(b))}%` });
  const win = t.pnl_usd != null && t.pnl_usd > 0;

  const marks: { v: number; label: string; cls: string; up: boolean }[] = [];
  if (t.stop_price != null) marks.push({ v: t.stop_price, label: 'סטופ', cls: 'stop', up: false });
  marks.push({ v: t.entry_price, label: 'כניסה', cls: 'entry', up: true });
  if (t.target_price != null) marks.push({ v: t.target_price, label: 'יעד', cls: 'target', up: false });
  if (t.exit_price != null) marks.push({ v: t.exit_price, label: 'יציאה', cls: win ? 'exit win' : 'exit loss', up: true });

  return (
    <div className="mt-map" aria-label="מפת העסקה">
      <div className="mt-map-track">
        {t.stop_price != null && <div className="mt-map-risk" style={seg(t.stop_price, t.entry_price)} />}
        {t.target_price != null && <div className="mt-map-reward" style={seg(t.entry_price, t.target_price)} />}
        {marks.map((m) => (
          <div key={m.label} className={`mt-map-mark ${m.cls}`} style={{ left: `${pos(m.v)}%` }}>
            <div className={`mt-map-label ${m.up ? 'up' : 'down'}`}>
              <span>{m.label}</span>
              <b>{fmtPrice(m.v)}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// גוף העסקה המלא (מפה, משבצות, הערות, צילומים, משוב) - משמש גם בכרטיס הנפתח וגם בחלון העסקה ביומן
export function tradeTone(trade: MentoringTrade) {
  if (isOpenTrade(trade)) return 'open';
  if (trade.pnl_usd == null) return 'flat';
  return trade.pnl_usd > 0 ? 'win' : trade.pnl_usd < 0 ? 'loss' : 'flat';
}

export function TradeDetail({ trade, footer }: { trade: MentoringTrade; footer?: ReactNode }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const urls = useSignedUrls(trade.chart_paths || [], true);
  const verdict = trade.coach_verdict ? VERDICT_META[trade.coach_verdict] : null;
  const isOpen = isOpenTrade(trade);
  const riskUsd = trade.entry_price != null && trade.stop_price != null
    ? Math.round(Math.abs(trade.entry_price - trade.stop_price) * (trade.contracts || 1) * pointValue(trade.instrument))
    : null;
  const plannedRR = trade.entry_price != null && trade.stop_price != null && trade.target_price != null && trade.entry_price !== trade.stop_price
    ? Math.round((Math.abs(trade.target_price - trade.entry_price) / Math.abs(trade.entry_price - trade.stop_price)) * 10) / 10
    : null;

  return (
    <>
          <TradeMap t={trade} />

          <div className="mt-tiles">
            <div className="mt-tile">
              <span>סיכון</span>
              <b>{riskUsd != null ? `$${riskUsd}` : '—'}</b>
              <small>{trade.contracts} {FUTURES.includes(trade.instrument) ? 'חוזים' : 'מניות'}</small>
            </div>
            <div className="mt-tile">
              <span>יחס מתוכנן</span>
              <b>{plannedRR != null ? `1:${plannedRR}` : '—'}</b>
              <small>בפועל {fmtR(trade.r_multiple)}</small>
            </div>
            <div className={`mt-tile ${trade.followed_plan === false ? 'bad' : trade.followed_plan ? 'good' : ''}`}>
              <span>לפי התוכנית</span>
              <b>{trade.followed_plan == null ? '—' : trade.followed_plan ? 'כן' : 'לא'}</b>
              <small>{trade.emotion || ' '}</small>
            </div>
            <div className="mt-tile">
              <span>משמעת</span>
              <div className="mt-dots" aria-label={`${trade.discipline_score || 0} מתוך 5`}>
                {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= (trade.discipline_score || 0) ? 'on' : ''} />)}
              </div>
              <small>{trade.discipline_score ? `${trade.discipline_score}/5` : '—'}</small>
            </div>
          </div>

          {(trade.entry_reason || trade.exit_reason || trade.lesson_learned) && (
            <div className="mt-notes">
              {trade.entry_reason && (
                <div className="mt-note"><div className="mt-note-h">↗ למה נכנסתי</div><p>{trade.entry_reason}</p></div>
              )}
              {trade.exit_reason && (
                <div className="mt-note"><div className="mt-note-h">↘ {isOpen ? 'ניהול העסקה' : 'למה יצאתי'}</div><p>{trade.exit_reason}</p></div>
              )}
              {trade.lesson_learned && (
                <div className="mt-note"><div className="mt-note-h">✦ מה לקחתי מזה</div><p>{trade.lesson_learned}</p></div>
              )}
            </div>
          )}

          {urls.length > 0 && (
            <div className="mt-charts">
              {urls.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="צילום גרף" onClick={() => setZoom(u)} />
              ))}
            </div>
          )}

          {trade.coach_comment ? (
            <div className="mt-feedback">
              <div className="mt-feedback-head">
                <span className="mt-avatar">ש</span>
                <div>
                  <b>המשוב של שירן</b>
                  <div className="mt-sub">{fmtDate(trade.reviewed_at)}</div>
                </div>
                {verdict && <span className="mt-verdict" style={{ color: verdict.color, borderColor: verdict.color }}>{verdict.icon} {verdict.label}</span>}
              </div>
              <div className="mt-feedback-text">
                {trade.coach_comment.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l}</p>)}
              </div>
            </div>
          ) : (
            <div className="mt-waiting">⏳ מחכה לניתוח של שירן</div>
          )}

          {footer}
      {zoom && (
        <div className="mt-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="צילום גרף מוגדל">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="צילום גרף" />
        </div>
      )}
    </>
  );
}

export default function TradeCard({
  trade, isNew, defaultOpen, onOpen, footer, showStudentName,
}: {
  trade: MentoringTrade;
  isNew?: boolean;
  defaultOpen?: boolean;
  onOpen?: () => void;
  footer?: ReactNode;
  showStudentName?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const verdict = trade.coach_verdict ? VERDICT_META[trade.coach_verdict] : null;
  const isOpen = isOpenTrade(trade);
  const tone = tradeTone(trade);
  const symbol = trade.instrument === 'STOCK' ? 'מניה' : trade.instrument;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div className={`mt-trade tone-${tone}${isNew ? ' new' : ''}${open ? ' open' : ''}`}>
      <button className="mt-trade-head" onClick={toggle} aria-expanded={open}>
        <div className="mt-trade-id">
          <div className="mt-trade-sym">
            {symbol}
            <span className={`mt-dir ${trade.direction}`}>{trade.direction === 'long' ? 'לונג' : 'שורט'}</span>
            {trade.is_example && <span className="mt-tag-example">דוגמה</span>}
            {isNew && <span className="mt-tag-new">חדש</span>}
          </div>
          <div className="mt-sub">
            {STYLE_LABEL[trade.trade_style] || 'סווינג'} · {fmtDate(trade.traded_at)}
            {trade.closed_at && trade.closed_at !== trade.traded_at ? ` – ${fmtDate(trade.closed_at)}` : ''}
            {trade.setup ? ` · ${trade.setup}` : ''}
            {showStudentName ? ` · ${showStudentName}` : ''}
          </div>
        </div>
        <div className="mt-trade-result">
          {isOpen ? (
            <b className="mt-result-open">● פתוחה</b>
          ) : (
            <>
              <b>{fmtUsd(trade.pnl_usd)}</b>
              <span>{fmtR(trade.r_multiple)}</span>
            </>
          )}
        </div>
        <div className="mt-trade-status" title={verdict ? verdict.label : trade.reviewed_at ? 'נבדקה' : 'מחכה לניתוח'}>
          {verdict ? verdict.icon : trade.reviewed_at ? '✓' : '⏳'}
        </div>
      </button>

      {open && (
        <div className="mt-trade-body">
          <TradeDetail trade={trade} footer={footer} />
        </div>
      )}
    </div>
  );
}
