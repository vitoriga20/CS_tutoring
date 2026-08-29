// 联系目标解析（性质：specs/spec.md 第 5 部分附 P-GIG-04，v0.3.0 三级回退）
// wxid 回退链: gig.contact_wxid → publisher.wxid → site_config.wxid
// qr 回退链（独立）: publisher.qr_image_url → site_config.qr_image_url
// 纯函数，供 PT-GIG-04 在 node 环境直接测。
import type { Gig, PublisherContact, SiteConfig } from './types';

export interface ContactTarget {
  wxid: string;
  qr_image_url: string;
  notice: string | null;
}

export function resolveContactTarget(
  gig: Pick<Gig, 'contact_wxid'> | null,
  publisher: PublisherContact | null,
  siteConfig: SiteConfig,
): ContactTarget {
  return {
    wxid: gig?.contact_wxid ?? publisher?.wxid ?? siteConfig.wxid,
    qr_image_url: publisher?.qr_image_url ?? siteConfig.qr_image_url,
    notice: siteConfig.notice,
  };
}
