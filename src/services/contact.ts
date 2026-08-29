// 联系目标解析（性质：specs/spec.md 第 5 部分附 P-GIG-04）
// gig.contact_wxid 为 null → 用 site_config.wxid；非 null → 用单子专属微信；
// 二维码恒取 site_config.qr_image_url。纯函数，供 PT-GIG-04 在 node 环境直接测。
import type { Gig, SiteConfig } from './types';

export interface ContactTarget {
  wxid: string;
  qr_image_url: string;
  notice: string | null;
}

export function resolveContactTarget(gig: Pick<Gig, 'contact_wxid'> | null, siteConfig: SiteConfig): ContactTarget {
  return {
    wxid: gig?.contact_wxid ?? siteConfig.wxid,
    qr_image_url: siteConfig.qr_image_url,
    notice: siteConfig.notice,
  };
}
