'use client';

import { useEffect, useState } from 'react';
import { SalesLead, SalesLeadActivity } from '@/lib/salesLeads/types';
import { formatPhoneIL, telHref, whatsappHref } from '@/lib/salesLeads/phone';
import { formatDateIL, formatDateTimeIL, isOverdue, jerusalemLocalInputToUtcIso, utcIsoToJerusalemLocalInput } from '@/lib/salesLeads/time';
import { ACTIVITY_TYPE_LABELS, PRIORITIES, SALES_STATUSES, LeadPriority } from '@/lib/salesLeads/statuses';
import { fetchLeadDetail, applyAction } from '@/lib/salesLeads/apiClient';

type Props = {
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function LeadDrawer({ leadId, onClose, onChanged }: Props) {
  const [lead, setLead] = useState<SalesLead | null>(null);
  const [activities, setActivities] = useState<SalesLeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [callNote, setCallNote] = useState('');
  const [noteOnly, setNoteOnly] = useState('');
  const [followupValue, setFollowupValue] = useState('');
  const [followupNote, setFollowupNote] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchLeadDetail(leadId);
      setLead(data.lead);
      setActivities(data.activities);
      setFollowupValue(data.lead.next_followup_at ? utcIsoToJerusalemLocalInput(data.lead.next_followup_at) : '');
      setFollowupNote(data.lead.next_followup_note || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינה');
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sl-drawer-backdrop" onClick={onClose} />
      <div className="sl-drawer">
        <div className="sl-drawer-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{lead?.name || '...'}</div>
            {lead && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'var(--text-secondary)', direction: 'ltr', textAlign: 'right' }}>{formatPhoneIL(lead.phone_normalized)}</div>}
          </div>
          <button className="sl-drawer-close" onClick={onClose} aria-label="סגירה">×</button>
        </div>

        <div className="sl-drawer-body">
          {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
          {error && <p style={{ fontSize: '12.5px', color: 'var(--loss)', marginBottom: '12px' }}>{error}</p>}

          {lead && (
            <>
              <div className="sl-actions" style={{ marginBottom: '18px' }}>
                <a className="sl-act-call" href={telHref(lead.phone_normalized)}>📞 התקשרי</a>
                <a className="sl-act-whatsapp" href={whatsappHref(lead.phone_normalized)} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
              </div>

              <div className="sl-drawer-section">
                <h3>פרטים</h3>
                <div className="sl-meta-line" style={{ flexDirection: 'column', gap: '4px' }}>
                  <span>נכנס/ה לקבוצת העדכונים: {formatDateIL(lead.lead_date)}</span>
                  <span>ניסיונות התקשרות: {lead.call_attempts_count}</span>
                  {lead.last_contact_at && <span>טיפול אחרון: {formatDateTimeIL(lead.last_contact_at)}</span>}
                  {lead.source_info && <span>מקור: {lead.source_info}</span>}
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>עדיפות</h3>
                <div className="sl-priority-picker">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      className={lead.priority === p.value ? `active ${p.value}` : ''}
                      disabled={busy}
                      onClick={() => run(() => applyAction(lead.id, { type: 'set_priority', priority: p.value as LeadPriority }))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>סטטוס</h3>
                <div className="sl-status-grid">
                  {SALES_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      className={lead.sales_status === s.value ? 'active' : ''}
                      disabled={busy}
                      onClick={() => run(() => applyAction(lead.id, { type: 'set_status', status: s.value }))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>Follow-up</h3>
                {lead.next_followup_at && (
                  <p className={isOverdue(lead.next_followup_at) ? 'sl-followup-line sl-overdue-text' : 'sl-followup-line'} style={{ marginBottom: '8px' }}>
                    {isOverdue(lead.next_followup_at) ? '⚠ באיחור: ' : 'נקבע ל: '}
                    {formatDateTimeIL(lead.next_followup_at)}
                  </p>
                )}
                <div className="sl-inline-form" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
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
                        })
                      }
                    >
                      {lead.next_followup_at ? 'עדכון Follow-up' : 'קביעת Follow-up'}
                    </button>
                    {lead.next_followup_at && (
                      <button className="sl-cancel" disabled={busy} onClick={() => run(() => applyAction(lead.id, { type: 'clear_followup' }))}>
                        ביטול Follow-up
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>התקשרתי - הוספת סיכום שיחה</h3>
                <div className="sl-inline-form" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                  <textarea placeholder="מה קרה בשיחה?" value={callNote} onChange={(e) => setCallNote(e.target.value)} />
                  <button
                    className="sl-confirm"
                    style={{ border: 'none', borderRadius: '7px', padding: '9px', fontWeight: 700, cursor: 'pointer' }}
                    disabled={busy || !callNote.trim()}
                    onClick={() =>
                      run(async () => {
                        await applyAction(lead.id, { type: 'call_completed', note: callNote.trim() });
                        setCallNote('');
                      })
                    }
                  >
                    שמירת סיכום שיחה
                  </button>
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>הוספת הערה</h3>
                <div className="sl-inline-form" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                  <textarea placeholder="הערה כללית" value={noteOnly} onChange={(e) => setNoteOnly(e.target.value)} />
                  <button
                    className="sl-cancel"
                    style={{ borderRadius: '7px', padding: '9px', fontWeight: 700, cursor: 'pointer' }}
                    disabled={busy || !noteOnly.trim()}
                    onClick={() =>
                      run(async () => {
                        await applyAction(lead.id, { type: 'add_note', note: noteOnly.trim() });
                        setNoteOnly('');
                      })
                    }
                  >
                    הוספת הערה
                  </button>
                </div>
              </div>

              <div className="sl-drawer-section">
                <h3>היסטוריית טיפול</h3>
                <div className="sl-timeline">
                  {activities.length === 0 && <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>אין עדיין היסטוריה</p>}
                  {activities.map((a) => (
                    <div className="sl-timeline-item" key={a.id}>
                      <div className="sl-t-head">
                        <span>{formatDateTimeIL(a.created_at)}</span>
                      </div>
                      <div className="sl-t-type">{ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type}</div>
                      {a.note && <div className="sl-t-note">{a.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
