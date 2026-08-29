// 用户中心（T-M6-3，契约：spec.md §2.3 + openapi /api/v1/me）
// 仅 admin 可达（AdminGate 子路由）；登录邮箱取自 supabase.auth（BFF /me 只回 profiles 行）。
// wxid 编辑走 PATCH /api/v1/me；二维码经 supabase-js 上传至公开 bucket site-assets 的
// qr/<uid>/ 目录（按账号隔离）→ getPublicUrl → PATCH /me 回写 qr_image_url → 旧对象尽力清理。
// 退出登录直接调 supabase.auth.signOut()：AdminGate 的 onAuthStateChange 订阅会切回登录页。
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowLeft, LogOut, Upload } from 'lucide-react';
import { ApiError, apiGet, apiPatch } from '../../services/api';
import { supabase } from '../../lib/supabase';
import type { FieldIssue } from '../../services/api';
import type { Profile } from '../../services/types';

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

export default function AdminAccountPage() {
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ data: Profile }>('/me'),
    retry: 1,
  });

  const [email, setEmail] = useState<string | null>(null);
  const [wxid, setWxid] = useState('');
  const [filled, setFilled] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const profile = data?.data;
  useEffect(() => {
    if (profile && !filled) {
      setWxid(profile.wxid ?? '');
      setFilled(true);
    }
  }, [profile, filled]);

  useEffect(() => {
    let mounted = true;
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data: u }) => {
      if (mounted) setEmail(u.user?.email ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const save = useMutation({
    mutationFn: (payload: { wxid?: string | null }) => apiPatch<{ data: Profile }>('/me', payload),
    onSuccess: () => {
      setFieldErrors({});
      setSaveError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      void qc.invalidateQueries({ queryKey: ['me'] });
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
    // 空框保存 = 清空（显式 null），学生端弹层回退到站点兜底（spec v0.3.0 三级回退）
    if (w === '') {
      setFieldErrors({});
      await save.mutateAsync({ wxid: null });
      return;
    }
    if (w.length > 40) {
      setFieldErrors({ wxid: '须为 1..40 字符的字符串' });
      return;
    }
    setFieldErrors({});
    await save.mutateAsync({ wxid: w });
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const f = e.target.files?.[0] ?? null;
    // 选中即自动上传并启用（用户指示 2026-08-29：合并「选择图片/上传并启用」两步）
    if (f) void handleUpload(f);
    e.target.value = '';
  }

  async function handleUpload(f: File) {
    if (uploadBusy) return;
    if (!supabase || !profile) {
      setUploadError(supabase ? '资料未加载，无法上传' : 'Supabase 未配置，无法上传');
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    const oldUrl = profile.qr_image_url ?? null;
    try {
      const path = `qr/${profile.id}/qr-${Date.now()}.${extOf(f)}`;
      const { error: upErr } = await supabase.storage
        .from('site-assets')
        .upload(path, f, { contentType: f.type || 'image/png' });
      if (upErr) throw new Error(`上传失败：${upErr.message}`);
      const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(path);
      await apiPatch('/me', { qr_image_url: pub.publicUrl });
      const oldPath = oldUrl ? storagePathFromUrl(oldUrl) : null;
      if (oldPath) {
        void supabase.storage.from('site-assets').remove([oldPath]).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试');
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
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
          <p>资料加载失败{error instanceof Error ? `：${error.message}` : ''}</p>
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
      <header className="m-head" data-tag="ADMIN / ACCOUNT">
        <h1>用户中心</h1>
        <p className="m-head-sub">Account · 我的联系资料与登录</p>
      </header>

      <p className="detail-label">登录账号 / SESSION</p>
      <div className="detail-block" style={{ padding: '10px 14px' }}>
        <p style={{ margin: 0 }}>{email ?? '（邮箱未取到）'}</p>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          角色：{profile!.role === 'admin' ? '管理员' : profile!.role}
        </p>
      </div>

      <p className="detail-label">我的微信二维码 / MY QR</p>
      <div className="detail-block">
        {profile!.qr_image_url ? (
          <div className="contact-qr" style={{ margin: '0 0 10px' }}>
            <img src={profile!.qr_image_url} alt="我的微信二维码" />
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            还没有上传二维码。上传后，你发布的单子联系弹层将展示你的二维码。
          </p>
        )}
        <div className="row">
          <label className="btn" style={{ position: 'relative', overflow: 'hidden' }}>
            <Upload size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
            {uploadBusy ? '上传中…' : profile!.qr_image_url ? '更换二维码' : '上传二维码'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFile}
              disabled={uploadBusy}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </label>
          {uploadBusy && <span className="muted">选中即自动上传并启用</span>}
        </div>
        {uploadError && (
          <p className="f-err" role="alert">
            {uploadError}
          </p>
        )}
      </div>

      <label className="f-label" htmlFor="ac-wxid">我的微信号 / MY WXID</label>
      <input
        id="ac-wxid"
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
      <p className="hint">发布单子时「单子专属微信」将默认填这里；留空保存即清空，学生端回退到站点联系方式。</p>

      {saveError && (
        <p className="f-err" role="alert">
          {saveError}
        </p>
      )}
      <button type="button" className="btn btn-primary block" disabled={save.isPending} onClick={() => void handleSave()}>
        {save.isPending ? '保存中…' : saved ? '已保存 ✓' : '保存微信号'}
      </button>

      <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={() => void handleSignOut()}>
        <LogOut size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
        退出登录
      </button>
    </main>
  );
}
