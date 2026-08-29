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
  const uid = session.user.id;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  if (!alive()) return { state: 'checkingRole' };
  if (import.meta.env.DEV) {
    // 排障日志：forbidden 分支判定依据（data/error 原样打印，不含 token）
    console.debug(
      `[adminAuth] profiles 查询 uid=${uid} → data=${JSON.stringify(data)} error=${error ? `${error.code}: ${error.message}` : 'null'}`,
    );
  }
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (import.meta.env.DEV) {
        console.debug(
          `[adminAuth] onAuthStateChange event=${event} hasSession=${Boolean(session)} uid=${session?.user.id ?? '-'}`,
        );
      }
      setSnap({ state: session ? 'checkingRole' : 'signedOut' });
      void resolveRole(session, alive).then((next) => {
        if (mounted) {
          if (import.meta.env.DEV) console.debug(`[adminAuth] 状态 → ${next.state}${next.state === 'forbidden' ? `（${next.reason}）` : ''}`);
          setSnap(next);
        }
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

  // 手动重查（Dashboard 提权后无需刷新页面；forbidden 态的「重新检查权限」按钮用）
  const recheck = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    setSnap({ state: data.session ? 'checkingRole' : 'signedOut' });
    setSnap(await resolveRole(data.session, () => true));
  }, []);

  return { snap, signIn, signOut, recheck };
}
