// 校验器单元测试（spec 覆盖矩阵：PT-GIG-01、TC-ADMIN-002、TC-ADMIN-003）
import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  assertTransition,
  validateGigInput,
  validateSiteConfigPatch,
} from '../src/lib/validators';
import type { GigStatus } from '../src/types';

const VALID_INPUT = {
  title: '高二数学一对一',
  subject: '数学',
  grade_level: 'senior',
  mode: 'online',
  region: '岳麓区·梅溪湖壹号',
  district: 'yuelu',
  student_gender: 'female',
  student_info: '女生，数学 85/150，基础较弱',
  requirements: '每周两次线上辅导',
};

function issueFields(result: { ok: boolean; details?: { field: string }[] }): string[] {
  return (result.details ?? []).map((d) => d.field);
}

// PT-GIG-01：状态机闭包 —— ∀ from,to ∈ GigStatus 的全组合（3×3）
describe('PT-GIG-01 assertTransition 全组合', () => {
  const statuses: GigStatus[] = ['open', 'matched', 'closed'];
  const allowed = new Set(['open>matched', 'open>closed', 'matched>open', 'matched>closed', 'closed>open']);

  for (const from of statuses) {
    for (const to of statuses) {
      it(`${from} → ${to}`, () => {
        if (from === to || allowed.has(`${from}>${to}`)) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          try {
            assertTransition(from, to);
            throw new Error('应当抛出 HTTPException');
          } catch (e) {
            expect(e).toBeInstanceOf(HTTPException);
            const httpErr = e as HTTPException;
            expect(httpErr.status).toBe(422);
          }
        }
      });
    }
  }
});

describe('validateGigInput（TC-ADMIN-002 / TC-ADMIN-003）', () => {
  it('合法输入：student_gender 缺省为 unknown，可空字段为 null，未知字段忽略', () => {
    const r = validateGigInput({ ...VALID_INPUT, student_gender: undefined, metadata: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.student_gender).toBe('unknown');
      expect(r.value.rate).toBeNull();
      expect(r.value.schedule).toBeNull();
      expect(r.value.contact_wxid).toBeNull();
      expect((r.value as unknown as Record<string, unknown>).metadata).toBeUndefined();
    }
  });

  it('缺 region 被拒绝（mode=online 也拒，REQ-ADMIN-02）', () => {
    const r = validateGigInput({ ...VALID_INPUT, region: undefined });
    expect(r.ok).toBe(false);
    expect(issueFields(r)).toContain('region');
  });

  it('非法字段逐项命中（REQ-ADMIN-03）', () => {
    const cases: [string, unknown][] = [
      ['title', '   '],
      ['title', 'x'.repeat(61)],
      ['requirements', 'x'.repeat(2001)],
      ['grade_level', 'chuzhong'],
      ['mode', '线'],
      ['region', '   '],
      ['district', 'liuyang'],
      ['district', '   '],
      ['hourly_rate', -1],
      ['hourly_rate', 10001],
      ['hourly_rate', 80.5],
      ['hourly_rate', '80'],
      ['student_info', ''],
      ['student_gender', '女'],
    ];
    for (const [field, value] of cases) {
      const r = validateGigInput({ ...VALID_INPUT, [field]: value });
      expect(r.ok, `${field}=${JSON.stringify(value)} 应拒绝`).toBe(false);
      expect(issueFields(r), `${field} 应出现在 details`).toContain(field);
    }
  });

  it('v0.4.0：district 必填（缺省拒绝）；hourly_rate 缺省为 null，边界 0/10000 通过', () => {
    const missing = validateGigInput({ ...VALID_INPUT, district: undefined });
    expect(missing.ok).toBe(false);
    expect(issueFields(missing)).toContain('district');

    const r = validateGigInput({ ...VALID_INPUT, hourly_rate: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.hourly_rate).toBeNull();

    for (const edge of [0, 10000]) {
      const ok = validateGigInput({ ...VALID_INPUT, hourly_rate: edge });
      expect(ok.ok, `hourly_rate=${edge} 应通过`).toBe(true);
    }
    const explicitNull = validateGigInput({ ...VALID_INPUT, hourly_rate: null });
    expect(explicitNull.ok).toBe(true);
    if (explicitNull.ok) expect(explicitNull.value.hourly_rate).toBeNull();
  });

  it('非对象 body 拒绝', () => {
    expect(validateGigInput(null).ok).toBe(false);
    expect(validateGigInput('x').ok).toBe(false);
    expect(validateGigInput([1]).ok).toBe(false);
  });
});

describe('validateSiteConfigPatch', () => {
  it('notice 空字符串规范化为 null', () => {
    const r = validateSiteConfigPatch({ notice: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notice).toBeNull();
  });

  it('qr_image_url 非 https 拒绝；wxid 合法通过', () => {
    const bad = validateSiteConfigPatch({ qr_image_url: 'http://x/qr.png' });
    expect(bad.ok).toBe(false);
    const good = validateSiteConfigPatch({ wxid: ' admin-wx ', notice: null });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.wxid).toBe('admin-wx');
  });
});
