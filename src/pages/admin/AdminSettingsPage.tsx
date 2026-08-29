// 联系方式设置（T-M4-4，契约：spec.md §4.2 site_config + §5.3 validateSiteConfigPatch 规则）
// wxid/notice 编辑走 PATCH /api/v1/site-config；二维码经 supabase-js 上传至公开 bucket
// site-assets（Storage RLS：仅 profiles.role=admin 可写）→ getPublicUrl → PATCH 回写
// qr_image_url（时间戳文件名避免公开 URL 缓存旧图）→ 旧对象尽力清理（失败不影响主流程）。
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowLeft, Upload } from 'lucide-react';
import { ApiError, apiGet, apiPatch } from '../../services/api';
import { supabase } from '../../lib/supabase';
import type { FieldIssue } from '../../services/api';
import type { SiteConfig } from '../../services/types';

/** 从公开 URL 提取 bucket 内对象路径（用于换图后清理旧文件） */
function storagePathFromUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/site-assets/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length);
  return path === '' ? null : decodeURIComponent(path.split('?')[0]);
}

function extOf(file: File): string {
  const byName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  if (byName && /^(png|jpe?g|webp|gif)$/.test(byName)) return byName === 'jpeg' ? 'jpg' : byName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function issuesToMap(details: FieldIssue[]): Record<string, string> {
  return Object.fromEntries(details.map((d) => [d.field, d.reason]));
}

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['site-config'],
    queryFn: () => apiGet<{ data: SiteConfig }>('/site-config'),
    retry: 1,
  });

  const [wxid, setWxid] = useState('');
  const [notice, setNotice] = useState('');
  const [filled, setFilled] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const config = data?.data;
  useEffect(() => {
    if (config && !filled) {
      setWxid(config.wxid);
      setNotice(config.notice ?? '');
      setFilled(true);
    }
  }, [config, filled]);

  const save = useMutation({
    mutationFn: (payload: { wxid?: string; notice?: string | null }) =>
      apiPatch<{ data: SiteConfig }>('/site-config', payload),
    onSuccess: () => {
      setFieldErrors({});
      setSaveError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      void qc.invalidateQueries({ queryKey: ['site-config'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.details && e.details.length > 0) {
        setFieldErrors(issuesToMap(e.details));
        setSaveError(null);
      } else {
        setSaveError(e instanceof Error ? e.message : '保存失败，请稍后重试');
      }
    },
  });

  async function handleSave() {
    if (save.isPending) return;
    const w = wxid.trim();
    const n = notice.trim();
    if (w.length < 1 || w.length > 40) {
      setFieldErrors({ wxid: '长度须在 1..40' });
      return;
    }
    if (n.length > 200) {
      setFieldErrors({ notice: '须为 ≤200 字符的字符串或 null' });
      return;
    }
    setFieldErrors({});
    await save.mutateAsync({ wxid: w, notice: n === '' ? null : n });
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    setFile(e.target.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!file || uploadBusy) return;
    if (!supabase) {
      setUploadError('Supabase 未配置，无法上传');
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    const oldUrl = config?.qr_image_url ?? null;
    try {
      const path = `qr/qr-${Date.now()}.${extOf(file)}`;
      const { error: upErr } = await supabase
        .storage.from('site-assets')
        .upload(path, file, { contentType: file.type || 'image/png' });
      if (upErr) throw new Error(`上传失败：${upErr.message}`);
      const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(path);
      await apiPatch('/site-config', { qr_image_url: pub.publicUrl });
      const oldPath = oldUrl ? storagePathFromUrl(oldUrl) : null;
      if (oldPath) {
        void supabase.storage.from('site-assets').remove([oldPath]).catch(() => undefined);
      }
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['site-config'] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试');
    } finally {
      setUploadBusy(false);
    }
  }

  if (isPending) {
    return (
      <main className="page">
        <div aria-busy="true" aria-label="加载中" className="state-box">
          <div className="skel-bar skel-bar--lg" />
          <div className="skel-bar skel-bar--tag" />
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="page">
        <Link to="/admin" className="back-link">
          <ArrowLeft size={13} aria-hidden="true" /> 返回单子管理
        </Link>
        <div className="state-box state-box--error" role="alert" style={{ marginTop: 12 }}>
          <p>配置加载失败{error instanceof Error ? `：${error.message}` : ''}</p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={13} aria-hidden="true" /> 返回单子管理
      </Link>
      <header className="m-head" data-tag="ADMIN / SITE CONFIG">
        <h1>联系方式设置</h1>
        <p className="m-head-sub">Site Config · 学生端联系弹层的数据源</p>
      </header>

      <p className="detail-label">微信二维码 / QR</p>
      <div className="detail-block">
        <div className="contact-qr" style={{ margin: '0 0 10px' }}>
          <img src={config!.qr_image_url} alt="当前微信二维码" />
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          换图会立即对学生端生效。新图以新文件名上传（避免缓存），旧图自动清理。
        </p>
        <div className="row">
          <label className="btn" style={{ position: 'relative', overflow: 'hidden' }}>
            <Upload size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
            选择图片
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFile}
              disabled={uploadBusy}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </label>
          {file && <span className="muted">{file.name}</span>}
          <button type="button" className="btn btn-primary" disabled={!file || uploadBusy} onClick={() => void handleUpload()}>
            {uploadBusy ? '上传中…' : '上传并启用'}
          </button>
        </div>
        {uploadError && (
          <p className="f-err" role="alert">
            {uploadError}
          </p>
        )}
      </div>

      <label className="f-label" htmlFor="sc-wxid">微信号 / WXID</label>
      <input
        id="sc-wxid"
        className="input block-input"
        type="text"
        maxLength={40}
        value={wxid}
        onChange={(e) => setWxid(e.target.value)}
        aria-required="true"
      />
      {fieldErrors.wxid && (
        <p className="f-err" role="alert">
          微信号：{fieldErrors.wxid}
        </p>
      )}

      <label className="f-label" htmlFor="sc-notice">弹层提示 / NOTICE</label>
      <textarea
        id="sc-notice"
        className="input block-input"
        rows={3}
        maxLength={200}
        placeholder="展示在联系弹层底部（可空，≤200 字）"
        value={notice}
        onChange={(e) => setNotice(e.target.value)}
      />
      {fieldErrors.notice && (
        <p className="f-err" role="alert">
          弹层提示：{fieldErrors.notice}
        </p>
      )}

      {saveError && (
        <p className="f-err" role="alert">
          {saveError}
        </p>
      )}
      <button type="button" className="btn btn-primary block" disabled={save.isPending} onClick={() => void handleSave()}>
        {save.isPending ? '保存中…' : saved ? '已保存 ✓' : '保存微信与提示'}
      </button>
    </main>
  );
}
