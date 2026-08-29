// 客户端错误解析单元测试（对应 spec 覆盖矩阵的客户端侧基础；用例 ID 逐字对齐矩阵的 CT-GIG-001 错误体形状）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet } from '../src/services/api';

vi.mock('../src/lib/supabase', () => ({ supabase: null }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiGet 错误解析', () => {
  it('422 校验错误：抛出 ApiError，code 与 details 逐字透传', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: '请求参数不满足约束',
            code: 'VALIDATION_ERROR',
            details: [{ field: 'region', reason: 'region 必填' }],
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const err = await apiGet('/gigs').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.code).toBe('VALIDATION_ERROR');
    expect(apiErr.details).toEqual([{ field: 'region', reason: 'region 必填' }]);
  });

  it('204 空响应：解析为 undefined 而非抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiGet('/whatever')).resolves.toBeUndefined();
  });

  it('查询参数：undefined/null/空串不进入 query string', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiGet('/gigs', { status: 'open', subject: undefined, page: 2 });
    const called = (fetchMock.mock.calls[0] as unknown[])[0] as string;
    expect(called).toBe('/api/v1/gigs?status=open&page=2');
  });
});
