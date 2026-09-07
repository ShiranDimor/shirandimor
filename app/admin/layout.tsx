import SalesLeadsNotifier from '@/components/salesLeads/SalesLeadsNotifier';

// Layout משותף לכל אזור האדמין - מוסיף Badge/Notification גלובליים ל-Follow-ups של מערכת
// המכירות בלי לגעת בדפי האדמין הקיימים עצמם (כל דף ממשיך לצייר את ה-header/מבנה שלו כרגיל)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SalesLeadsNotifier />
    </>
  );
}
