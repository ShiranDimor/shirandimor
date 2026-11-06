'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type FontLevel = 'normal' | 'large' | 'xlarge';

const STORAGE_KEY = 'a11y_prefs_v1';

type Prefs = {
  font: FontLevel;
  highContrast: boolean;
  noMotion: boolean;
  underlineLinks: boolean;
};

const DEFAULT_PREFS: Prefs = { font: 'normal', highContrast: false, noMotion: false, underlineLinks: false };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_PREFS;
  }
}

function applyPrefs(prefs: Prefs) {
  const html = document.documentElement;
  html.classList.toggle('a11y-font-lg', prefs.font === 'large');
  html.classList.toggle('a11y-font-xl', prefs.font === 'xlarge');
  html.classList.toggle('a11y-high-contrast', prefs.highContrast);
  html.classList.toggle('a11y-no-motion', prefs.noMotion);
  html.classList.toggle('a11y-underline-links', prefs.underlineLinks);
}

// ווידג'ט נגישות גלובלי - כפתור צף שפותח פאנל עם התאמות נגישות (גודל טקסט, ניגודיות גבוהה,
// עצירת אנימציות, הדגשת קישורים). ההעדפות נשמרות בדפדפן (per-device, לא מסונכרן) ומיושמות
// כקלאסים על ה-html כדי שה-CSS ב-globals.css יוכל להגיב להן בכל עמוד. ר' /accessibility
// להצהרת הנגישות המלאה - נדרש כחלק מתקנות הנגישות הישראליות (תקן 5568 / י"ג)
export default function AccessibilityWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadPrefs();
    setPrefs(loaded);
    applyPrefs(loaded);
    setReady(true);
  }, []);

  function update(next: Partial<Prefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    applyPrefs(merged);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      // אחסון חסום (למשל גלישה פרטית) - ההעדפה עדיין פעילה לסשן הנוכחי, פשוט לא נשמרת לפעם הבאה
    }
  }

  function reset() {
    update(DEFAULT_PREFS);
  }

  if (!ready) return null;
  // עמוד המשחק הפרטי של דור - בלי שום כפתור צף של האתר, כמו שאר הרכיבים הגלובליים
  if (pathname?.startsWith('/dor-english')) return null;

  return (
    <>
      <button type="button" className="a11y-float-btn" onClick={() => setOpen((v) => !v)} aria-label="התאמות נגישות">
        ♿
      </button>

      {open && (
        <div className="notif-bell-backdrop" onClick={() => setOpen(false)}>
          <div className="notif-bell-panel" style={{ top: 'auto', bottom: '84px', left: '16px' }} onClick={(e) => e.stopPropagation()}>
            <div className="notif-bell-panel-header">
              <span>♿ נגישות</span>
              <button type="button" className="notif-bell-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="a11y-panel-body">
              <div className="a11y-row">
                <span>גודל טקסט</span>
                <div className="a11y-font-steps">
                  <button type="button" className={prefs.font === 'normal' ? 'active' : ''} onClick={() => update({ font: 'normal' })}>רגיל</button>
                  <button type="button" className={prefs.font === 'large' ? 'active' : ''} onClick={() => update({ font: 'large' })}>גדול</button>
                  <button type="button" className={prefs.font === 'xlarge' ? 'active' : ''} onClick={() => update({ font: 'xlarge' })}>גדול מאוד</button>
                </div>
              </div>
              <label className="a11y-row a11y-toggle">
                <span>ניגודיות גבוהה</span>
                <input type="checkbox" checked={prefs.highContrast} onChange={(e) => update({ highContrast: e.target.checked })} />
              </label>
              <label className="a11y-row a11y-toggle">
                <span>עצירת אנימציות</span>
                <input type="checkbox" checked={prefs.noMotion} onChange={(e) => update({ noMotion: e.target.checked })} />
              </label>
              <label className="a11y-row a11y-toggle">
                <span>הדגשת קישורים</span>
                <input type="checkbox" checked={prefs.underlineLinks} onChange={(e) => update({ underlineLinks: e.target.checked })} />
              </label>
              <button type="button" className="btn-outline" style={{ marginTop: '10px', padding: '8px', fontSize: '12.5px' }} onClick={reset}>
                איפוס הגדרות
              </button>
              <a href="/accessibility" className="a11y-statement-link" onClick={() => setOpen(false)}>הצהרת הנגישות המלאה ←</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
