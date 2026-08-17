/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/weekly-summary/route': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '/api/weekly-summary': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    },
  },
};

export default nextConfig;
