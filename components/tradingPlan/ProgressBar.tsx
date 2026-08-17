'use client';

interface Props {
  stepIndex: number; // 0-based
  totalSteps: number;
}

export default function ProgressBar({ stepIndex, totalSteps }: Props) {
  const pct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  return (
    <div className="tp-progress-wrap">
      <div className="tp-progress-label">
        <span>שלב {stepIndex + 1} מתוך {totalSteps}</span>
        <span>{pct}%</span>
      </div>
      <div className="tp-progress-track">
        <div className="tp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
