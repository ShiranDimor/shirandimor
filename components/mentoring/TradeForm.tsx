'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INSTRUMENTS, SETUP_OPTIONS, EMOTION_OPTIONS, STYLE_LABEL, computeTradeNumbers, fmtR, fmtUsd, type MentoringTrade, type TradeStyle,
} from '@/lib/mentoring';

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function str(v: number | null | undefined) {
  return v == null ? '' : String(v);
}

export default function TradeForm({
  userId, defaultInstrument, defaultStyle, initial, onSaved, onCancel,
}: {
  userId: string;
  defaultInstrument?: string;
  defaultStyle?: TradeStyle;
  initial?: MentoringTrade | null;
  onSaved: (trade: MentoringTrade, isNew: boolean) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [tradeStyle, setTradeStyle] = useState<TradeStyle>(initial?.trade_style || defaultStyle || 'swing');
  const [tradedAt, setTradedAt] = useState(initial?.traded_at || today);
  const [closedAt, setClosedAt] = useState(initial?.closed_at || '');
  const [instrument, setInstrument] = useState(initial?.instrument || defaultInstrument || 'MNQ');
  const [direction, setDirection] = useState<'long' | 'short'>(initial?.direction || 'long');
  const [contracts, setContracts] = useState(str(initial?.contracts ?? 1));
  const [entry, setEntry] = useState(str(initial?.entry_price));
  const [stop, setStop] = useState(str(initial?.stop_price));
  const [target, setTarget] = useState(str(initial?.target_price));
  const [exit, setExit] = useState(str(initial?.exit_price));
  const [setup, setSetup] = useState(initial?.setup || '');
  const [entryReason, setEntryReason] = useState(initial?.entry_reason || '');
  const [exitReason, setExitReason] = useState(initial?.exit_reason || '');
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(initial?.followed_plan ?? null);
  const [emotion, setEmotion] = useState(initial?.emotion || '');
  const [discipline, setDiscipline] = useState<number | null>(initial?.discipline_score ?? null);
  const [lesson, setLesson] = useState(initial?.lesson_learned || '');
  const [existingCharts, setExistingCharts] = useState<string[]>(initial?.chart_paths || []);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const calc = useMemo(() => computeTradeNumbers({
    instrument, direction, contracts: num(contracts) || 1, entry: num(entry), stop: num(stop), exit: num(exit),
  }), [instrument, direction, contracts, entry, stop, exit]);

  const instrumentMeta = INSTRUMENTS.find((i) => i.code === instrument);
  const sizeLabel = instrument === 'STOCK' ? 'כמות מניות' : 'חוזים';

  async function save() {
    setError('');
    if (num(entry) == null) { setError('חסר מחיר כניסה'); return; }
    if (!entryReason.trim()) { setError('כתוב/כתבי במשפט אחד למה נכנסת - זה הדבר הכי חשוב לניתוח'); return; }
    if (followedPlan == null) { setError('סמן/י האם עמדת בתוכנית'); return; }
    if (existingCharts.length + files.length > 3) { setError('עד 3 צילומי גרף לעסקה'); return; }

    setSaving(true);

    const uploaded: string[] = [];
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'png').toLowerCase();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('mentoring').upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) { setSaving(false); setError('העלאת התמונה נכשלה - נסה/י תמונה קטנה יותר (עד 8MB)'); return; }
      uploaded.push(path);
    }

    const row = {
      student_id: userId,
      trade_style: tradeStyle,
      traded_at: tradedAt,
      // תוך-יומי נסגר באותו יום; סווינג - תאריך היציאה שהוזן, או ריק כל עוד העסקה פתוחה
      closed_at: num(exit) == null ? null : tradeStyle === 'intraday' ? tradedAt : (closedAt || today),
      instrument,
      direction,
      contracts: num(contracts) || 1,
      entry_price: num(entry),
      stop_price: num(stop),
      target_price: num(target),
      exit_price: num(exit),
      pnl_usd: calc.pnl,
      r_multiple: calc.r,
      setup: setup || null,
      entry_reason: entryReason.trim() || null,
      exit_reason: exitReason.trim() || null,
      followed_plan: followedPlan,
      emotion: emotion || null,
      discipline_score: discipline,
      lesson_learned: lesson.trim() || null,
      chart_paths: [...existingCharts, ...uploaded],
    };

    const query = initial
      ? supabase.from('mentoring_trades').update(row).eq('id', initial.id).select().single()
      : supabase.from('mentoring_trades').insert(row).select().single();
    const { data, error: dbErr } = await query;
    setSaving(false);

    if (dbErr || !data) { setError('השמירה נכשלה, נסה/י שוב'); return; }
    onSaved(data as MentoringTrade, !initial);
  }

  return (
    <div className="mt-form">
      <h3>{initial ? 'עריכת עסקה' : 'עסקה חדשה ביומן'}</h3>

      <div className="mt-pills" style={{ marginBottom: 4 }}>
        {(Object.keys(STYLE_LABEL) as TradeStyle[]).map((st) => (
          <button key={st} type="button" className={`mt-pill${tradeStyle === st ? ' on' : ''}`} onClick={() => setTradeStyle(st)}>{STYLE_LABEL[st]}</button>
        ))}
      </div>

      <div className="mt-row">
        <div>
          <label className="mt-label">{tradeStyle === 'swing' ? 'תאריך כניסה' : 'תאריך'}</label>
          <input className="mt-input" type="date" value={tradedAt} max={today} onChange={(e) => setTradedAt(e.target.value)} />
        </div>
        <div>
          <label className="mt-label">כיוון</label>
          <div className="mt-pills">
            <button type="button" className={`mt-pill${direction === 'long' ? ' on green' : ''}`} onClick={() => setDirection('long')}>לונג ↑</button>
            <button type="button" className={`mt-pill${direction === 'short' ? ' on red' : ''}`} onClick={() => setDirection('short')}>שורט ↓</button>
          </div>
        </div>
      </div>

      <label className="mt-label">מה נסחר</label>
      <div className="mt-pills">
        {INSTRUMENTS.map((i) => (
          <button key={i.code} type="button" className={`mt-pill${instrument === i.code ? ' on' : ''}`} onClick={() => setInstrument(i.code)}>{i.label}</button>
        ))}
      </div>

      <div className="mt-row3" style={{ marginTop: 4 }}>
        <div><label className="mt-label">{sizeLabel}</label><input className="mt-input" type="number" inputMode="decimal" value={contracts} onChange={(e) => setContracts(e.target.value)} /></div>
        <div><label className="mt-label">כניסה</label><input className="mt-input" type="number" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} /></div>
        <div><label className="mt-label">סטופ</label><input className="mt-input" type="number" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} /></div>
      </div>
      <div className="mt-row">
        <div><label className="mt-label">יעד מתוכנן</label><input className="mt-input" type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div><label className="mt-label">יציאה בפועל</label><input className="mt-input" type="number" inputMode="decimal" value={exit} onChange={(e) => setExit(e.target.value)} placeholder={tradeStyle === 'swing' ? 'ריק = עדיין פתוחה' : ''} /></div>
      </div>
      {tradeStyle === 'swing' && num(exit) != null && (
        <div><label className="mt-label">תאריך יציאה</label><input className="mt-input" type="date" value={closedAt || today} min={tradedAt} max={today} onChange={(e) => setClosedAt(e.target.value)} /></div>
      )}
      {tradeStyle === 'swing' && num(exit) == null && (
        <div className="mt-sub" style={{ marginTop: 8 }}>עסקה פתוחה - אפשר לשמור עכשיו ולהוסיף את היציאה כשתיסגר (עריכה בכרטיס העסקה)</div>
      )}

      <div className="mt-calc" aria-live="polite">
        <div><span>רווח/הפסד</span><b style={{ color: calc.pnl == null ? undefined : calc.pnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{fmtUsd(calc.pnl)}</b></div>
        <div><span>R</span><b>{fmtR(calc.r)}</b></div>
        <div><span>שווי נקודה</span><b>${instrumentMeta?.pointValue ?? 1}</b></div>
      </div>

      <label className="mt-label">סטאפ</label>
      <div className="mt-pills">
        {SETUP_OPTIONS.map((s) => (
          <button key={s} type="button" className={`mt-pill${setup === s ? ' on' : ''}`} onClick={() => setSetup(setup === s ? '' : s)}>{s}</button>
        ))}
      </div>

      <label className="mt-label">למה נכנסתי? *</label>
      <textarea className="mt-textarea" value={entryReason} onChange={(e) => setEntryReason(e.target.value)} placeholder="מה ראיתי בגרף שגרם לי להיכנס" />

      <label className="mt-label">{tradeStyle === 'swing' && num(exit) == null ? 'איך אני מנהל/ת את העסקה? (סטופ נגרר, יעדים)' : 'למה יצאתי?'}</label>
      <textarea className="mt-textarea" style={{ minHeight: 56 }} value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="סטופ / יעד / יציאה ידנית - ולמה" />

      <label className="mt-label">עמדתי בתוכנית? *</label>
      <div className="mt-pills">
        <button type="button" className={`mt-pill${followedPlan === true ? ' on green' : ''}`} onClick={() => setFollowedPlan(true)}>✅ כן, לפי התוכנית</button>
        <button type="button" className={`mt-pill${followedPlan === false ? ' on red' : ''}`} onClick={() => setFollowedPlan(false)}>❌ לא</button>
      </div>

      <label className="mt-label">איך הרגשתי</label>
      <div className="mt-pills">
        {EMOTION_OPTIONS.map((em) => (
          <button key={em} type="button" className={`mt-pill${emotion === em ? ' on' : ''}`} onClick={() => setEmotion(emotion === em ? '' : em)}>{em}</button>
        ))}
      </div>

      <label className="mt-label">ציון משמעת עצמי</label>
      <div className="mt-pills">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`mt-pill${discipline === n ? ' on' : ''}`} style={{ minWidth: 42 }} onClick={() => setDiscipline(n)}>{n}</button>
        ))}
      </div>

      <label className="mt-label">מה לקחתי מהעסקה הזו?</label>
      <textarea className="mt-textarea" style={{ minHeight: 56 }} value={lesson} onChange={(e) => setLesson(e.target.value)} />

      <label className="mt-label">צילומי גרף (עד 3) - כניסה ויציאה</label>
      {existingCharts.length > 0 && (
        <div className="mt-pills" style={{ marginBottom: 8 }}>
          {existingCharts.map((p, i) => (
            <button key={p} type="button" className="mt-pill on" onClick={() => setExistingCharts(existingCharts.filter((x) => x !== p))}>תמונה {i + 1} ✕</button>
          ))}
        </div>
      )}
      <input
        className="mt-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))}
      />

      {error && <p style={{ color: 'var(--loss)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <div className="mt-actions">
        <button className="btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'שומרים...' : initial ? 'שמירת שינויים' : 'שליחה לשירן'}</button>
        <button className="mt-btn-ghost" onClick={onCancel} disabled={saving}>ביטול</button>
      </div>
    </div>
  );
}
