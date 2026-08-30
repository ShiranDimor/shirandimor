// הופך כתובות URL בתוך טקסט חופשי (כמו תשובות של דור) לקישורים שאפשר ללחוץ עליהם -
// גם בנייד וגם בדסקטופ. בלי זה קישור שדור שולחת מוצג כטקסט רגיל שאי אפשר ללחוץ עליו.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export default function Linkify({ text }: { text: string }) {
  // ה-regex כולל קבוצת לכידה, ולכן split מחזיר את הכתובות עצמן כאיברים באינדקסים אי-זוגיים
  // בתוך המערך - זה מונע להסתמך על test() על regex גלובלי (עם state פנימי שמשתנה בין קריאות)
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
