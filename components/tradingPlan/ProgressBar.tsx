'use client';

interface Props {
  stepIndex: number; // 0-based
  totalSteps: number;
  onBack?: () => void;
}

export default function ProgressBar({ stepIndex, totalSteps, onBack }: Props) {
  const pct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  return (
    <div className="tp-progress-wrap">
      <div className="tp-progress-top-row">
        {onBack && (
          <button type="button" className="tp-progress-back" onClick={onBack} aria-label="חזרה">
            ←
          </button>
        )}
        <div className="tp-progress-label">
          <span>שלב {stepIndex + 1} מתוך {totalSteps}</span>
          <span>{pct}%</span>
        </div>
      </div>
      <div className="tp-progress-track">
        <div className="tp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
