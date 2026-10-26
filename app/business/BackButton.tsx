'use client';

import { useRouter } from 'next/navigation';

// חוזר לדף הקודם באתר. מי שהגיע ישירות מלינק (מייל, וואטסאפ) ואין לו דף קודם באתר - עובר לדף הבית.
export default function BackButton() {
  const router = useRouter();

  function goBack() {
    let cameFromSite = false;
    try {
      cameFromSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch {
      cameFromSite = false;
    }
    if (cameFromSite && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <button type="button" className="biz-back" onClick={goBack}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
      חזרה
    </button>
  );
}
