// 管理端登录门（T-M4-1，契约：specs/spec.md §9「登录仅管理员使用，走 supabase-js」）
// 未登录 → 邮箱+密码表单；登录但非 admin → 无权限提示；admin → 渲染子路由（Outlet）。
// 会话恢复/监听由 useAdminSession（onAuthStateChange）承担；跨 /admin 子路由保持挂载。
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Outlet } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAdminSession } from '../../services/adminAuth';

function GateSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="state-box">
      <div className="skel-bar skel-bar--lg" />
      <div className="skel-bar skel-bar--tag" />
    </div>
  );
}

function LoginForm({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrMsg(null);
    try {
      await onSignIn(email, password);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} aria-label="管理员登录">
      <label className="f-label" htmlFor="ag-email">邮箱 / EMAIL</label>
      <input
        id="ag-email"
        className="input block-input"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="f-label" htmlFor="ag-password">密码 / PASSWORD</label>
      <input
        id="ag-password"
        className="input block-input"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {errMsg && (
        <p className="f-err" role="alert">
          登录失败：{errMsg}
        </p>
      )}
      <button type="submit" className="btn btn-primary block" disabled={busy}>
        {busy ? '登录中…' : '登录管理后台'}
      </button>
    </form>
  );
}

export default function AdminGate() {
  const { snap, signIn, signOut, recheck } = useAdminSession();

  if (snap.state === 'unconfigured') {
    return (
      <div className="state-box state-box--error" role="alert">
        <ShieldAlert size={28} aria-hidden="true" />
        <p>Supabase 未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），管理端不可用</p>
      </div>
    );
  }

  if (snap.state === 'restoring' || snap.state === 'checkingRole') {
    return <GateSkeleton label="正在确认登录状态" />;
  }

  if (snap.state === 'signedOut') {
    return (
      <main className="page">
        <header className="m-head" data-tag="ADMIN / AUTH">
          <h1>管理登录</h1>
          <p className="m-head-sub">Admin Sign-in · 仅管理员账号</p>
        </header>
        <LoginForm onSignIn={signIn} />
      </main>
    );
  }

  if (snap.state === 'forbidden') {
    return (
      <main className="page">
        <header className="m-head" data-tag="ADMIN / AUTH">
          <h1>无权限</h1>
          <p className="m-head-sub">Forbidden · Admin Only</p>
        </header>
        <div className="state-box state-box--error" role="alert">
          <ShieldAlert size={28} aria-hidden="true" />
          <p>{snap.reason}</p>
          <button type="button" className="btn" onClick={() => void recheck()}>
            重新检查权限
          </button>
          <button type="button" className="btn" onClick={() => void signOut()}>
            退出登录，换账号
          </button>
        </div>
      </main>
    );
  }

  return <Outlet />;
}
