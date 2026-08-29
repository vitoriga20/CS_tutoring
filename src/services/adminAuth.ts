// 管理端登录门状态（T-M4-1，契约：specs/spec.md §9 约束「登录仅管理员使用，走 supabase-js」）
// role 判定数据源为 profiles.role（RLS 允许用户读自己一行；教训 L-001 的前端侧镜像——
// 服务端 assertAdmin 仍是写接口的权威门禁，这里只做 UI 分流）。
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AdminSessionState =
  | { state: 'unconfigured' } // VITE_SUPABASE_* 未配置
  | { state: 'restoring' } // 恢复持久化会话中
  | { state: 'checkingRole' } // 已登录，查询 profiles.role 中
  | { state: 'signedOut' }
  | { state: 'admin' }
  | { state: 'forbidden'; reason: string };

async function resolveRole(session: Session | null, alive: () => boolean): Promise<AdminSessionState> {
  if (!session || !supabase) return { state: 'signedOut' };
  if (!alive()) return { state: 'checkingRole' };
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (!alive()) return { state: 'checkingRole' };
  if (error) return { state: 'forbidden', reason: `权限确认失败：${error.message}` };
  if (data?.role === 'admin') return { state: 'admin' };
  return {
    state: 'forbidden',
    reason: data ? '当前账号不是管理员（profiles.role ≠ admin）' : '账号资料行不存在，请联系管理员在 Supabase 中提权',
  };
}

export function useAdminSession() {
  const [snap, setSnap] = useState<AdminSessionState>(() =>
    supabase ? { state: 'restoring' } : { state: 'unconfigured' },
  );

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const alive = () => mounted;
    // supabase-js v2 订阅即发 INITIAL_SESSION（页面刷新恢复会话也走这里）；
    // TOKEN_REFRESHED 时重查 role，可及时反映后台提权/降权。
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSnap({ state: session ? 'checkingRole' : 'signedOut' });
      void resolveRole(session, alive).then((next) => {
        if (mounted) setSnap(next);
      });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase 未配置');
    // 成功后由 onAuthStateChange(SIGNED_IN) 驱动状态迁移
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // 成功后由 onAuthStateChange(SIGNED_OUT) 驱动状态迁移
    await supabase?.auth.signOut();
  }, []);

  return { snap, signIn, signOut };
}
