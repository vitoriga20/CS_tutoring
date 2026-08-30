/** @vitest-environment happy-dom */
// TC-VIEW-003/004/005/007 组件级验收（Gherkin：spec.md §2.1；依赖：@testing-library/react + happy-dom，
// 2026-08-29 经用户确认新增）。用例 ID 与 specs/spec.md 第 7 部分覆盖矩阵逐字一致。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactElement } from 'react';
import HomePage from '../src/pages/HomePage';
import GigDetailPage from '../src/pages/GigDetailPage';
import ContactModal from '../src/components/contact/ContactModal';
import { ContactProvider } from '../src/components/contact/ContactContext';
import type { GigDetail, Page, PublisherContact, SiteConfig } from '../src/services/types';

vi.mock('../src/services/api', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError, apiGet: vi.fn() };
});
import { apiGet } from '../src/services/api';

const apiGetMock = vi.mocked(apiGet);

const EMPTY_PAGE: Page<GigDetail> = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
const SITE_OK = {
  data: { wxid: 'admin-wx-001', qr_image_url: 'https://example.com/qr.png', notice: null } satisfies SiteConfig,
};

function makeGig(overrides: Partial<GigDetail> = {}): GigDetail {
  return {
    id: '00000000-0000-0000-0000-00000000g001',
    title: '高二数学一对一',
    subject: '数学',
    grade_level: 'senior',
    mode: 'offline',
    region: '西湖区·文一西路',
    district: 'yuelu',
    hourly_rate: 150,
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
    publisher_contact: { wxid: null, qr_image_url: null },
    ...overrides,
  };
}

function pub(wxid: string | null, qr: string | null): PublisherContact {
  return { wxid, qr_image_url: qr };
}

function withProviders(ui: ReactElement, opts: { route?: string; routePath?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routed = opts.routePath ? (
    <Routes>
      <Route path={opts.routePath} element={ui} />
    </Routes>
  ) : (
    ui
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ContactProvider>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>{routed}</MemoryRouter>
      </ContactProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGetMock.mockReset();
});
afterEach(cleanup);

describe('TC-VIEW-003 首页空态', () => {
  it('无 open 单子时显示空态文案，无骨架屏无错误提示', async () => {
    apiGetMock.mockResolvedValue(EMPTY_PAGE);
    withProviders(<HomePage />);
    await waitFor(() => expect(screen.getByText('暂时没有新单子，过几天再来看看')).toBeTruthy());
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByText(/加载失败/)).toBeNull();
  });
});

describe('TC-VIEW-004 详情页联系弹层', () => {
  it('contact_wxid 为空：展示 site_config 二维码与 wxid，复制按钮把 wxid 写入剪贴板', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    withProviders(<ContactModal gig={makeGig({ contact_wxid: null })} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('admin-wx-001')).toBeTruthy());
    expect(screen.getByAltText('小助理微信二维码').getAttribute('src')).toBe('https://example.com/qr.png');

    fireEvent.click(screen.getByRole('button', { name: /复制微信号/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('admin-wx-001'));
  });

  it('contact_wxid 非空：展示单子专属微信（P-GIG-04 组件侧）', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    withProviders(<ContactModal gig={makeGig({ contact_wxid: 'gig-wx-777' })} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('gig-wx-777')).toBeTruthy());
    expect(screen.queryByText('admin-wx-001')).toBeNull();
  });

  it('操作区提供「保存二维码」与「复制微信号」两个按钮（v0.3.3 UI 调整，无矩阵 ID）', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    withProviders(<ContactModal gig={makeGig()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /保存二维码/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /复制微信号/ })).toBeTruthy();
  });
});

