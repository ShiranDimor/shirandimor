-- אישור תקנון בצ'קבוקס - כבר הוחל על פרויקט ה-Supabase (shirandimor) ב-22.11.2026.
-- הקובץ כאן לתיעוד בלבד.
-- profiles.terms_accepted_at timestamptz, null כברירת מחדל.
-- מנויים פעילים שכבר היו קיימים לפני הפיצ'ר - גובו אוטומטית (terms_accepted_at = subscription_started_at),
-- כדי שלא יוצגו עם חסימה בפתע על משהו שכבר הסכימו לו כשנרשמו. רק מי שנכנס/ת לאתר מעתה
-- ועדיין terms_accepted_at is null באמת צריך/ה לאשר דרך הצ'קבוקס (ר' components/TermsGate.tsx).
alter table profiles add column if not exists terms_accepted_at timestamptz;
