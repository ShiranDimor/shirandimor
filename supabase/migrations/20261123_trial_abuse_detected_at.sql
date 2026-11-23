-- זיהוי ניצול חוזר של הטבת "חודש ראשון ב-1 ש"ח" - כבר הוחל על פרויקט ה-Supabase (shirandimor)
-- ב-23.11.2026. הקובץ כאן לתיעוד בלבד.
-- profiles.trial_abuse_detected_at timestamptz, null כברירת מחדל. מסומן ב-lib/subscriberStatus.ts
-- (ensureActiveSubscriberAccount) כש-trial_price_used היה כבר true על הפרופיל לפני תשלום חדש
-- של בדיוק 1 ש"ח - כלומר מישהו שכבר ניצל את ההטבה (גם אם ביטל בינתיים) מנסה לנצל אותה שוב.
-- לא חוסם את התשלום עצמו (זה קורה ב-Grow, מחוץ למערכת שלנו) - רק מדלג על רצף הקליטה/תזכורות
-- היומן (ששמורים למי שמצטרף/ת חדש/ה באמת) ומתריע לשירן כדי שתטפל ידנית.
alter table profiles add column if not exists trial_abuse_detected_at timestamptz;
