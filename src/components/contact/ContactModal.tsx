// 联系管理员弹层（T-M3-4，契约：spec.md Gherkin「详情页联系弹层」+ P-GIG-04 v0.3 三级回退）
// 弹壳样式为移植的 grad .modal（浅色面板 + 黄顶横 + 硬投影）；二维码为普通 <img>，
// 保证微信内置浏览器长按可识别（checklist §4）。
// v0.3.3：操作区分「保存二维码」与「复制微信号」两按钮。H5 无一键存相册能力（JS-SDK 排除），
// 保存 = fetch blob 触发浏览器下载（PC/安卓生效）；微信 X5 拦截下载时降级新窗打开原图供长按。
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download } from 'lucide-react';
import { apiGet } from '../../services/api';
import { resolveContactTarget } from '../../services/contact';
import type { GigDetail, SiteConfig } from '../../services/types';

interface ContactModalProps {
  /** null = 全局联系（无单子上下文，走站点配置） */
  gig: GigDetail | null;
  onClose: () => void;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // 微信 H5 降级：临时 textarea + execCommand
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    ta.remove();
  }
  return Promise.resolve();
}

export default function ContactModal({ gig, onClose }: ContactModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['site-config'],
    queryFn: () => apiGet<{ data: SiteConfig }>('/site-config'),
    retry: 1,
  });

  // 打开即锁定页面滚动，焦点移入弹层；关闭时归还焦点
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const siteConfig = data?.data;
  const target = siteConfig
    ? resolveContactTarget(gig, gig?.publisher_contact ?? null, siteConfig)
    : null;

  async function handleCopy() {
    if (!target) return;
    await copyText(target.wxid);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  // 直接下载（用户 PO 选择 2026-08-29 v0.3.3）：blob 同源化后 a.download 才生效（跨域 URL 会被忽略）
  async function handleSaveQr() {
    if (!target) return;
    const url = target.qr_image_url;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = url.split('/').pop()?.split('?')[0] || 'qrcode.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  return (
    <div
      className="modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label="联系小助理"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <h3>联系小助理接单</h3>
        {gig?.contact_wxid ? (
          <p className="hint" style={{ marginTop: 0 }}>本单为专属微信，请添加该微信号接单。</p>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>扫描二维码或复制微信号添加小助理，备注来意。</p>
        )}

        {isPending && <p className="hint">联系方式加载中…</p>}
        {isError && (
          <div className="row" style={{ marginTop: 12 }}>
            <p className="hint" style={{ marginTop: 0, flex: 1 }}>联系方式加载失败</p>
            <button type="button" className="btn btn-sm" onClick={() => void refetch()}>重试</button>
          </div>
        )}

        {target && (
          <>
            <div className="contact-qr">
              <img src={target.qr_image_url} alt="小助理微信二维码" />
            </div>
            <p className="contact-wxid-label">微信号 / WECHAT ID</p>
            <div className="code-line" data-testid="contact-wxid">{target.wxid}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => void handleSaveQr()}>
                <Download size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
                保存二维码
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void handleCopy()}>
                {copied ? (
                  <>
                    <Check size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />已复制 ✓
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />复制微信号
                  </>
                )}
              </button>
            </div>
            <p className="hint">若未开始下载（微信内常见），请长按上方二维码图片选择保存。</p>
            {target.notice && <p className="hint">{target.notice}</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" ref={closeBtnRef} className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
