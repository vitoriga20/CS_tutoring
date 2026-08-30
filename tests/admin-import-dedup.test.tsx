/** @vitest-environment happy-dom */
// SPEC-003 疑似重复确认前端交互（specs/import-dedup/spec.md §5.2/§5.3；覆盖矩阵 TC-DEDUP-005/006/007/008/013、PT-DEDUP-03）。
// v0.2.1 三裁决：完全重复（confirmed）/ 不重复（dismissed，插入 rows）/ 更新单子（reimport，更新旧单 updates）。
// 状态机 oracle：§5.2（pending → confirmed 取消勾选+置灰 / dismissed·reimport 自动勾选；三态间改判双向流转）；
// 弹窗队列：§5.3（按 index 升序自动弹首个 pending，裁决完弹下一个；pending 强制三选一无关闭路径；存在 pending → 导入禁用）；
// 提交分流：§3.4（dismissed → rows；reimport → updates [{id=suspect.gig.id, values}]）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';

import AdminImportPage from '../src/pages/admin/AdminImportPage';
import type { Gig, GigImportDraft, GigImportRow, ImportSuspect } from '../src/services/types';

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
  return { ApiError, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});
import { apiPost } from '../src/services/api';

const apiPostMock = vi.mocked(apiPost);

function makeGig(over: Partial<Gig> = {}): Gig {
  return {
    id: '00000000-0000-0000-0000-00000000g001',
    title: '长沙家教网10034639号家教',
    subject: '数学',
    grade_level: 'junior',
    mode: 'offline',
    region: '北部湾',
    district: 'wangcheng',
    hourly_rate: 70,
    student_gender: 'female',
    student_info: '初二、女 基础巩固',
    rate: '70元/小时',
    schedule: null,
    requirements: '有耐心',
    contact_wxid: null,
    status: 'open',
    published_by: '00000000-0000-0000-0000-00000000a001',
    created_at: '2026-08-29T08:00:00.000Z',
    updated_at: '2026-08-29T08:00:00.000Z',
    ...over,
  };
}

function makeDraft(over: Partial<GigImportDraft> = {}): GigImportDraft {
  return {
    title: '长沙家教网10034639号家教',
    subject: '数学',
    grade_level: 'junior',
    mode: 'offline',
    region: '北部湾',
    district: 'wangcheng',
    hourly_rate: 70,
    student_gender: 'female',
    student_info: '初二、女 基础巩固',
    rate: '70元/小时',
    schedule: null,
    requirements: '有耐心',
    contact_wxid: null,
    ...over,
  };
}

function makeSuspect(over: Partial<ImportSuspect> = {}): ImportSuspect {
  return {
    gig: makeGig(),
    score: 5,
    hard: false,
    matched: ['grade_level', 'subject', 'district', 'hourly_rate', 'student_gender'],
    ...over,
  };
}

function makeRow(over: Partial<GigImportRow> = {}): GigImportRow {
  return {
    index: 0,
    draft: makeDraft(),
    issues: [],
    duplicate: false,
    status: 'ok',
    suspect: null,
    ...over,
  };
}

function withProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// 粘贴文本 → 点解析 → 等首弹窗
async function parsePreview(rows: GigImportRow[]) {
  apiPostMock.mockResolvedValue({ data: { rows } });
  withProviders(<AdminImportPage />);
  fireEvent.change(screen.getByPlaceholderText(/粘贴家教网/), { target: { value: '原文文本' } });
  fireEvent.click(screen.getByRole('button', { name: '解析' }));
  await screen.findByRole('dialog', { name: '疑似重复对比' });
}

const checkboxOf = (n: number) => screen.getByLabelText(`第 ${n} 行`) as HTMLInputElement;
const importBtn = () => screen.getByRole('button', { name: /导入选中/ }) as HTMLButtonElement;
const DECIDE_BTN = { dismissed: '不重复', reimport: '更新单子', confirmed: '完全重复' } as const;

// 点当前弹窗的裁决按钮；expectNext 非空 → 等下一个弹窗标题，null → 等弹窗关闭
async function decideCurrent(choice: 'dismissed' | 'reimport' | 'confirmed', expectNext?: string | null) {
  fireEvent.click(screen.getByRole('button', { name: DECIDE_BTN[choice] }));
  if (expectNext) {
    await screen.findByText(expectNext);
  } else {
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }
}

beforeEach(() => {
  apiPostMock.mockReset();
});
afterEach(cleanup);

