// PT-GIG-04 属性测试（oracle：specs/spec.md 第 5 部分附 P-GIG-04；生成器：contact_wxid ∈ {null, 非null}）
// 纯函数 resolveContactTarget 在 node 环境直接验证回退规则；组件渲染侧验收见 TC-VIEW-004。
import { describe, expect, it } from 'vitest';
import { resolveContactTarget } from '../src/services/contact';
import type { SiteConfig } from '../src/services/types';

const SITE_CONFIG: SiteConfig = {
  wxid: 'admin-wx-001',
  qr_image_url: 'https://example.com/qr.png',
  notice: '添加时备注科目',
};

describe('PT-GIG-04 联系弹层回退规则', () => {
  it('contact_wxid 为 null → 展示 site_config.wxid 与 site_config.qr_image_url', () => {
    const target = resolveContactTarget({ contact_wxid: null }, SITE_CONFIG);
    expect(target.wxid).toBe('admin-wx-001');
    expect(target.qr_image_url).toBe('https://example.com/qr.png');
  });

  it('contact_wxid 非空 → 展示 gig.contact_wxid，二维码仍取 site_config', () => {
    const target = resolveContactTarget({ contact_wxid: 'gig-wx-777' }, SITE_CONFIG);
    expect(target.wxid).toBe('gig-wx-777');
    expect(target.qr_image_url).toBe('https://example.com/qr.png');
  });

  it('属性遍历：∀ wxid ∈ {null, 非null}，wxid 回退正确且 qr/notice 恒来自 site_config；无单子上下文（null gig）恒用 site_config.wxid', () => {
    for (const wxid of [null, 'gig-wx-a', 'gig-wx-b']) {
      const target = resolveContactTarget({ contact_wxid: wxid }, SITE_CONFIG);
      expect(target.wxid).toBe(wxid ?? SITE_CONFIG.wxid);
      expect(target.qr_image_url).toBe(SITE_CONFIG.qr_image_url);
      expect(target.notice).toBe(SITE_CONFIG.notice);
    }
    const globalTarget = resolveContactTarget(null, SITE_CONFIG);
    expect(globalTarget.wxid).toBe(SITE_CONFIG.wxid);
  });
});
