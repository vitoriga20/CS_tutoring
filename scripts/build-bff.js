import esbuild from 'esbuild';

// from: CourseCore scripts/build-bff.js（逐字移植）
// 把 Cloudflare Pages Functions 入口（含 hono/cloudflare-pages 适配器 + 全部 BFF 路由）
// 打包成单个自包含 ESM 文件。wrangler pages 直接加载该 .js，不再需要跨目录解析 TS。
await esbuild.build({
  entryPoints: ['bff/src/pages-entry.ts'],
  bundle: true,
  outfile: 'functions/api/[[route]].js',
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

console.log('BFF Pages Functions bundle built: functions/api/[[route]].js');
