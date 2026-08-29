import { app } from './app';

// Cloudflare Workers 入口：Hono app 本身具备 fetch 能力，直接作为默认导出。
export default app;
