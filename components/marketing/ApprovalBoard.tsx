'use client';

// לוח האישורים של סטודיו התוכן - המסך הראשי ששירן רואה. בנוי כמו פורטל אישורים של חברת שיווק:
// חודש → שבוע → ימים, עם תמונות ממוזערות לכל פריט, פס התקדמות לשבוע, ו"מסך בדיקה" שנפתח על
// פריט ומקפיץ לבא אחריו אחרי כל אישור - כך שעוברים על שבוע שלם בלי לגלול רשימה ארוכה.
// כל הימים והשבועות מחושבים לפי שעון ישראל (שבוע = ראשון עד שבת).
import { useEffect, useMemo, useRef, useState } from 'react';

export type BoardPost = {
  id: string;
  platform: 'instagram' | 'facebook' | 'both';
  content_type: 'feed_post' | 'reel' | 'story';
  topic: string;
  hook: string;
  caption: string;
  hashtags: string;
  status: 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';
  scheduled_at: string | null;
  published_at: string | null;
  image_base64: string | null;
  extra_images: string[];
  story_image_base64: string | null;
  slides_html: string[] | null;
  publish_error: string | null;
  revision_history: { at: string; note: string }[] | null;
};

type Props = {
  posts: BoardPost[];
  loading: boolean;
  revisingId: string | null;
  revisionMessage: Record<string, string>;
  errors: Record<string, string>;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onRevise: (id: string, note: string) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  onRender: (id: string) => Promise<void>;
  onOpenFullEdit: (id: string) => void;
};

const TZ = 'Asia/Jerusalem';
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const PLATFORM_LABEL = { instagram: 'אינסטגרם', facebook: 'פייסבוק', both: 'אינסטגרם + פייסבוק' } as const;
const TYPE_LABEL = { feed_post: 'פוסט', reel: 'רילס', story: 'סטורי' } as const;

// תאריך "יומי" בשעון ישראל, כמספר ימים מאז 1970 - נוח לחישובי שבועות בלי בעיות שעון קיץ
function israelDayParts(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, hour: get('hour'), minute: get('minute'), dayNumber, weekday };
}

