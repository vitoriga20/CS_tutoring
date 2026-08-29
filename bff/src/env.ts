// Cloudflare Workers 绑定 / 环境变量类型定义（与 wrangler.toml / .dev.vars 保持一致）
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GIGS_CACHE_TTL?: string;
  RATE_LIMIT_KV?: KVNamespace;
};

// 统一的 API 响应外壳（契约：specs/openapi.yaml）
export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

// 配置守卫：SUPABASE_URL / SERVICE_ROLE 缺失时尽早抛出可读错误，
// 避免 undefined 深入客户端后变成 "Cannot read properties of undefined (reading 'replace')" 一类谜语。
// 抛出后由 app.onError 统一转 500 INTERNAL 并打印本条消息。
export function assertSupabaseEnv(
  env: Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>,
): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      '[bff] 配置缺失：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未设置（本地：参照 bff/.dev.vars.example 创建 bff/.dev.vars 并重启 wrangler dev；线上：注入 Cloudflare Secrets）',
    );
  }
}
