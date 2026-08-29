/** @vitest-environment happy-dom */
// M4 管理端组件验收（tasks.md T-M4-2/T-M4-3）。状态机 oracle：specs/spec.md §5.1 + P-GIG-01；
// 删除二次确认：Gherkin §2.2「删除单子」的 UI 门；422 details 字段映射：§3 错误契约。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';

import { allowedTargets, TRANSITION_LABEL } from '../src/services/transitions';
import GigRowActions from '../src/components/admin/GigRowActions';
import GigForm from '../src/components/admin/GigForm';
import AdminPage from '../src/pages/admin/AdminPage';
import type { Gig, GigStatus, Page } from '../src/services/types';

vi.mock('../src/services/api', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: { field: string; reason: string }[],
    ) {
      super(message);
    }
  }
  return { ApiError, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});
import { apiDelete } from '../src/services/api';

const apiDeleteMock = vi.mocked(apiDelete);

const ALL_STATUSES: GigStatus[] = ['open', 'matched', 'closed'];
// spec §5.1 状态机 Allowed 表（与 bff/src/lib/validators.ts 同源）
const ALLOWED: Record<GigStatus, GigStatus[]> = {
  open: ['matched', 'closed'],
  matched: ['open', 'closed'],
  closed: ['open'],
};

function makeGig(overrides: Partial<Gig> = {}): Gig {
  return {
    id: '00000000-0000-0000-0000-00000000g001',
    title: '高二数学一对一',
    subject: '数学',
    grade_level: 'senior',
    mode: 'offline',
    region: '杭州市·西湖区',
    student_gender: 'female',
    student_info: '女生，数学 85/150，基础较弱。',
    rate: '150/小时',
    schedule: '周六全天',
    requirements: '每周两次线下辅导。',
    contact_wxid: null,
    status: 'open',
    published_by: '00000000-0000-0000-0000-00000000a001',
    created_at: '2026-08-29T08:00:00Z',
    updated_at: '2026-08-29T08:00:00Z',
    ...overrides,
  };
}

function withProviders(ui: ReactElement, route = '/admin') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiDeleteMock.mockReset();
});
afterEach(cleanup);

describe('transitions（状态机前端映射，P-GIG-01 UI 侧）', () => {
  it('3×3 全组合：Allowed 表内含目标、自身与非法迁移不含', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const targets = allowedTargets(from);
        if (to === from) {
          // 同值重申不经 UI 按钮发起（服务端直接放行），不渲染自身按钮
          expect(targets).not.toContain(to);
        } else if (ALLOWED[from].includes(to)) {
          expect(targets).toContain(to);
        } else {
          expect(targets).not.toContain(to);
        }
      }
    }
  });

  it('每个合法目标都有短动作文案', () => {
    for (const from of ALL_STATUSES) {
      for (const to of allowedTargets(from)) {
        expect(TRANSITION_LABEL[to]).toBeTruthy();
      }
    }
  });
});

describe('GigRowActions（按状态机只渲染合法目标状态）', () => {
  const labelOf = (to: GigStatus) => `标记为${{ open: '招募中', matched: '已匹配', closed: '已关闭' }[to]}`;

  it.each([
    ['open', ['matched', 'closed']],
    ['matched', ['open', 'closed']],
    ['closed', ['open']],
  ] as const)('%s 单子渲染 %j 按钮，且不渲染其余状态按钮', (status, targets) => {
    const targetList = targets as readonly GigStatus[];
    const gig = makeGig({ status });
    const onTransition = vi.fn();
    const onRequestDelete = vi.fn();
    render(
      <MemoryRouter>
        <GigRowActions gig={gig} onTransition={onTransition} onRequestDelete={onRequestDelete} />
      </MemoryRouter>,
    );
    for (const to of ALL_STATUSES) {
      const btn = screen.queryByRole('button', { name: labelOf(to) });
      if (targetList.includes(to)) expect(btn).toBeTruthy();
      else expect(btn).toBeNull();
    }
    // 编辑与删除恒在
    expect(screen.getByRole('link', { name: '编辑单子' }).getAttribute('href')).toBe(`/admin/gigs/${gig.id}/edit`);
    expect(screen.getByRole('button', { name: '删除单子' })).toBeTruthy();
  });

  it('点击状态按钮回调 (id, 目标状态)；点击删除回调整单', () => {
    const onTransition = vi.fn();
    const onRequestDelete = vi.fn();
    const gig = makeGig({ status: 'open' });
    render(
      <MemoryRouter>
        <GigRowActions gig={gig} onTransition={onTransition} onRequestDelete={onRequestDelete} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: labelOf('matched') }));
    expect(onTransition).toHaveBeenCalledWith(gig.id, 'matched');
    fireEvent.click(screen.getByRole('button', { name: '删除单子' }));
    expect(onRequestDelete).toHaveBeenCalledWith(gig);
  });
});

describe('AdminPage 删除二次确认（T-M4-2）', () => {
  const PAGE_OK: Page<Gig> = { data: [makeGig()], meta: { page: 1, pageSize: 20, total: 1 } };

  it('删除先弹确认模态：取消不调 DELETE，确认才调', async () => {
    const { apiGet } = await import('../src/services/api');
    vi.mocked(apiGet).mockResolvedValue(PAGE_OK);
    apiDeleteMock.mockResolvedValue(undefined);
    withProviders(<AdminPage />);

    expect(await screen.findByText('高二数学一对一')).toBeTruthy();

    // 第一次：取消
    fireEvent.click(screen.getByRole('button', { name: '删除单子' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/不可恢复/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(apiDeleteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // 第二次：确认
    fireEvent.click(screen.getByRole('button', { name: '删除单子' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(apiDeleteMock).toHaveBeenCalledWith(`/gigs/${makeGig().id}`),
    );
  });
});

describe('GigForm（T-M4-3：客户端校验 + 422 details 字段映射 + 载荷归一）', () => {
  function renderForm(onSubmit = vi.fn()) {
    withProviders(<GigForm submitLabel="发布" onSubmit={onSubmit} onCancel={vi.fn()} />);
    return onSubmit;
  }
  const fill = (label: RegExp, value: string) => {
    const el = screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(el, { target: { value } });
  };

  it('空表单提交被客户端校验拦截，onSubmit 不触发', async () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    expect(await screen.findByText('标题：长度须在 1..60')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('合法提交：载荷 trim、可空字段空串归一为 null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);
    fill(/^标题/, '  高二数学一对一  ');
    fill(/^科目/, '数学');
    fill(/^区域/, '杭州市');
    fill(/^学员情况/, '基础较弱');
    fill(/^对老师的要求/, '每周两次');
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '高二数学一对一',
          region: '杭州市',
          rate: null,
          schedule: null,
          contact_wxid: null,
        }),
      ),
    );
  });

  it('服务端 422 details 映射到对应字段错误行', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new (await import('../src/services/api')).ApiError(422, 'VALIDATION_ERROR', '请求参数不满足约束', [
        { field: 'region', reason: '长度须在 1..40' },
      ]),
    );
    renderForm(onSubmit);
    fill(/^标题/, '高二数学一对一');
    fill(/^科目/, '数学');
    fill(/^区域/, '杭州市');
    fill(/^学员情况/, '基础较弱');
    fill(/^对老师的要求/, '每周两次');
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    expect(await screen.findByText('区域：长度须在 1..40')).toBeTruthy();
  });
});