describe('TC-DEDUP-005 自动弹窗队列 + 三裁决（§5.3，v0.2.0）', () => {
  it('解析后按 index 升序自动弹首个 pending；裁决完自动弹下一个；全部裁决完「导入选中」恢复可用', async () => {
    const rows = [
      makeRow({ index: 0, draft: makeDraft({ title: 'A' }) }),
      makeRow({ index: 1, suspect: makeSuspect(), draft: makeDraft({ title: 'B' }) }),
      makeRow({ index: 2, suspect: makeSuspect({ hard: true, matched: ['subject'] }), draft: makeDraft({ title: 'C' }) }),
    ];
    await parsePreview(rows);

    // 首个弹窗 = index 1（第 2 行）；疑似行默认不勾选且不可勾；非疑似 ok 行默认勾选
    expect(screen.getByText('疑似重复 · 第 2 行')).toBeTruthy();
    expect(checkboxOf(2).checked).toBe(false);
    expect(checkboxOf(2).disabled).toBe(true);
    expect(checkboxOf(3).checked).toBe(false);
    expect(checkboxOf(3).disabled).toBe(true);
    expect(checkboxOf(1).checked).toBe(true);
    expect(checkboxOf(1).disabled).toBe(false);
    expect(importBtn().disabled).toBe(true); // 存在 pending → 导入禁用

    // 第 2 行「完全重复」→ 置灰不可勾；自动弹出第 3 行
    await decideCurrent('confirmed', '疑似重复 · 第 3 行');
    expect(checkboxOf(2).checked).toBe(false);
    expect(checkboxOf(2).disabled).toBe(true);
    expect(screen.getByText('已确认重复')).toBeTruthy();

    // 第 3 行「更新单子」→ 自动勾选 + 标记「重复-更新旧单」；队列空 → 弹窗关闭、导入恢复可用
    await decideCurrent('reimport');
    expect(checkboxOf(3).checked).toBe(true);
    expect(checkboxOf(3).disabled).toBe(false);
    expect(screen.getByText('重复-更新旧单')).toBeTruthy();
    expect(importBtn().disabled).toBe(false);
    expect(importBtn().textContent).toContain('导入选中（2）'); // R0 插入 + R2 更新
  });

  it('pending 弹窗强制三选一：三个裁决按钮、无关闭按钮、遮罩点击不关闭', async () => {
    await parsePreview([makeRow({ index: 0, suspect: makeSuspect() })]);
    expect(screen.getByRole('button', { name: '完全重复' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '不重复' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '更新单子' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(screen.getByRole('dialog', { name: '疑似重复对比' })).toBeTruthy();
  });
});

describe('TC-DEDUP-006 未裁决完阻断导入（§5.3）', () => {
  it('存在 pending → 「导入选中」禁用；全部裁决后恢复可用', async () => {
    const rows = [
      makeRow({ index: 0, draft: makeDraft({ title: 'A' }) }), // ok 非疑似，默认勾
      makeRow({ index: 1, suspect: makeSuspect(), draft: makeDraft({ title: 'B' }) }),
    ];
    await parsePreview(rows);
    expect(importBtn().disabled).toBe(true); // pending 阻断（即使已有 1 条勾选）

    await decideCurrent('confirmed');
    expect(importBtn().disabled).toBe(false);
    expect(importBtn().textContent).toContain('导入选中（1）'); // 仅 R0
  });
});

describe('TC-DEDUP-007 改判（§5.2 状态机三态双向流转）', () => {
  it('dismissed → 重开改 confirmed：取消勾选+置灰；confirmed → 重开改 reimport：恢复勾选+换更新通道', async () => {
    await parsePreview([makeRow({ index: 0, suspect: makeSuspect() })]);
    // dismissed：自动勾选 + 可编辑
    await decideCurrent('dismissed');
    expect(checkboxOf(1).checked).toBe(true);
    expect(checkboxOf(1).disabled).toBe(false);
    expect(importBtn().disabled).toBe(false);

    // 重开（已裁决行有「关闭」入口）→ 改判 confirmed → 取消勾选+置灰
    fireEvent.click(screen.getByRole('button', { name: '查看对比' }));
    await screen.findByRole('dialog', { name: '疑似重复对比' });
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
    await decideCurrent('confirmed');
    expect(checkboxOf(1).checked).toBe(false);
    expect(checkboxOf(1).disabled).toBe(true);
    expect(importBtn().disabled).toBe(true); // 全部 confirmed → 无勾选行

    // 再重开 → 改判 reimport → 恢复勾选 + 「重复-更新旧单」标记
    fireEvent.click(screen.getByRole('button', { name: '查看对比' }));
    await screen.findByRole('dialog', { name: '疑似重复对比' });
    await decideCurrent('reimport');
    expect(checkboxOf(1).checked).toBe(true);
    expect(screen.getByText('重复-更新旧单')).toBeTruthy();
    expect(importBtn().disabled).toBe(false);
  });

  it('error 行裁决与红标两维度独立：不重复不自动勾选、字段仍可编辑修正', async () => {
    await parsePreview([
      makeRow({ index: 0, suspect: makeSuspect(), status: 'error', issues: [{ field: 'subject', reason: '未识别科目' }] }),
    ]);
    await decideCurrent('dismissed');
    // error 行：不自动勾选（修正后人工勾），但复选框/输入恢复可编辑，待修正标仍在
    expect(checkboxOf(1).checked).toBe(false);
    expect(checkboxOf(1).disabled).toBe(false);
    expect(screen.getByText('待修正')).toBeTruthy();
    expect(importBtn().disabled).toBe(true); // 无勾选行
  });
});

describe('TC-DEDUP-008 裁决不持久化（§5.2）', () => {
  it('同文本再次解析 → 该行重新被标记疑似、重新进入 pending 弹窗队列', async () => {
    await parsePreview([makeRow({ index: 0, suspect: makeSuspect() })]);
    await decideCurrent('confirmed');
    expect(checkboxOf(1).checked).toBe(false);

    // 再次解析同一文本（textarea 内容未清空）：需重新裁决
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await screen.findByRole('dialog', { name: '疑似重复对比' });
    expect(screen.getByText('疑似重复 · 第 1 行')).toBeTruthy();
    expect(checkboxOf(1).checked).toBe(false);
    expect(checkboxOf(1).disabled).toBe(true);
    expect(importBtn().disabled).toBe(true);
  });
});

describe('TC-DEDUP-013 更新单子提交分流（§3.4，v0.2.0）', () => {
  it('reimport 行提交 payload：不入 rows、进 updates [{id=suspect.gig.id, values}]；结果提示已更新', async () => {
    const suspect = makeSuspect({ gig: makeGig({ id: 'old-gig-1' }) });
    await parsePreview([makeRow({ index: 0, suspect, draft: makeDraft({ title: '新内容' }) })]);

    await decideCurrent('reimport');
    expect(screen.getByText('重复-更新旧单')).toBeTruthy();
    expect(checkboxOf(1).checked).toBe(true);

    // 提交：mock commit 响应
    apiPostMock.mockResolvedValue({
      data: { created: [], updated: [makeGig({ id: 'old-gig-1', title: '新内容' })], failed: [] },
    });
    fireEvent.click(importBtn());
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/gigs/import', expect.anything()));

    const commitCall = apiPostMock.mock.calls.find((c) => c[0] === '/gigs/import');
    const body = commitCall?.[1] as { rows: GigImportDraft[]; updates: { id: string; values: GigImportDraft }[] };
    expect(body.rows).toHaveLength(0); // 不入插入集合
    expect(body.updates).toHaveLength(1);
    expect(body.updates[0].id).toBe('old-gig-1');
    expect(body.updates[0].values.title).toBe('新内容');

    // 结果提示含「已更新」
    expect(await screen.findByText(/已更新 1 条/)).toBeTruthy();
  });
});

describe('PT-DEDUP-03 状态机属性（P-DEDUP-03，§5.2 oracle，v0.2.0 三态）', () => {
  const SEQUENCES = [
    ['dismissed', 'confirmed', 'reimport'],
    ['confirmed', 'reimport', 'dismissed'],
    ['reimport', 'dismissed', 'confirmed'],
  ] as const;

  it.each(SEQUENCES.map((s) => [s.join('→'), s] as const))(
    '裁决序列 %s：弹窗存在 ⇔ 仍有 pending；导入禁用 ⇔ 弹窗存在；最终勾选 ⇔ 裁决 ∈ {dismissed, reimport}',
    async (_label, seq) => {
      const rows = [0, 1, 2].map((i) => makeRow({ index: i, suspect: makeSuspect(), draft: makeDraft({ title: `R${i}` }) }));
      await parsePreview(rows);

      for (let step = 0; step < seq.length; step++) {
        // 队列按 index 升序：第 step 步弹窗应为第 step+1 行
        expect(screen.getByText(`疑似重复 · 第 ${step + 1} 行`)).toBeTruthy();
        expect(importBtn().disabled).toBe(true); // 存在 pending ⇔ 导入禁用
        fireEvent.click(screen.getByRole('button', { name: DECIDE_BTN[seq[step]] }));
        if (step < seq.length - 1) {
          expect(await screen.findByText(`疑似重复 · 第 ${step + 2} 行`)).toBeTruthy();
        } else {
          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        }
      }

      // 最终：弹窗关闭、导入可用；勾选态 ⇔ 最终裁决 ∈ {dismissed, reimport}；置灰 ⇔ confirmed（ok 行）
      expect(importBtn().disabled).toBe(false);
      for (let i = 0; i < seq.length; i++) {
        const c = checkboxOf(i + 1);
        expect(c.checked).toBe(seq[i] === 'dismissed' || seq[i] === 'reimport');
        expect(c.disabled).toBe(seq[i] === 'confirmed');
      }
    },
  );
});
