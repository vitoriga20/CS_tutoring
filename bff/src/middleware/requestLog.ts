// 请求日志中间件（specs/spec.md §6 日志规范落地）：每个 /api/v1 请求打一行摘要（方法 路径 状态 耗时）；
// 5xx 完整错误对象由 app.onError 的 console.error 负责。另在首个请求时检测核心配置是否缺失，
// 让「.dev.vars 未创建 / Secrets 未注入」类问题在日志里直接可见。
import type { Context, Next } from 'hono';
import type { Bindings } from '../env';

let envWarned = false;

export function requestLog() {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    if (!envWarned && (!c.env?.SUPABASE_URL || !c.env?.SUPABASE_SERVICE_ROLE_KEY)) {
      envWarned = true;
      console.error(
        '[bff] 配置缺失：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未设置（本地请创建 bff/.dev.vars 并重启 wrangler dev；线上注入 Cloudflare Secrets）',
      );
    }
    const start = Date.now();
    await next();
    console.log(`[bff] ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
  };
}