describe('TC-VIEW-007 弹层三级回退（v0.3 发布者资料）', () => {
  it('contact_wxid 为空且发布者有资料：展示发布者 wxid 与发布者二维码', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    withProviders(
      <ContactModal
        gig={makeGig({ publisher_contact: pub('pub-wx-001', 'https://example.com/pub-qr.png') })}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('pub-wx-001')).toBeTruthy());
    expect(screen.getByAltText('小助理微信二维码').getAttribute('src')).toBe('https://example.com/pub-qr.png');
    expect(screen.queryByText('admin-wx-001')).toBeNull();
  });

  it('contact_wxid 非空：wxid 用专属微信，二维码仍优先发布者的（qr 独立回退）', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    withProviders(
      <ContactModal
        gig={makeGig({
          contact_wxid: 'gig-wx-777',
          publisher_contact: pub('pub-wx-001', 'https://example.com/pub-qr.png'),
        })}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('gig-wx-777')).toBeTruthy());
    expect(screen.getByAltText('小助理微信二维码').getAttribute('src')).toBe('https://example.com/pub-qr.png');
  });

  it('发布者仅上传二维码（无 wxid）且 contact_wxid 为空：wxid 兜底站点，qr 用发布者的', async () => {
    apiGetMock.mockResolvedValue(SITE_OK);
    withProviders(
      <ContactModal
        gig={makeGig({ publisher_contact: pub(null, 'https://example.com/pub-qr.png') })}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('admin-wx-001')).toBeTruthy());
    expect(screen.getByAltText('小助理微信二维码').getAttribute('src')).toBe('https://example.com/pub-qr.png');
  });
});

describe('TC-VIEW-005 已匹配单子详情', () => {
  it('matched：显示「已匹配」徽标，底部联系按钮禁用', async () => {
    apiGetMock.mockResolvedValue({ data: makeGig({ status: 'matched' }) });
    withProviders(<GigDetailPage />, { route: '/gigs/g001', routePath: '/gigs/:id' });
    await waitFor(() => expect(screen.getByText('已匹配', { exact: true })).toBeTruthy());
    const btn = screen.getByRole('button', { name: /无法再联系/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('closed：显示「已关闭」徽标，底部联系按钮禁用（checklist TC-VIEW-005 补充）', async () => {
    apiGetMock.mockResolvedValue({ data: makeGig({ status: 'closed' }) });
    withProviders(<GigDetailPage />, { route: '/gigs/g001', routePath: '/gigs/:id' });
    await waitFor(() => expect(screen.getByText('已关闭', { exact: true })).toBeTruthy());
    const btn = screen.getByRole('button', { name: /无法再联系/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('TC-VIEW-012 首页筛选持久化（v0.4.1 sessionStorage）', () => {
  it('筛选+页码写入 sessionStorage，卸载重挂后恢复（等价进详情返回）', async () => {
    window.sessionStorage.clear();
    // meta.page 跟随请求页码，才能验证翻页后恢复到第 2 页
    apiGetMock.mockImplementation(async (_url, params) => ({
      data: [makeGig()],
      meta: { page: Number(params?.page ?? 1), pageSize: 20, total: 21 },
    }));

    const first = withProviders(<HomePage />);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    // 选区域「岳麓区」+ 翻到第 2 页
    fireEvent.click(screen.getByRole('button', { name: '岳麓区' }));
    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith('/gigs', expect.objectContaining({ district: 'yuelu' })),
    );
    fireEvent.click(screen.getByRole('button', { name: /下一页/ }));
    await waitFor(() => expect(screen.getByText(/第 2 \/ 2 页/)).toBeTruthy());

    // 卸载（等价路由离开列表页进入详情）
    first.unmount();

    // 重新挂载（等价返回列表页）：筛选与页码应从 sessionStorage 恢复
    withProviders(<HomePage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '岳麓区' }).classList.contains('is-on')).toBe(true));
    await waitFor(() =>
      expect(apiGetMock).toHaveBeenLastCalledWith('/gigs', expect.objectContaining({ district: 'yuelu', page: 2 })),
    );
    expect(screen.getByText(/第 2 \/ 2 页/)).toBeTruthy();
  });
});
