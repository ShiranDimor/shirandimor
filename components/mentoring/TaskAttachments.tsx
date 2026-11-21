'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// צילומי מסך למשימה - התלמיד/ה מצרף/ת ישירות למשימה (במקום לשלוח בוואטסאפ), ושירן רואה אותם
// בתור לניתוח. נשמרים ב-bucket הפרטי 'mentoring' תחת <user_id>/tasks/...
const MAX_FILES = 6;

export default function TaskAttachments({
  taskId, paths, ownerId, editable, onChange,
}: {
  taskId: string;
  paths: string[];
  ownerId: string;
  editable?: boolean;
  onChange?: (paths: string[]) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const missing = paths.filter((p) => !urls[p]);
    if (!missing.length) return;
    supabase.storage.from('mentoring').createSignedUrls(missing, 3600).then(({ data }) => {
      const next: Record<string, string> = {};
      (data || []).forEach((d) => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
      setUrls((u) => ({ ...u, ...next }));
    });
  }, [paths.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: string[]) {
    const { error: dbErr } = await supabase.from('mentoring_tasks').update({ attachment_paths: next }).eq('id', taskId);
    if (dbErr) { setError('השמירה נכשלה, נסה/י שוב'); return false; }
    onChange?.(next);
    return true;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const room = MAX_FILES - paths.length;
    if (room <= 0) { setError(`עד ${MAX_FILES} תמונות למשימה`); return; }
    setBusy(true);
    const added: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith('image/')) continue;
      const ext = (f.name.split('.').pop() || 'png').toLowerCase();
      const path = `${ownerId}/tasks/${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('mentoring').upload(path, f, { contentType: f.type });
      if (upErr) { setError('העלאה נכשלה - נסה/י תמונה קטנה יותר (עד 8MB)'); continue; }
      added.push(path);
    }
    if (added.length) await save([...paths, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(p: string) {
    if (!confirm('להסיר את התמונה?')) return;
    if (await save(paths.filter((x) => x !== p))) supabase.storage.from('mentoring').remove([p]).then(() => {});
  }

  if (!editable && !paths.length) return null;

  return (
    <div className="mt-attach">
      {paths.length > 0 && (
        <div className="mt-attach-grid">
          {paths.map((p) => (
            <div key={p} className="mt-attach-item">
              {urls[p]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={urls[p]} alt="צילום מסך" onClick={() => setZoom(urls[p])} />
                : <div className="mt-attach-ph" />}
              {editable && <button type="button" className="mt-attach-x" onClick={() => remove(p)} aria-label="הסרה">✕</button>}
            </div>
          ))}
        </div>
      )}
      {editable && paths.length < MAX_FILES && (
        <label className={`mt-attach-add${busy ? ' busy' : ''}`}>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
          {busy ? 'מעלה...' : paths.length ? '📎 הוספת עוד צילום' : '📎 צירוף צילומי מסך'}
        </label>
      )}
      {error && <p className="mt-sub" style={{ color: 'var(--loss)', marginTop: 6 }}>{error}</p>}
      {zoom && (
        <div className="mt-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="צילום מוגדל">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="צילום מסך" />
        </div>
      )}
    </div>
  );
}