function dayNumberToDate(dayNumber: number) {
  const dt = new Date(dayNumber * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function weekLabel(weekStart: number) {
  const a = dayNumberToDate(weekStart);
  const b = dayNumberToDate(weekStart + 6);
  return a.m === b.m ? `${a.d}–${b.d}.${b.m}` : `${a.d}.${a.m}–${b.d}.${b.m}`;
}

function timeLabel(iso: string) {
  const p = israelDayParts(iso);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function imagesOf(post: BoardPost): string[] {
  const list = [post.image_base64, ...(Array.isArray(post.extra_images) ? post.extra_images : [])].filter((x): x is string => Boolean(x));
  if (list.length === 0 && post.story_image_base64) return [post.story_image_base64];
  return list;
}

type ItemState = 'published' | 'approved' | 'failed' | 'pending';
function itemState(post: BoardPost): ItemState {
  if (post.status === 'published') return 'published';
  if (post.publish_error) return 'failed';
  if (post.status === 'scheduled' || post.status === 'approved') return 'approved';
  return 'pending';
}

const STATE_COLOR: Record<ItemState, string> = {
  published: 'var(--text-tertiary)',
  approved: 'var(--profit)',
  failed: 'var(--loss)',
  pending: 'var(--lavender)',
};

type Week = { start: number; posts: BoardPost[] };

export default function ApprovalBoard(props: Props) {
  const { posts, loading } = props;

  const { weeks, undated } = useMemo(() => {
    const map = new Map<number, BoardPost[]>();
    const noDate: BoardPost[] = [];
    for (const post of posts) {
      if (post.status === 'archived') continue;
      if (!post.scheduled_at) {
        if (post.status !== 'published') noDate.push(post);
        continue;
      }
      const p = israelDayParts(post.scheduled_at);
      const start = p.dayNumber - p.weekday;
      if (!map.has(start)) map.set(start, []);
      map.get(start)!.push(post);
    }
    const list: Week[] = Array.from(map.entries())
      .map(([start, items]) => ({ start, posts: items.sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1)) }))
      .sort((a, b) => a.start - b.start);
    return { weeks: list, undated: noDate };
  }, [posts]);

  const todayParts = israelDayParts(new Date().toISOString());
  const currentWeekStart = todayParts.dayNumber - todayParts.weekday;

  // ארכיון = שבועות שעברו ושכל הפריטים בהם כבר פורסמו (או שהשבוע כולו בעבר)
  const isArchived = (w: Week) => w.start + 6 < todayParts.dayNumber && w.posts.every((p) => p.status === 'published');
  const activeWeeks = weeks.filter((w) => !isArchived(w));
  const archivedWeeks = weeks.filter(isArchived);

  const months = useMemo(() => {
    const keys: { key: string; label: string; weeks: Week[] }[] = [];
    for (const w of activeWeeks) {
      const mid = dayNumberToDate(w.start + 3); // שבוע שייך לחודש שבו נמצא אמצע השבוע
      const key = `${mid.y}-${mid.m}`;
      let entry = keys.find((k) => k.key === key);
      if (!entry) {
        entry = { key, label: MONTH_NAMES[mid.m - 1], weeks: [] };
        keys.push(entry);
      }
      entry.weeks.push(w);
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  const [showArchive, setShowArchive] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  // ברירת מחדל: השבוע הראשון (מהשבוע הנוכחי והלאה) שיש בו משהו שממתין לאישור
  useEffect(() => {
    if (selectedWeek !== null && weeks.some((w) => w.start === selectedWeek)) return;
    const waiting = activeWeeks.find((w) => w.start + 6 >= currentWeekStart && w.posts.some((p) => itemState(p) === 'pending' || itemState(p) === 'failed'));
    const fallback = activeWeeks.find((w) => w.start >= currentWeekStart) || activeWeeks[activeWeeks.length - 1];
    const pick = waiting || fallback;
    if (pick) setSelectedWeek(pick.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  const visibleWeeks = showArchive ? archivedWeeks : activeWeeks;
  const week = weeks.find((w) => w.start === selectedWeek) || null;
  const selectedMonthKey = week ? (() => { const mid = dayNumberToDate(week.start + 3); return `${mid.y}-${mid.m}`; })() : null;

  if (loading) return <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>;

  if (weeks.length === 0 && undated.length === 0) {
    return (
      <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        אין כרגע תוכן שמחכה לאישור. החבילה הבאה תופיע כאן ברגע שתהיה מוכנה.
      </div>
    );
  }

  const reviewPost = reviewId ? posts.find((p) => p.id === reviewId) || null : null;
  const reviewQueue = week ? week.posts : [];

  return (
    <div>
      {/* חודשים */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {months.map((m) => {
          const active = !showArchive && selectedMonthKey === m.key;
          return (
            <button
              key={m.key}
              onClick={() => { setShowArchive(false); setSelectedWeek(m.weeks[0].start); }}
              style={chipStyle(active)}
            >
              {m.label}
            </button>
          );
        })}
        {archivedWeeks.length > 0 && (
          <button onClick={() => { setShowArchive(true); setSelectedWeek(archivedWeeks[archivedWeeks.length - 1].start); }} style={chipStyle(showArchive, true)}>
            ארכיון
          </button>
        )}
        {undated.length > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', alignSelf: 'center', marginRight: 'auto' }}>
            {undated.length} בלי תאריך (בלשונית &quot;כל הפוסטים&quot;)
          </span>
        )}
      </div>

      {/* שבועות בחודש הנבחר */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '12px' }}>
        {visibleWeeks
          .filter((w) => showArchive || (() => { const mid = dayNumberToDate(w.start + 3); return `${mid.y}-${mid.m}` === selectedMonthKey; })())
          .map((w) => {
            const total = w.posts.length;
            const done = w.posts.filter((p) => itemState(p) === 'approved' || itemState(p) === 'published').length;
            const allPublished = w.posts.every((p) => p.status === 'published');
            const active = w.start === selectedWeek;
            return (
              <button key={w.start} onClick={() => setSelectedWeek(w.start)} style={{ ...weekChipStyle(active), flexShrink: 0 }}>
                <span style={{ fontWeight: 600 }}><bdi dir="ltr">{weekLabel(w.start)}</bdi></span>
                <span style={{ fontSize: '11px', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {allPublished ? 'פורסם' : `${done}/${total} אושרו`}
                </span>
              </button>
            );
          })}
      </div>

      {week && (
        <WeekView
          week={week}
          isCurrentWeek={week.start === currentWeekStart}
          onOpen={(id) => setReviewId(id)}
          onApproveAll={async () => {
            const toApprove = week.posts.filter((p) => itemState(p) === 'pending' && p.scheduled_at && new Date(p.scheduled_at) > new Date());
            if (toApprove.length === 0) return;
            if (!confirm(`לאשר ולתזמן את כל ${toApprove.length} הפריטים שממתינים בשבוע הזה?`)) return;
            for (const p of toApprove) await props.onUpdate(p.id, { status: 'scheduled' });
          }}
          onRender={props.onRender}
        />
      )}

      {reviewPost && (
        <ReviewSheet
          post={reviewPost}
          index={reviewQueue.findIndex((p) => p.id === reviewPost.id)}
          total={reviewQueue.length}
          revising={props.revisingId === reviewPost.id}
          message={props.revisionMessage[reviewPost.id] || ''}
          error={props.errors[reviewPost.id] || ''}
          onClose={() => setReviewId(null)}
          onPrev={() => {
            const i = reviewQueue.findIndex((p) => p.id === reviewPost.id);
            if (i > 0) setReviewId(reviewQueue[i - 1].id);
          }}
          onNext={() => {
            const i = reviewQueue.findIndex((p) => p.id === reviewPost.id);
            if (i < reviewQueue.length - 1) setReviewId(reviewQueue[i + 1].id);
          }}
          onApproveAndNext={async () => {
            await props.onUpdate(reviewPost.id, { status: 'scheduled' });
            const i = reviewQueue.findIndex((p) => p.id === reviewPost.id);
            const next = reviewQueue.slice(i + 1).find((p) => itemState(p) === 'pending' || itemState(p) === 'failed')
              || reviewQueue.slice(0, i).find((p) => itemState(p) === 'pending' || itemState(p) === 'failed');
            setReviewId(next ? next.id : null);
          }}
          onUnapprove={() => props.onUpdate(reviewPost.id, { status: 'draft' })}
          onReschedule={(iso) => props.onUpdate(reviewPost.id, { scheduledAt: iso })}
          onRevise={(note) => props.onRevise(reviewPost.id, note)}
          onUndo={() => props.onUndo(reviewPost.id)}
          onFullEdit={() => { setReviewId(null); props.onOpenFullEdit(reviewPost.id); }}
        />
      )}
    </div>
  );
}

function chipStyle(active: boolean, muted = false): React.CSSProperties {
  return {
    padding: '7px 16px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: active ? 'none' : '1px solid var(--border-hairline-strong)',
    background: active ? 'var(--grad-brand)' : 'transparent',
    color: active ? '#1A181C' : muted ? 'var(--text-tertiary)' : 'var(--text-secondary)',
  };
}

function weekChipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: '8px 12px',
    borderRadius: '10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    background: active ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
    border: `1px solid ${active ? 'var(--teal)' : 'var(--border-hairline)'}`,
    color: 'var(--text-primary)',
  };
}

function WeekView({ week, isCurrentWeek, onOpen, onApproveAll, onRender }: {
  week: Week;
  isCurrentWeek: boolean;
  onOpen: (id: string) => void;
  onApproveAll: () => Promise<void>;
  onRender: (id: string) => Promise<void>;
}) {
  const counts = { published: 0, approved: 0, failed: 0, pending: 0 } as Record<ItemState, number>;
  week.posts.forEach((p) => { counts[itemState(p)]++; });
  const total = week.posts.length;
  const feedCount = week.posts.filter((p) => p.content_type !== 'story').length;
  const storyCount = total - feedCount;
  const pct = total ? Math.round(((counts.approved + counts.published) / total) * 100) : 0;

  const byDay: BoardPost[][] = Array.from({ length: 7 }, () => []);
  week.posts.forEach((p) => {
    const parts = israelDayParts(p.scheduled_at!);
    byDay[parts.dayNumber - week.start]?.push(p);
  });

  return (
    <div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRadius: '16px', padding: '14px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px', fontWeight: 700 }}>
            שבוע <bdi dir="ltr">{weekLabel(week.start)}</bdi>{isCurrentWeek ? ' · השבוע' : ''}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{feedCount} פוסטים · {storyCount} סטוריז</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-hairline)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--profit)', transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {[
              counts.approved ? `${counts.approved} אושרו` : '',
              counts.published ? `${counts.published} פורסמו` : '',
              counts.pending ? `${counts.pending} ממתינים` : '',
              counts.failed ? `${counts.failed} נכשלו` : '',
            ].filter(Boolean).join(' · ')}
          </span>
          {counts.pending > 0 && (
            <button onClick={onApproveAll} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
              אישור כל הממתינים
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {byDay.map((items, i) => {
          if (items.length === 0) return null;
          const date = dayNumberToDate(week.start + i);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: '10px', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '10px 12px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{date.d}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{DAY_NAMES[i]}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
                {items.map((post) => (
                  <Thumb key={post.id} post={post} onOpen={() => onOpen(post.id)} onRender={() => onRender(post.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Thumb({ post, onOpen, onRender }: { post: BoardPost; onOpen: () => void; onRender: () => void }) {
  const state = itemState(post);
  const imgs = imagesOf(post);
  const isStory = post.content_type === 'story';
  const w = isStory ? 54 : 76;
  const h = isStory ? 96 : 95;
  const hasSlides = Array.isArray(post.slides_html) && post.slides_html.length > 0;

  return (
    <button
      onClick={onOpen}
      aria-label={`${TYPE_LABEL[post.content_type]} ${post.hook || post.topic}`}
      style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <div style={{
        position: 'relative', width: `${w}px`, height: `${h}px`, borderRadius: '9px', overflow: 'hidden',
        background: 'var(--bg-surface-raised)',
        border: state === 'pending' ? '1.5px dashed var(--lavender)' : `1.5px solid ${STATE_COLOR[state]}`,
        opacity: state === 'published' ? 0.7 : 1,
      }}>
        {imgs[0] ? (
          <img src={`data:image/png;base64,${imgs[0]}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span
            onClick={(e) => { if (hasSlides) { e.stopPropagation(); onRender(); } }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10.5px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '4px' }}
          >
            {hasSlides ? 'יוצר תמונה...' : 'אין תמונה'}
          </span>
        )}
        {imgs.length > 1 && (
          <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(26,24,28,0.8)', color: '#F5F3F4', fontSize: '10px', fontWeight: 700, borderRadius: '6px', padding: '1px 5px' }}>
            {imgs.length}
          </span>
        )}
        {state !== 'pending' && (
          <span style={{ position: 'absolute', bottom: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: STATE_COLOR[state], color: '#1A181C', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {state === 'failed' ? '!' : '✓'}
          </span>
        )}
      </div>
      <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
        {TYPE_LABEL[post.content_type]} · {post.scheduled_at ? timeLabel(post.scheduled_at) : ''}
      </span>
    </button>
  );
}

function ReviewSheet(props: {
  post: BoardPost;
  index: number;
  total: number;
  revising: boolean;
  message: string;
  error: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onApproveAndNext: () => Promise<void>;
  onUnapprove: () => Promise<void>;
  onReschedule: (iso: string | null) => Promise<void>;
  onRevise: (note: string) => Promise<void>;
  onUndo: () => Promise<void>;
  onFullEdit: () => void;
}) {
  const { post } = props;
  const imgs = imagesOf(post);
  const [slide, setSlide] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [captionOpen, setCaptionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const touchX = useRef<number | null>(null);
  const state = itemState(post);
  const isStory = post.content_type === 'story';
  const isPast = post.scheduled_at ? new Date(post.scheduled_at) <= new Date() : false;

  useEffect(() => { setSlide(0); setNoteOpen(false); setNote(''); setCaptionOpen(false); }, [post.id]);
  useEffect(() => { if (slide >= imgs.length) setSlide(0); }, [imgs.length, slide]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
  const dateText = post.scheduled_at
    ? (() => { const p = israelDayParts(post.scheduled_at); return `${DAY_NAMES[p.weekday]} ${p.d}.${p.m} · ${timeLabel(post.scheduled_at)}`; })()
    : 'בלי תאריך';

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="בדיקת פריט"
      onClick={props.onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,9,11,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '520px', maxHeight: '96vh', overflowY: 'auto', background: 'var(--bg-void)', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', border: '1px solid var(--border-hairline-strong)', padding: '14px 16px 22px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={props.onPrev} disabled={props.index <= 0} aria-label="הפריט הקודם" style={navBtn(props.index <= 0)}>›</button>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{props.index + 1} מתוך {props.total}</span>
            <button onClick={props.onNext} disabled={props.index >= props.total - 1} aria-label="הפריט הבא" style={navBtn(props.index >= props.total - 1)}>‹</button>
          </div>
          <button onClick={props.onClose} aria-label="סגירה" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>{TYPE_LABEL[post.content_type]} · {dateText}</span>
          <span style={{ fontSize: '11.5px', color: STATE_COLOR[state], fontWeight: 600 }}>
            {state === 'approved' ? 'מאושר ומתוזמן' : state === 'published' ? 'פורסם' : state === 'failed' ? 'הפרסום נכשל' : 'ממתין לאישור'}
          </span>
        </div>

        {/* תמונה / שקפים */}
        <div
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) < 40) return;
            // RTL: החלקה שמאלה = השקף הבא
            if (dx < 0) setSlide((s) => Math.min(imgs.length - 1, s + 1));
            else setSlide((s) => Math.max(0, s - 1));
          }}
          style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', background: 'var(--bg-surface)', margin: '0 auto', maxWidth: isStory ? '300px' : '100%', aspectRatio: isStory ? '9 / 16' : '4 / 5' }}
        >
          {imgs[slide] ? (
            <img src={`data:image/png;base64,${imgs[slide]}`} alt={`שקף ${slide + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>התמונות עוד נוצרות...</div>
          )}
          {imgs.length > 1 && (
            <>
              <button onClick={() => setSlide((s) => Math.max(0, s - 1))} aria-label="שקף קודם" style={{ ...slideBtn, right: '8px', opacity: slide === 0 ? 0.3 : 1 }}>›</button>
              <button onClick={() => setSlide((s) => Math.min(imgs.length - 1, s + 1))} aria-label="שקף הבא" style={{ ...slideBtn, left: '8px', opacity: slide === imgs.length - 1 ? 0.3 : 1 }}>‹</button>
            </>
          )}
        </div>
        {imgs.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
            {imgs.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} aria-label={`שקף ${i + 1}`} style={{ width: i === slide ? '18px' : '7px', height: '7px', borderRadius: '4px', border: 'none', padding: 0, cursor: 'pointer', background: i === slide ? 'var(--teal)' : 'var(--border-hairline-strong)', transition: 'width .2s' }} />
            ))}
          </div>
        )}

        {/* כיתוב */}
        {caption && (
          <div style={{ marginTop: '12px', background: 'var(--bg-surface)', borderRadius: '12px', padding: '10px 12px' }}>
            <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)', maxHeight: captionOpen ? 'none' : '4.8em', overflow: 'hidden' }}>{caption}</div>
            <button onClick={() => setCaptionOpen((o) => !o)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '12px', cursor: 'pointer', padding: '4px 0 0', fontFamily: 'inherit' }}>
              {captionOpen ? 'פחות' : 'לכיתוב המלא'}
            </button>
          </div>
        )}
        <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
          {PLATFORM_LABEL[post.platform]}{isStory ? ' · בסטורי אין כיתוב, הכל בתוך התמונה' : ''}
        </div>

        {post.publish_error && <p style={{ fontSize: '12px', color: 'var(--loss)', marginTop: '8px' }}>{post.publish_error}</p>}
        {props.error && <p style={{ fontSize: '12px', color: 'var(--loss)', marginTop: '8px' }}>{props.error}</p>}
        {props.message && <p style={{ fontSize: '12px', color: 'var(--profit)', marginTop: '8px' }}>{props.message}</p>}

        {/* פעולות */}
        {state !== 'published' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            {(state === 'pending' || state === 'failed') && (
              <button
                className="btn-primary"
                disabled={busy || props.revising || !post.scheduled_at || isPast || imgs.length === 0}
                onClick={() => run(props.onApproveAndNext)}
              >
                {busy ? 'שומרים...' : !post.scheduled_at || isPast ? 'צריך לבחור זמן פרסום עתידי' : state === 'failed' ? '↻ אישור וניסיון פרסום חוזר' : '✓ אישור והבא'}
              </button>
            )}
            {state === 'approved' && (
              <button className="btn-outline" disabled={busy} onClick={() => run(props.onUnapprove)}>ביטול האישור (חזרה לטיוטה)</button>
            )}

            {!noteOpen ? (
              <button className="btn-outline" disabled={props.revising} onClick={() => setNoteOpen(true)}>
                {props.revising ? 'מתקנים... (עד חצי דקה)' : '✨ הערה לתיקון'}
              </button>
            ) : (
              <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', padding: '10px' }}>
                <textarea
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  disabled={props.revising}
                  placeholder={imgs.length > 1 ? 'למשל: בשקף 3 הכותרת ארוכה מדי / תוסיפי שאלה לקהל בסוף הכיתוב' : 'למשל: תעשי את הכותרת יותר קצרה ונוקבת'}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-hairline-strong)', background: 'var(--bg-void)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    disabled={props.revising || !note.trim()}
                    onClick={async () => { await props.onRevise(note.trim()); setNote(''); setNoteOpen(false); }}
                  >
                    {props.revising ? 'מתקנים...' : 'תקן לפי ההערה'}
                  </button>
                  <button className="btn-outline" style={{ width: 'auto', padding: '13px 18px' }} onClick={() => setNoteOpen(false)}>ביטול</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                זמן פרסום
                <input
                  type="datetime-local"
                  key={post.scheduled_at || 'none'}
                  defaultValue={toLocalInputValue(post.scheduled_at)}
                  onBlur={(e) => {
                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
                    if (iso !== post.scheduled_at) props.onReschedule(iso);
                  }}
                  style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-hairline-strong)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'inherit' }}
                />
              </label>
              {Array.isArray(post.revision_history) && post.revision_history.length > 0 && (
                <button onClick={() => run(props.onUndo)} disabled={busy || props.revising} style={linkBtn}>↩ חזרה לגרסה הקודמת</button>
              )}
              <button onClick={props.onFullEdit} style={linkBtn}>עריכה מלאה</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const slideBtn: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '36px', height: '36px', borderRadius: '50%',
  border: 'none', background: 'rgba(26,24,28,0.7)', color: '#F5F3F4', fontSize: '22px', cursor: 'pointer', lineHeight: 1,
};

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--teal)', fontSize: '12px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' };

function navBtn(disabled: boolean): React.CSSProperties {
  return { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--border-hairline-strong)', background: 'transparent', color: disabled ? 'var(--border-hairline-strong)' : 'var(--text-primary)', fontSize: '18px', cursor: disabled ? 'default' : 'pointer', lineHeight: 1 };
}
