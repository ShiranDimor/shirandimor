'use client';

import { useEffect } from 'react';
import { captureSourceFromUrl } from '@/lib/attribution';
import { trackFunnelEvent, trackLightEvent } from '@/lib/trackEvent';

// מדידה בעמוד הליווי האישי, על גבי מערכת האירועים הקיימת באתר (Vercel Analytics + משפך בדאטהבייס + Meta Pixel):
// צפייה בעמוד, עומק גלילה (25/50/75/100), ולחיצה על כל כפתור שמסומן data-cta (קביעת שיחה / גלילה פנימית)
export default function MentoringTracker() {
  useEffect(() => {
    captureSourceFromUrl();
    trackFunnelEvent('mentoring_page_view');

    const sent = new Set<number>();
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = (window.scrollY / max) * 100;
      for (const mark of [25, 50, 75, 100]) {
        if (pct >= mark - 1 && !sent.has(mark)) {
          sent.add(mark);
          trackLightEvent('mentoring_scroll_depth', { depth: mark });
        }
      }
    }

    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cta]');
      if (!el) return;
      const cta = el.dataset.cta || '';
      // לחיצה שמובילה לשיחת ההתאמה נספרת במשפך; כפתורי גלילה פנימיים (סילבוס, מחירים) - רק כאירוע קל
      if (el.dataset.ctaKind === 'book') trackFunnelEvent('mentoring_cta_click', undefined, { cta });
      else trackLightEvent('mentoring_nav_click', { cta });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return null;
}
