'use client';

import { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  onClear: () => void;
};

export default function ClearableInput({ onClear, value, style, ...rest }: Props) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className="clearable-wrap">
      <input value={value} style={{ ...style, paddingLeft: hasValue ? '34px' : undefined }} {...rest} />
      {hasValue && (
        <button type="button" className="input-clear" onClick={onClear} aria-label="ניקוי שדה" tabIndex={-1}>
          ×
        </button>
      )}
    </div>
  );
}
