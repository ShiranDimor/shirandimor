/** @type {import('next').NextConfig} */
const nextConfig = {
  // Guy's speech-practice game is a standalone static page in public/guy (no site layout, chat or tracking).
  async redirects() {
    return [{ source: '/guy', destination: '/guy/index.html', permanent: false }];
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
