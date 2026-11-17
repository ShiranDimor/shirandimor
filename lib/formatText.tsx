import React from 'react';

const URL_PATTERN = /(https?:\/\/[^\s*]+)/;

// תומך בהדגשה בסגנון וואטסאפ - *מודגש* הופך בתצוגה למילה/משפט מודגש בפועל (bold), בלי עורך
// טקסט עשיר בצד הניהול - רק מוסכמה פשוטה שכבר מוכרת למי שרגיל/ה לכתוב בוואטסאפ. קישורים
// (https://...) שמוקלדים בטקסט הופכים אוטומטית ללחיצים, בלי תחביר מיוחד בשביל זה
export function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <strong key={i}><Linkify text={part.slice(1, -1)} /></strong>;
        }
        return <Linkify key={i} text={part} />;
      })}
    </>
  );
}

function Linkify({ text }: { text: string }) {
  const segments = text.split(URL_PATTERN);
  return (
    <>
      {segments.map((seg, i) =>
        URL_PATTERN.test(seg)
          ? <a key={i} href={seg} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'underline' }}>{seg}</a>
          : <React.Fragment key={i}>{seg}</React.Fragment>
      )}
    </>
  );
}
