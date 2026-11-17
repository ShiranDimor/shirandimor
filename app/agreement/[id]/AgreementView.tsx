'use client';

import { useState } from 'react';
import type { AgreementBlock } from '@/lib/agreements/types';
import SignForm from './SignForm';

type Variant = { key: string; label: string; options: { value: string; label: string; note?: string; total?: number }[] };
type Choice = { key: string; label: string; options: string[] };

// ההסכם + טופס החתימה. כשיש בחירה שמשנה את הנוסח (מסלול) - נבחרת קודם, וההסכם שמוצג ונחתם הוא של הבחירה
export default function AgreementView({
  agreementId,
  token,
  defaultName,
  variant,
  blocksByOption,
  choices,
}: {
  agreementId: string;
  token: string;
  defaultName: string;
  variant: Variant | null;
  blocksByOption: Record<string, AgreementBlock[]>;
  choices: Choice[];
}) {
  const [selected, setSelected] = useState(variant ? '' : '_');
  const blocks = blocksByOption[selected] || [];
  const option = variant?.options.find((o) => o.value === selected);

  return (
    <>
      {variant && (
        <section className="mt-section" style={{ marginTop: 18 }}>
          <h2 className="mt-h3" style={{ marginTop: 0 }}>{variant.label}</h2>
          <div className="tp-options">
            {variant.options.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={selected === o.value} className={`tp-option-btn${selected === o.value ? ' selected' : ''}`} onClick={() => setSelected(o.value)}>
                <span>
                  {o.label}
                  {o.note && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 500, marginTop: 2 }}>{o.note}</span>}
                </span>
                <span className="tp-option-check" aria-hidden="true">{selected === o.value ? '✓' : ''}</span>
              </button>
            ))}
          </div>
          {!selected && <p className="mt-form-note" style={{ textAlign: 'right' }}>אחרי הבחירה יופיע כאן ההסכם המלא, מותאם למסלול.</p>}
        </section>
      )}

      {blocks.length > 0 && (
        <>
          <section className="mt-section" style={{ marginTop: 18 }}>
            <div className="ag-doc">
              {blocks.map((b) => (
                <div key={b.h} className="ag-block">
                  <h2>{b.h}</h2>
                  {b.p?.map((x) => <p key={x}>{x}</p>)}
                  {b.table && (
                    <table className="ag-table">
                      <tbody>{b.table.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
                    </table>
                  )}
                  {b.ul && <ul>{b.ul.map((x) => <li key={x}>{x}</li>)}</ul>}
                  {b.ol && <ol>{b.ol.map((x) => <li key={x}>{x}</li>)}</ol>}
                </div>
              ))}
            </div>
          </section>
          <section className="mt-section mt-fitcall" id="sign">
            <h2 className="mt-h2">פרטים, אישור <em>וחתימה</em></h2>
            <p className="mt-lead">אחרי החתימה יישלח אלייך במייל עותק חתום של ההסכם, ועותק גם לשירן.</p>
            <SignForm
              key={selected}
              agreementId={agreementId}
              token={token}
              defaultName={defaultName}
              choices={choices}
              fixedChoices={variant ? { [variant.key]: selected } : {}}
              total={option?.total}
              summary={option ? `${option.label} · ${option.note || ''}` : ''}
            />
          </section>
        </>
      )}
    </>
  );
}
