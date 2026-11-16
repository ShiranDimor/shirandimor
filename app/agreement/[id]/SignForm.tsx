'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'sending' | 'done' | 'error';

// טופס פרטים + אישור + חתימה ביד (בעכבר או באצבע) על הסכם
type Choice = { key: string; label: string; options: string[] };

export default function SignForm({ agreementId, token, defaultName, choices = [] }: { agreementId: string; token: string; defaultName: string; choices?: Choice[] }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ fullName: defaultName, idNumber: '', phone: '', email: '', address: '', typedName: '' });
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // משטח חתימה: רזולוציה לפי המסך, קו כהה על רקע לבן (כדי שהחתימה תיראה טוב גם במייל)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
  }, [status]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }
  function onUp() {
    drawing.current = false;
  }
  function clearSignature() {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) return setError('נשאר למלא שם מלא');
    if (!/^\d{5,9}$/.test(form.idNumber.replace(/\D/g, ''))) return setError('נראה שמספר תעודת הזהות לא מלא');
    if (form.phone.replace(/\D/g, '').length < 9) return setError('נראה שמספר הנייד חסר או לא מלא');
    if (!form.email.includes('@')) return setError('צריך מייל - אליו יישלח העותק החתום');
    if (!form.address.trim()) return setError('נשאר למלא כתובת');
    const missing = choices.find((c) => !picked[c.key]);
    if (missing) return setError(`נשאר לבחור: ${missing.label}`);
    if (!agree) return setError('נשאר לסמן שקראת את ההסכם והוא מקובל עלייך');
    if (!form.typedName.trim()) return setError('נשאר להקליד שם מלא כחתימה');
    if (!hasInk) return setError('נשאר לחתום ביד במשטח החתימה');

    setError('');
    setStatus('sending');
    try {
      const signature = canvasRef.current?.toDataURL('image/png') || '';
      const res = await fetch('/api/agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreementId, t: token, ...form, choices: picked, agree, signature }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error || 'משהו השתבש. אפשר לנסות שוב.'));
        setStatus('idle');
        return;
      }
      setSignedAt(String(json.signedAt || ''));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="mt-done" role="status">
        <p className="mt-done-title">ההסכם נחתם, תודה!</p>
        <p>נחתם ב-{signedAt}. עותק חתום נשלח עכשיו למייל שלך ({form.email}) - כדאי לשמור אותו.</p>
      </div>
    );
  }

  return (
    <form className="mt-form" onSubmit={submit} noValidate>
      <div className="mt-form-grid">
        <div className="field"><label htmlFor="ag-name">שם מלא *</label><input id="ag-name" value={form.fullName} onChange={set('fullName')} maxLength={100} autoComplete="name" /></div>
        <div className="field"><label htmlFor="ag-id">תעודת זהות *</label><input id="ag-id" value={form.idNumber} onChange={set('idNumber')} inputMode="numeric" dir="ltr" maxLength={12} /></div>
        <div className="field"><label htmlFor="ag-phone">נייד *</label><input id="ag-phone" type="tel" value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" maxLength={20} autoComplete="tel" /></div>
        <div className="field"><label htmlFor="ag-email">מייל * (לעותק החתום)</label><input id="ag-email" type="email" value={form.email} onChange={set('email')} dir="ltr" maxLength={120} autoComplete="email" /></div>
        <div className="field mt-field-wide"><label htmlFor="ag-address">כתובת *</label><input id="ag-address" value={form.address} onChange={set('address')} maxLength={200} autoComplete="street-address" /></div>
      </div>

      {choices.map((c) => (
        <fieldset key={c.key} className="mt-q">
          <legend className="tp-question-title">{c.label} *</legend>
          <div className="mt-chips">
            {c.options.map((o) => (
              <button key={o} type="button" className="mt-chip" aria-pressed={picked[c.key] === o} onClick={() => setPicked((p) => ({ ...p, [c.key]: o }))}>
                {o}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      {picked.payments && (
        <p className="mt-form-note" style={{ textAlign: 'right' }}>
          {picked.payments === '1' ? 'תשלום אחד של ₪8,900' : `${picked.payments} תשלומים של כ-₪${Math.floor(8900 / Number(picked.payments)).toLocaleString('en-US')}`} (סה"כ ₪8,900 כולל מע"מ)
        </p>
      )}

      <label className="mt-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>קראתי את ההסכם במלואו, הוא מקובל עליי, ואני מאשר/ת אותו.</span>
      </label>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="ag-typed">הקלדת שם מלא כחתימה *</label>
        <input id="ag-typed" value={form.typedName} onChange={set('typedName')} maxLength={100} />
      </div>

      <div className="ag-sign-head">
        <span>חתימה ביד * (בעכבר או באצבע)</span>
        <button type="button" className="mt-link-btn" onClick={clearSignature}>ניקוי</button>
      </div>
      <canvas
        ref={canvasRef}
        className="ag-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        aria-label="משטח חתימה"
      />

      {error && <p className="mt-form-error" role="alert">{error}</p>}
      {status === 'error' && (
        <p className="mt-form-error" role="alert">
          משהו השתבש בשליחה. אפשר לנסות שוב, או לכתוב לשירן <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer">בוואטסאפ</a>.
        </p>
      )}

      <button type="submit" className="btn-primary mt-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'שולחים...' : 'אישור וחתימה על ההסכם'}
      </button>
    </form>
  );
}
