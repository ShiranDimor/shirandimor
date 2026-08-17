'use client';

import { Question } from '@/lib/tradingPlan/questions';

interface Props {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function QuestionCard({ question, value, onChange }: Props) {
  return (
    <div className="tp-question-card">
      <div className="tp-question-title">{question.title}</div>
      {question.helper && <div className="tp-question-helper">{question.helper}</div>}

      {question.type === 'single' && (
        <div className="tp-options">
          {question.options!.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`tp-option-btn${selected ? ' selected' : ''}`}
                onClick={() => onChange(opt.value)}
              >
                <span>{opt.label}</span>
                <span className="tp-option-check">{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'multi' && (
        <div className="tp-options">
          {question.options!.map((opt) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const selected = arr.includes(opt.value);
            const atMax = question.maxSelect ? arr.length >= question.maxSelect : false;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!selected && atMax}
                className={`tp-option-btn${selected ? ' selected' : ''}`}
                onClick={() => {
                  if (selected) {
                    onChange(arr.filter((v) => v !== opt.value));
                  } else {
                    if (atMax) return;
                    onChange([...arr, opt.value]);
                  }
                }}
              >
                <span>{opt.label}</span>
                <span className="tp-option-check">{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'text' && (
        <textarea
          className="tp-text-input"
          placeholder={question.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )}
    </div>
  );
}
