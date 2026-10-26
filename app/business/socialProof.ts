// חומרי "הוכחה חברתית" לעמוד לארגונים. כל רשימה שריקה פשוט לא מוצגת בעמוד,
// כך שאפשר להוסיף חומרים בהדרגה בלי לגעת בעיצוב.
//
// לוגואים: לשים את הקובץ ב-public/business/logos/ (עדיף SVG או PNG שקוף),
//   ולהוסיף כאן: { name: 'שם החברה', src: '/business/logos/company.svg' }
// המלצות: { quote: 'מה נאמר', name: 'שם', role: 'מנהלת משאבי אנוש', org: 'שם החברה' }
// תמונות: לשים את הקובץ ב-public/business/gallery/,
//   ולהוסיף כאן: { src: '/business/gallery/photo.jpg', alt: 'תיאור התמונה', caption: 'הרצאה ב...' }

export type ClientLogo = { name: string; src: string };
export type Testimonial = { quote: string; name: string; role: string; org?: string };
export type EventPhoto = { src: string; alt: string; caption?: string };

export const CLIENT_LOGOS: ClientLogo[] = [];

export const TESTIMONIALS: Testimonial[] = [];

export const EVENT_PHOTOS: EventPhoto[] = [];
