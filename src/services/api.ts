// BFF API 客户端（契约：specs/openapi.yaml；Bearer 注入规则：specs/spec.md §3 要点末条）
// 响应外壳 {data} / {data, meta}；错误体 {error, code, detail?}，422 另含 details[]
import { supabase } from '../lib/supabase';
import type { FieldIssue, Page } from './types';

export type { FieldIssue, Page };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: FieldIssue[];

  constructor(status: number, code: string, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const REQUEST_TIMEOUT_MS = 15000;

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(init.headers as Record<string, string> | undefined),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      if (import.meta.env.DEV) {
        console.debug(`[api] ${init.method ?? 'GET'} /api/v1${path} 超时（${REQUEST_TIMEOUT_MS}ms）`);
      }
      throw new ApiError(0, 'TIMEOUT', `API ${path} 请求超时（${REQUEST_TIMEOUT_MS}ms）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      details?: FieldIssue[];
    };
    if (import.meta.env.DEV) {
      console.debug(
        `[api] ${init.method ?? 'GET'} /api/v1${path} → ${res.status} ${body.code ?? '（响应体非 JSON，无错误码）'}`,
        body.error ?? '',
      );
      if (res.status === 500 && !body.code) {
        console.debug(
          '[api] 提示：500 且响应体非 JSON，本地开发通常是 BFF 未启动（先创建 bff/.dev.vars，再 cd bff && npm run dev）',
        );
      }
    }
    throw new ApiError(
      res.status,
      body.code ?? 'UNKNOWN',
      body.error ??
        (res.status === 500 && !body.code
          ? `API ${path} 失败（500）：BFF 不可达（本地请启动 cd bff && npm run dev）`
          : `API ${path} 失败（${res.status}）`),
      body.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return request<T>(`${path}${query ? `?${query}` : ''}`);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}
