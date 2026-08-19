'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { visibleSteps, visibleQuestions } from '@/lib/tradingPlan/questions';
import { classifyProfile } from '@/lib/tradingPlan/profile';
import QuestionCard from '@/components/tradingPlan/QuestionCard';
import ProgressBar from '@/components/tradingPlan/ProgressBar';
import SummaryScreen from '@/components/tradingPlan/SummaryScreen';

const DRAFT_KEY = 'tp_draft_v1';
type Phase = 'intro' | 'contact' | 'quiz' | 'summary';

interface Draft {
  id: string;
  answers: Record<string, unknown>;
  stepIndex: number;
  phase: 'contact' | 'quiz';
}

export default function TradingPlanPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [responseId, setResponseId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const [showNudge, setShowNudge] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeShownRef = useRef(false);

  // אחרי קצת חוסר פעילות באמצע הטופס/שאלון - תזכורת עדינה שחבל לנטוש, מוצגת פעם אחת בלבד
  function armIdleNudge() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setShowNudge(false);
    if (nudgeShownRef.current) return;
    if (phase !== 'contact' && phase !== 'quiz') return;
    idleTimerRef.current = setTimeout(() => {
      nudgeShownRef.current = true;
      setShowNudge(true);
    }, 10000);
  }

  // טעינת מקור (UTM/פרמטר), המשך משמור מלינק במייל (?resume=id), או טיוטה שמורה בדפדפן
  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
      setSource(params.get('source'));
    } catch {
      params = new URLSearchParams();
    }

    // הגעה מהאזור האישי של מנוי מחובר - השם/טלפון/מייל כבר ידועים, לא צריך להקליד אותם שוב
    const prefillName = params.get('prefillName');
    const prefillPhone = params.get('prefillPhone');
    const prefillEmail = params.get('prefillEmail');
    if (prefillName || prefillPhone || prefillEmail) {
      setAnswers((prev) => ({
        ...prev,
        ...(prefillName ? { name: prefillName } : {}),
        ...(prefillPhone ? { phone: prefillPhone } : {}),
        ...(prefillEmail ? { email: prefillEmail } : {}),
      }));
    }

    const resumeId = params.get('resume');
    if (resumeId) {
      fetch(`/api/trading-plan?id=${encodeURIComponent(resumeId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const row = data?.row;
          if (!row) return; // לינק לא תקין/כבר הושלם - נשארים במסך הפתיחה הרגיל
          const restoredAnswers = { ...row } as Record<string, unknown>;
          const restoredStep: 'contact' | 'quiz' = row.current_step ? 'quiz' : 'contact';
          const restoredStepIndex = row.current_step ? Math.max(0, Math.min(row.current_step - 1, visibleSteps(restoredAnswers).length - 1)) : 0;

          setResponseId(row.id);
          setAnswers(restoredAnswers);
          setStepIndex(restoredStepIndex);
          setPhase(restoredStep);
          saveDraft(row.id, restoredAnswers, restoredStepIndex, restoredStep);
        })
        .catch(() => {});
      return;
    }

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: Draft = JSON.parse(raw);
        if (draft?.id) {
          setResponseId(draft.id);
          setAnswers(draft.answers || {});
          setStepIndex(draft.stepIndex || 0);
          setPhase(draft.phase || 'contact');
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    armIdleNudge();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex]);

  function saveDraft(id: string, nextAnswers: Record<string, unknown>, nextStepIndex: number, nextPhase: 'contact' | 'quiz') {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, answers: nextAnswers, stepIndex: nextStepIndex, phase: nextPhase }));
    } catch {}
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  async function autosave(id: string | null, fields: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch('/api/trading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id, ...fields } : fields),
      });
      if (!res.ok) return id;
      const data = await res.json();
      return data.id || id;
    } catch {
      return id; // כשל ברשת לא אמור לעצור את המשתמש - ננסה שוב בשלב הבא
    }
  }

  async function handleStart() {
    setLoadingNext(true);
    const id = await autosave(null, { source, current_step: 0 });
    setLoadingNext(false);
    if (id) {
      setResponseId(id);
      saveDraft(id, {}, 0, 'contact');
    }
    setPhase('contact');
  }

  function handleAnswerChange(questionId: string, value: unknown) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (responseId) saveDraft(responseId, next, stepIndex, phase === 'contact' ? 'contact' : 'quiz');
      return next;
    });
    armIdleNudge();
  }

  const effectiveSteps = visibleSteps(answers);
  const currentStep = effectiveSteps[stepIndex];
  const currentVisibleQuestions = currentStep ? visibleQuestions(currentStep, answers) : [];

  const canProceed = currentVisibleQuestions.every((q) => {
    if (q.optional) return true;
    const v = answers[q.id];
    if (q.type === 'multi') return Array.isArray(v) && v.length > 0;
    if (q.type === 'text') return typeof v === 'string' && v.trim().length > 0;
    return typeof v === 'string' && v.length > 0;
  });

  async function handleNext() {
    setLoadingNext(true);
    const isLastStep = stepIndex === effectiveSteps.length - 1;
    const nextStepIndex = stepIndex + 1;

    const id = await autosave(responseId, { current_step: nextStepIndex + 1, ...answers });
    if (id && !responseId) setResponseId(id);

    if (isLastStep) {
      if (id) {
        await autosave(id, { computed_profile: classifyProfile(answers) });
        await fetch('/api/trading-plan', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'complete' }),
        }).catch(() => null);

        // שליחת המיילים (למשתמש + לשירן) - לא חוסמים את הצגת התוכנית על המסך אם זה נכשל
        fetch('/api/trading-plan/send-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => {});
      }

      clearDraft();
      setLoadingNext(false);
      setPhase('summary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (id) saveDraft(id, answers, nextStepIndex, 'quiz');
    setStepIndex(nextStepIndex);
    setLoadingNext(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }
  function isValidPhone(v: string) {
    return /^05\d{8}$/.test(v.replace(/\D/g, ''));
  }

  const phoneOk = typeof answers.phone === 'string' && isValidPhone(answers.phone);
  const emailOk = typeof answers.email === 'string' && isValidEmail(answers.email);
  const contactValid = emailOk && phoneOk;

  async function handleContactContinue() {
    if (!contactValid) return;
    setLoadingNext(true);

    const id = await autosave(responseId, {
      name: answers.name || null,
      phone: answers.phone,
      email: answers.email,
      current_step: 1,
    });
    if (id && !responseId) setResponseId(id);

    if (id) saveDraft(id, answers, 0, 'quiz');
    setLoadingNext(false);
    setPhase('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBack() {
    if (stepIndex === 0) {
      setPhase('contact');
      return;
    }
    const prevStepIndex = stepIndex - 1;
    setStepIndex(prevStepIndex);
    if (responseId) saveDraft(responseId, answers, prevStepIndex, 'quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCtaClick() {
    if (responseId) {
      fetch('/api/trading-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: responseId, action: 'cta_click' }),
      }).catch(() => {});
    }
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      {phase === 'intro' && (
        <>
          <div className="tp-intro-badge">10 דקות · תוכנית אישית</div>
          <div className="form-title">תוכנית המסחר שלי ל-30 הימים הקרובים</div>
          <div className="tp-intro-text">
            רובנו משקיעים המון זמן בלחפש עוד אינדיקטור, עוד אסטרטגיה ועוד סרטון על מסחר.
            {'\n\n'}
            אבל לפני כל זה יש כמה שאלות הרבה יותר בסיסיות: <strong>מתי אני סוחר? מה אני מחפש? כמה אני מוכן לסכן? מה גורם לי להיכנס? ומתי אני פשוט לא לוקח עסקה?</strong>
            {'\n\n'}
            הכנתי לכם תהליך קצר שיעזור לכם לעשות קצת סדר ולצאת מכאן עם תוכנית עבודה ברורה יותר ל-30 הימים הקרובים. בלי חפירות ובלי עוד 74 אינדיקטורים על הגרף :)
          </div>
          <button type="button" className="btn-primary" onClick={handleStart} disabled={loadingNext}>
            בואו נבנה את התוכנית שלי
          </button>
        </>
      )}

      {phase === 'contact' && (
        <>
          <div className="tp-step-title">לפני שמתחילים - לאן לשלוח את התוכנית?</div>
          <div className="tp-step-intro">
            נייד ומייל, כדי שנוכל לשלוח אליכם את התוכנית האישית בסוף - ואם תצטרכו לעצור באמצע, נוכל תמיד לחזור אליה יחד איתכם.
          </div>

          <div className="tp-question-card">
            <div className="tp-question-title">שם</div>
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto' }}
              value={typeof answers.name === 'string' ? answers.name : ''}
              onChange={(e) => handleAnswerChange('name', e.target.value)}
              onBlur={() => { if (responseId && answers.name) autosave(responseId, { name: answers.name }); }}
              placeholder="השם שלך"
            />
          </div>

          <div className="tp-question-card">
            <div className="tp-question-title">נייד</div>
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto', ...(phoneTouched && !phoneOk ? { borderColor: 'var(--loss)' } : {}) }}
              type="tel"
              value={typeof answers.phone === 'string' ? answers.phone : ''}
              onChange={(e) => handleAnswerChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              onBlur={() => { setPhoneTouched(true); if (responseId && phoneOk) autosave(responseId, { phone: answers.phone }); }}
              placeholder="050-1234567"
            />
            {phoneTouched && !phoneOk && (
              <div style={{ color: 'var(--loss)', fontSize: '12px', marginTop: '6px' }}>
                מספר נייד לא תקין - לדוגמה 0501234567
              </div>
            )}
          </div>

          <div className="tp-question-card">
            <div className="tp-question-title">אימייל</div>
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto', ...(emailTouched && !emailOk ? { borderColor: 'var(--loss)' } : {}) }}
              type="email"
              value={typeof answers.email === 'string' ? answers.email : ''}
              onChange={(e) => handleAnswerChange('email', e.target.value)}
              onBlur={() => { setEmailTouched(true); if (responseId && emailOk) autosave(responseId, { email: answers.email }); }}
              placeholder="name@example.com"
            />
            {emailTouched && !emailOk && (
              <div style={{ color: 'var(--loss)', fontSize: '12px', marginTop: '6px' }}>
                כתובת אימייל לא תקינה
              </div>
            )}
          </div>

          <div className="tp-nav-row">
            <button type="button" className="tp-btn-back" onClick={() => setPhase('intro')}>חזרה</button>
            <button type="button" className="tp-btn-next" onClick={handleContactContinue} disabled={!contactValid || loadingNext}>
              המשך לשאלון
            </button>
          </div>
        </>
      )}

      {phase === 'quiz' && currentStep && (
        <>
          <ProgressBar stepIndex={stepIndex} totalSteps={effectiveSteps.length} onBack={handleBack} />
          <div className="tp-step-title">{currentStep.title}</div>
          {currentStep.intro && <div className="tp-step-intro">{currentStep.intro}</div>}

          {currentVisibleQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => handleAnswerChange(q.id, v)}
            />
          ))}

          <div className="tp-nav-row">
            <button type="button" className="tp-btn-back" onClick={handleBack}>חזרה</button>
            <button type="button" className="tp-btn-next" onClick={handleNext} disabled={!canProceed || loadingNext}>
              {stepIndex === effectiveSteps.length - 1 ? 'לסיכום התוכנית שלי' : 'המשך'}
            </button>
          </div>
        </>
      )}

      {phase === 'summary' && (
        <>
          {typeof answers.email === 'string' && answers.email && (
            <div className="tp-personal-note" style={{ textAlign: 'center', marginBottom: '20px' }}>
              📧 שלחנו את התוכנית גם לאימייל {answers.email}
            </div>
          )}
          <SummaryScreen answers={answers} onCtaClick={handleCtaClick} responseId={responseId} />
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>

      {showNudge && (phase === 'contact' || phase === 'quiz') && (
        <div
          style={{
            position: 'fixed',
            insetInlineStart: 0,
            insetInlineEnd: 0,
            bottom: 0,
            zIndex: 50,
            background: '#111318',
            borderTop: '1px solid #2a2e37',
            padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '13.5px', color: '#fff', lineHeight: 1.5 }}>
            עוד קצת ותוכנית המסחר האישית שלך נשלחת אלייך למייל 😊<br />
            חבל לנטוש באמצע!
          </div>
          <button
            type="button"
            onClick={() => setShowNudge(false)}
            aria-label="סגירה"
            style={{ background: 'none', border: 'none', color: '#888', fontSize: '22px', lineHeight: 1, cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
