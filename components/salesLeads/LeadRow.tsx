'use client';

import { useState } from 'react';
import { SalesLead } from '@/lib/salesLeads/types';
import { formatPhoneIL, telHref, whatsappHref } from '@/lib/salesLeads/phone';
import { formatDateIL, formatDateTimeIL, isOverdue, isTodayJerusalem, jerusalemLocalInputToUtcIso, utcIsoToJerusalemLocalInput } from '@/lib/salesLeads/time';
import { getStatusMeta, priorityLabel } from '@/lib/salesLeads/statuses';
import { applyAction } from '@/lib/salesLeads/apiClient';
import { getLeadFirstName } from '@/lib/salesLeads/firstName';
import { buildInitialOutreachMessage } from '@/lib/salesLeads/whatsappMessage';

type Props = {
  lead: SalesLead;
  onOpen: (id: string) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
};

function defaultFollowupLocal(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  return utcIsoToJerusalemLocalInput(d.toISOString());
}

export default function LeadRow({ lead, onOpen, onChanged, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [showFollowup, setShowFollowup] = useState(false);
  const [followupValue, setFollowupValue] = useState(() => (lead.next_followup_at ? utcIsoToJerusalemLocalInput(lead.next_followup_at) : defaultFollowupLocal()));
  const [followupNote, setFollowupNote] = useState('');

  const [waError, setWaError] = useState(false);

  const overdue = isOverdue(lead.next_followup_at);
  const today = !overdue && isTodayJerusalem(lead.next_followup_at);
  const statusMeta = getStatusMeta(lead.sales_status);
  const whatsappMessage = buildInitialOutreachMessage(getLeadFirstName(lead));

  // רק תיעוד שנפתח WhatsApp - לא חוסם את הניווט בכלל (fire-and-forget), ולא אומר שנשלחה הודעה.
  // אם זו הייתה פנייה ראשונית (הליד היה "לא טופל") השרת מעביר אותו אוטומטית לסטטוס ייעודי -
  // מרעננים את הרשימה כדי שזה יתעדכן מיד
  function logWhatsappOpened() {
    applyAction(lead.id, { type: 'whatsapp_opened' }).then(onChanged).catch(() => {});
  }

  function handleWhatsappClick(e: React.MouseEvent) {
    stop(e);
    if (!lead.phone_normalized) {
      e.preventDefault();
      setWaError(true);
      return;
    }
    logWhatsappOpened();
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className={`sl-lead ${overdue ? 'sl-overdue' : today ? 'sl-today' : ''}`} onClick={() => onOpen(lead.id)}>
      <div className="sl-lead-top">
        <div>
          <div className="sl-lead-name">{lead.name}</div>
          <div className="sl-lead-phone">{formatPhoneIL(lead.phone_normalized)}</div>
        </div>
        <div className="sl-lead-badges">
          <span className={`sl-priority ${lead.priority}`}>{priorityLabel(lead.priority)}</span>
          <span className="sl-status">{statusMeta.label}</span>
        </div>
      </div>

      <div className="sl-meta-line">
        <span>נכנס/ה: {formatDateIL(lead.lead_date)}</span>
        <span>ניסיונות התקשרות: {lead.call_attempts_count}</span>
        {lead.last_contact_at && <span>טיפול אחרון: {formatDateTimeIL(lead.last_contact_at)}</span>}
      </div>

      {lead.next_followup_at && (
        <div className={`sl-followup-line ${overdue ? 'sl-overdue-text' : ''}`}>
          {overdue ? '⚠ Follow-up באיחור: ' : 'Follow-up הבא: '}
          {formatDateTimeIL(lead.next_followup_at)}
          {lead.next_followup_note ? ` · ${lead.next_followup_note}` : ''}
        </div>
      )}

      {lead.last_note && <div className="sl-last-note">"{lead.last_note}"</div>}
      {waError && <div className="sl-last-note" style={{ color: 'var(--loss)' }}>לא נמצא מספר WhatsApp תקין לליד הזה.</div>}

      <div className="sl-actions" onClick={stop}>
        <a className="sl-act-call" href={telHref(lead.phone_normalized)}>📞 התקשרי</a>
        <a className="sl-act-whatsapp" href={whatsappHref(lead.phone_normalized, whatsappMessage)} target="_blank" rel="noopener noreferrer" onClick={handleWhatsappClick}>
          💬 WhatsApp
        </a>
        <button disabled={busy} onClick={() => run(() => applyAction(lead.id, { type: 'no_answer' }))}>לא ענה</button>
        <button disabled={busy} onClick={() => setShowFollowup((v) => !v)}>Follow-up</button>
        <button className="sl-act-primary" disabled={busy} onClick={() => run(() => applyAction(lead.id, { type: 'set_status', status: 'registered' }))}>✔ נרשם</button>
        <button className="sl-act-danger" disabled={busy} onClick={() => run(() => applyAction(lead.id, { type: 'set_status', status: 'not_relevant' }))}>✕ לא רלוונטי</button>
      </div>

      {showFollowup && (
        <div className="sl-inline-form" onClick={stop}>
          <label style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>תאריך ושעה</label>
          <input type="datetime-local" value={followupValue} onChange={(e) => setFollowupValue(e.target.value)} />
          <textarea placeholder="הערה קצרה (לא חובה)" value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} />
          <div className="sl-inline-form-row">
            <button
              className="sl-confirm"
              disabled={busy || !followupValue}
              onClick={() =>
                run(async () => {
                  const iso = jerusalemLocalInputToUtcIso(followupValue);
                  if (!iso) throw new Error('תאריך לא תקין');
                  await applyAction(lead.id, { type: 'set_followup', followupAt: iso, note: followupNote || undefined });
                  setShowFollowup(false);
                })
              }
            >
              קביעת Follow-up
            </button>
            <button className="sl-cancel" onClick={() => setShowFollowup(false)}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}
