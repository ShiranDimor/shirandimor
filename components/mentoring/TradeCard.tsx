'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { STYLE_LABEL, VERDICT_META, fmtDate, fmtR, fmtUsd, isOpenTrade, type MentoringTrade } from '@/lib/mentoring';

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
  const [zoom, setZoom] = useState<string | null>(null);
  const urls = useSignedUrls(trade.chart_paths || [], open);
  const verdict = trade.coach_verdict ? VERDICT_META[trade.coach_verdict] : null;
  const pnlColor = trade.pnl_usd == null ? 'var(--text-secondary)' : trade.pnl_usd > 0 ? 'var(--profit)' : trade.pnl_usd < 0 ? 'var(--loss)' : 'var(--text-secondary)';

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div className={`mt-card${isNew ? ' new' : ''}`}>
      <button className="mt-card-head" onClick={toggle} aria-expanded={open}>
        <span className={`mt-dir ${trade.direction}`}>{trade.direction === 'long' ? 'לונג' : 'שורט'}</span>
        <div>
          <div className="mt-sym">{trade.instrument === 'STOCK' ? 'מניה' : trade.instrument} <span className="mt-sub">× {trade.contracts}</span></div>
          <div className="mt-sub">
            {STYLE_LABEL[trade.trade_style] || 'סווינג'} · {fmtDate(trade.traded_at)}{trade.closed_at && trade.closed_at !== trade.traded_at ? `–${fmtDate(trade.closed_at)}` : ''}{trade.setup ? ` · ${trade.setup}` : ''}{showStudentName ? ` · ${showStudentName}` : ''}
          </div>
        </div>
        <div className="mt-pnl" style={{ color: pnlColor }}>
          {isOpenTrade(trade) ? <span style={{ color: 'var(--sky)', fontSize: 12.5 }}>● פתוחה</span> : fmtUsd(trade.pnl_usd)}
          <small>
            {fmtR(trade.r_multiple)}
            {verdict ? ` · ${verdict.icon}` : trade.reviewed_at ? '' : ' · ⏳'}
            {isNew ? ' · חדש' : ''}
          </small>
        </div>
      </button>

      {open && (
        <div className="mt-card-body">
          <div className="mt-grid2">
            <div className="mt-kv"><span>כניסה</span>{trade.entry_price ?? '—'}</div>
            <div className="mt-kv"><span>יציאה</span>{trade.exit_price ?? '—'}</div>
            <div className="mt-kv"><span>סטופ</span>{trade.stop_price ?? '—'}</div>
            <div className="mt-kv"><span>יעד</span>{trade.target_price ?? '—'}</div>
            <div className="mt-kv"><span>עמידה בתוכנית</span>{trade.followed_plan == null ? '—' : trade.followed_plan ? '✅ כן' : '❌ לא'}</div>
            <div className="mt-kv"><span>משמעת · רגש</span>{trade.discipline_score ? `${trade.discipline_score}/5` : '—'}{trade.emotion ? ` · ${trade.emotion}` : ''}</div>
          </div>

          {trade.entry_reason && <div className="mt-text"><b>למה נכנסתי: </b>{trade.entry_reason}</div>}
          {trade.exit_reason && <div className="mt-text"><b>למה יצאתי: </b>{trade.exit_reason}</div>}
          {trade.lesson_learned && <div className="mt-text"><b>מה לקחתי מזה: </b>{trade.lesson_learned}</div>}

          {urls.length > 0 && (
            <div className="mt-charts">
              {urls.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="צילום גרף" onClick={() => setZoom(u)} />
              ))}
            </div>
          )}

          {trade.coach_comment ? (
            <div className="mt-coach">
              <div className="mt-coach-head">
                <span>💬 שירן</span>
                {verdict && <span className="mt-status" style={{ color: verdict.color }}>{verdict.icon} {verdict.label}</span>}
                <span className="mt-sub" style={{ marginInlineStart: 'auto' }}>{fmtDate(trade.reviewed_at)}</span>
              </div>
              <p>{trade.coach_comment}</p>
            </div>
          ) : (
            <div className="mt-waiting">⏳ מחכה לניתוח של שירן</div>
          )}

          {footer}
        </div>
      )}

      {zoom && (
        <div className="mt-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="צילום גרף מוגדל">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="צילום גרף" />
        </div>
      )}
    </div>
  );
}
