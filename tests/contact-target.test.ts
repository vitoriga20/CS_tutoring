// PT-GIG-04 属性测试（oracle：specs/spec.md 第 5 部分附 P-GIG-04，v0.3.0 三级回退）
// 生成器：contact_wxid × publisher.{wxid,qr_image_url} ∈ {null, 非null} 组合遍历。
// 纯函数 resolveContactTarget 在 node 环境直接验证回退规则；组件渲染侧验收见 TC-VIEW-004/007。
import { describe, expect, it } from 'vitest';
import { resolveContactTarget } from '../src/services/contact';
import type { PublisherContact, SiteConfig } from '../src/services/types';

const SITE_CONFIG: SiteConfig = {
  wxid: 'admin-wx-001',
  qr_image_url: 'https://example.com/qr.png',
  notice: '添加时备注科目',
};

const PUB_FULL: PublisherContact = { wxid: 'pub-wx-001', qr_image_url: 'https://example.com/pub-qr.png' };
const PUB_WX_ONLY: PublisherContact = { wxid: 'pub-wx-001', qr_image_url: null };
const PUB_QR_ONLY: PublisherContact = { wxid: null, qr_image_url: 'https://example.com/pub-qr.png' };
const PUB_EMPTY: PublisherContact = { wxid: null, qr_image_url: null };

describe('PT-GIG-04 联系弹层回退规则（v0.3 wxid 三级 + qr 两级）', () => {
  it('contact_wxid 非空 → wxid 用单子专属微信；qr 用发布者的（无则 site_config）', () => {
    const t1 = resolveContactTarget({ contact_wxid: 'gig-wx-777' }, PUB_FULL, SITE_CONFIG);
    expect(t1.wxid).toBe('gig-wx-777');
    expect(t1.qr_image_url).toBe('https://example.com/pub-qr.png');

    const t2 = resolveContactTarget({ contact_wxid: 'gig-wx-777' }, PUB_WX_ONLY, SITE_CONFIG);
    expect(t2.wxid).toBe('gig-wx-777');
    expect(t2.qr_image_url).toBe(SITE_CONFIG.qr_image_url);
  });

  it('contact_wxid 为 null 且发布者有 wxid → 展示发布者 wxid 与发布者二维码', () => {
    const target = resolveContactTarget({ contact_wxid: null }, PUB_FULL, SITE_CONFIG);
    expect(target.wxid).toBe('pub-wx-001');
    expect(target.qr_image_url).toBe('https://example.com/pub-qr.png');
  });

  it('发布者只有二维码没有 wxid（contact_wxid 也为空）→ wxid 兜底 site_config，qr 用发布者的', () => {
    const target = resolveContactTarget({ contact_wxid: null }, PUB_QR_ONLY, SITE_CONFIG);
    expect(target.wxid).toBe(SITE_CONFIG.wxid);
    expect(target.qr_image_url).toBe('https://example.com/pub-qr.png');
  });

  it('contact_wxid 与发布者资料全空 → site_config 兜底（v0.2 行为）', () => {
    const target = resolveContactTarget({ contact_wxid: null }, PUB_EMPTY, SITE_CONFIG);
    expect(target.wxid).toBe('admin-wx-001');
    expect(target.qr_image_url).toBe('https://example.com/qr.png');
  });

  it('无单子上下文（null gig / null publisher，全局弹层）→ 恒用 site_config', () => {
    const target = resolveContactTarget(null, null, SITE_CONFIG);
    expect(target.wxid).toBe(SITE_CONFIG.wxid);
    expect(target.qr_image_url).toBe(SITE_CONFIG.qr_image_url);
    expect(target.notice).toBe(SITE_CONFIG.notice);
  });

  it('属性遍历：∀ contact_wxid ∈ {null, 非null} × publisher ∈ {null, 全有/仅wxid/仅qr/全空}，回退链逐项成立', () => {
    const publishers: ReadonlyArray<PublisherContact | null> = [
      null,
      PUB_FULL,
      PUB_WX_ONLY,
      PUB_QR_ONLY,
      PUB_EMPTY,
    ];
    for (const contactWxid of [null, 'gig-wx-a']) {
      for (const pub of publishers) {
        const t = resolveContactTarget({ contact_wxid: contactWxid }, pub, SITE_CONFIG);
        expect(t.wxid).toBe(contactWxid ?? pub?.wxid ?? SITE_CONFIG.wxid);
        expect(t.qr_image_url).toBe(pub?.qr_image_url ?? SITE_CONFIG.qr_image_url);
        expect(t.notice).toBe(SITE_CONFIG.notice);
      }
    }
  });
});
