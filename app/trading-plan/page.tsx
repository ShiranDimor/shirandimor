'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { visibleSteps, visibleQuestions } from '@/lib/tradingPlan/questions';
import { classifyProfile } from '@/lib/tradingPlan/profile';
import QuestionCard from '@/components/tradingPlan/QuestionCard';
import ProgressBar from '@/components/tradingPlan/ProgressBar';
import SummaryScreen from '@/components/tradingPlan/SummaryScreen';

const DRAFT_KEY = 'tp_draft_v1';
type Phase = 'intro' | 'quiz' | 'contact' | 'summary' | 'duplicate';

interface Draft {
  id: string;
  answers: Record<string, unknown>;
  stepIndex: number;
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

  // טעינת מקור (UTM/פרמטר) וטיוטה שמורה, אם קיימת
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setSource(params.get('source'));
    } catch {}

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: Draft = JSON.parse(raw);
        if (draft?.id) {
          setResponseId(draft.id);
          setAnswers(draft.answers || {});
          setStepIndex(draft.stepIndex || 0);
          setPhase('quiz');
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveDraft(id: string, nextAnswers: Record<string, unknown>, nextStepIndex: number) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, answers: nextAnswers, stepIndex: nextStepIndex }));
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
    const id = await autosave(null, { source, current_step: 1 });
    setLoadingNext(false);
    if (id) {
      setResponseId(id);
      saveDraft(id, {}, 0);
    }
    setPhase('quiz');
  }

  function handleAnswerChange(questionId: string, value: unknown) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (responseId) saveDraft(responseId, next, stepIndex);
      return next;
    });
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
      if (id) saveDraft(id, answers, stepIndex); // שומרים טיוטה - עדיין לא הושלם עד שיוזנו פרטי קשר
      setLoadingNext(false);
      setPhase('contact');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (id) saveDraft(id, answers, nextStepIndex);
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

  async function handleContactSubmit() {
    if (!contactValid) return;
    setLoadingNext(true);

    const id = await autosave(responseId, {
      name: answers.name || null,
      phone: answers.phone,
      email: answers.email,
      computed_profile: classifyProfile(answers),
    });

    if (id) {
      const completeRes = await fetch('/api/trading-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'complete' }),
      }).catch(() => null);

      if (completeRes && completeRes.status === 409) {
        clearDraft();
        setLoadingNext(false);
        setPhase('duplicate');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

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
  }

  function handleBack() {
    if (stepIndex === 0) {
      setPhase('intro');
      return;
    }
    const prevStepIndex = stepIndex - 1;
    setStepIndex(prevStepIndex);
    if (responseId) saveDraft(responseId, answers, prevStepIndex);
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

      {phase === 'contact' && (
        <>
          <div className="tp-step-title">לאן לשלוח את התוכנית?</div>
          <div className="tp-step-intro">
            התוכנית האישית מוכנה. תשאירו נייד ומייל ונשלח אותה אליכם, כדי שתוכלו לחזור אליה בכל רגע - גם כשתשבו מול המסך עם עסקה פתוחה.
          </div>

          <div className="tp-question-card">
            <div className="tp-question-title">שם</div>
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto' }}
              value={typeof answers.name === 'string' ? answers.name : ''}
              onChange={(e) => handleAnswerChange('name', e.target.value)}
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
              onBlur={() => setPhoneTouched(true)}
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
              onBlur={() => setEmailTouched(true)}
              placeholder="name@example.com"
            />
            {emailTouched && !emailOk && (
              <div style={{ color: 'var(--loss)', fontSize: '12px', marginTop: '6px' }}>
                כתובת אימייל לא תקינה
              </div>
            )}
          </div>

          <div className="tp-nav-row">
            <button type="button" className="tp-btn-back" onClick={() => setPhase('quiz')}>חזרה</button>
            <button type="button" className="tp-btn-next" onClick={handleContactSubmit} disabled={!contactValid || loadingNext}>
              שלחו לי את התוכנית
            </button>
          </div>
        </>
      )}

      {phase === 'duplicate' && (
        <>
          <div className="tp-step-title">כבר יש לך תוכנית אצלנו :)</div>
          <div className="tp-personal-note" style={{ textAlign: 'center' }}>
            נראה שכבר בנית תוכנית מסחר בעבר עם הפרטים האלה - השאלון הזה נועד להתמלא פעם אחת. אם איבדת את המייל עם התוכנית, אפשר לפנות בוואטסאפ ונשלח אותה שוב.
          </div>
          <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '16px' }}>
            שליחת הודעה בוואטסאפ ←
          </a>
          <Link href="/subscribe" className="cta-sub-link" style={{ display: 'block', textAlign: 'center', marginTop: '16px' }}>
            להכיר את קבוצת הסוחרים <span>←</span>
          </Link>
        </>
      )}

      {phase === 'summary' && (
        <>
          {typeof answers.email === 'string' && answers.email && (
            <div className="tp-personal-note" style={{ textAlign: 'center', marginBottom: '20px' }}>
              📧 שלחנו את התוכנית גם לאימייל {answers.email}
            </div>
          )}
          <SummaryScreen answers={answers} onCtaClick={handleCtaClick} />
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
