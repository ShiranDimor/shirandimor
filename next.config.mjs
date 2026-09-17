/** @type {import('next').NextConfig} */
const nextConfig = {
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
    },
  },
};

export default nextConfig;
