import { handle } from 'hono/cloudflare-pages';
import { app } from './app';

// Cloudflare Pages Functions 入口：用 hono/cloudflare-pages 适配器包裹共享 app。
// 打包脚本 build-bff.js 以此作为入口，输出到 functions/api/[[route]].js 供部署。
export const onRequest = handle(app);
