/** @type {import('next').NextConfig} */
const nextConfig = {
  // בלי זה, דפדפנים (ו/או Vercel) יכולים לשמור את sw.js בקאש ולא לבדוק גרסה חדשה שלו
  // בפתיחה הבאה של האתר - כך שגם סגירה ופתיחה מלאה של הדפדפן לא מכניסה לתוקף Service Worker
  // שעודכן (למשל תיקון בלחיצה על התראת פוש) עד שעובר הרבה זמן. חובה no-cache דווקא על הקובץ
  // הזה - שאר קבצי public יכולים להישאר בקאש ארוך כרגיל
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  // Guy's speech-practice game is a standalone static page in public/guy (no site layout, chat or tracking).
  async redirects() {
    // Case-insensitive: Android keyboards often type "Guy".
    return [
      { source: '/:slug([gG][uU][yY])', destination: '/guy/index.html', permanent: false },
      // Dor's Pokémon English game - short, case-insensitive address that's easy to type on a tablet.
      { source: '/:slug([dD][oO][rR])', destination: '/dor-english', permanent: false },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/weekly-summary/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/weekly-summary': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/generate-trade/route': ['./node_modules/@sparticuz/chromium/bin/**/*', './public/marketing/**/*'],
      '/api/admin/marketing/generate-trade': ['./node_modules/@sparticuz/chromium/bin/**/*', './public/marketing/**/*'],
      '/api/admin/marketing/generate-whatsapp/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/generate-whatsapp': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/posts/[id]/generate-story/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/posts/[id]/generate-story': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/posts/[id]/generate-image/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/posts/[id]/generate-image': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/create-story-post/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/create-story-post': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/create-story-from-url/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/admin/marketing/create-story-from-url': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    },
  },
};

export default nextConfig;
