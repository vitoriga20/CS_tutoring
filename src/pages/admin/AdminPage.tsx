// 单子管理列表（T-M4-2，契约：spec.md §2.2 + §3 status 参数 open|matched|closed|all）
// 状态 Tab 切换；行内状态操作按状态机只渲染合法目标状态（GigRowActions）；
// 删除走二次确认模态（移植的 grad .modal）；迁移/删除成功后失效列表缓存。
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { apiDelete, apiGet, apiPatch } from '../../services/api';
import { GRADE_LABEL, MODE_LABEL } from '../../services/labels';
import type { Gig, GigListMeta, GigStatus } from '../../services/types';
import StatusBadge from '../../components/StatusBadge';
import GigRowActions from '../../components/admin/GigRowActions';

const PAGE_SIZE = 20;
const SKELETON_COUNT = 6;

type StatusTab = 'all' | GigStatus;

const STATUS_TABS: ReadonlyArray<{ value: StatusTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '招募中' },
  { value: 'matched', label: '已匹配' },
  { value: 'closed', label: '已关闭' },
];

export default function AdminPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState<Gig | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin-gigs', { status, page }],
    queryFn: () => apiGet<{ data: Gig[]; meta: GigListMeta }>('/gigs', { status, page, pageSize: PAGE_SIZE }),
    retry: 1,
  });

  // 迁移与删除共用失效逻辑；GIG_INVALID_TRANSITION 等错误在行上方统一提示
  const invalidateList = () => {
    void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
  };
  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: GigStatus }) => apiPatch<{ data: Gig }>(`/gigs/${id}`, { status: to }),
    onSuccess: () => {
      setActionError(null);
      invalidateList();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : '状态操作失败'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/gigs/${id}`),
    onSuccess: () => {
      setActionError(null);
      setConfirmTarget(null);
      invalidateList();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : '删除失败'),
  });
  const pending = transition.isPending || remove.isPending;

  const meta = data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <main className="page">
      <header className="m-head" data-tag="ADMIN / GIGS">
        <h1>单子管理</h1>
        <p className="m-head-sub">Gig Console · 发布 / 流转 / 下架</p>
      </header>

      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/admin/gigs/new" className="btn btn-primary">
          <Plus size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
          发布新单子
        </Link>
        <Link to="/admin/account" className="btn">
          用户中心
        </Link>
      </div>

      <div className="gh-tabs" role="tablist" aria-label="按状态筛选" style={{ marginBottom: 14 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            className={`gh-tab${status === t.value ? ' active' : ''}`}
            onClick={() => {
              setStatus(t.value);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="state-box state-box--error" role="alert" style={{ padding: '14px 16px', marginBottom: 13 }}>
          <p style={{ margin: 0 }}>{actionError}</p>
        </div>
      )}

      {isPending ? (
        <div className="task-list" aria-busy="true" aria-label="加载中">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className="task-item animate-pulse" aria-hidden="true" style={{ display: 'block' }}>
              <div className="skel-bar skel-bar--lg" />
              <div className="skel-bar skel-bar--tag" style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="state-box state-box--error" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <p>单子加载失败{error instanceof Error ? `：${error.message}` : ''}</p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="state-box">
          <Inbox size={28} aria-hidden="true" />
          <p>
            {status === 'all' ? '还没有任何单子，点「发布新单子」开始' : `没有${STATUS_TABS.find((t) => t.value === status)?.label ?? ''}状态的单子`}
          </p>
        </div>
      ) : (
        <>
          <div className="task-list">
            {data.data.map((gig) => (
              <div key={gig.id} className="task-item">
                <div className="t-main">
                  <p className="t-title">{gig.title}</p>
                  <div className="t-meta">
                    <StatusBadge status={gig.status} />
                    <span className="tag">{GRADE_LABEL[gig.grade_level]}</span>
                    <span className="tag status">{MODE_LABEL[gig.mode]}</span>
                    <span className="tag">{gig.region}</span>
                    {gig.rate && <span className="tag low">{gig.rate}</span>}
                  </div>
                </div>
                <GigRowActions
                  gig={gig}
                  pending={pending}
                  onTransition={(id, to) => transition.mutate({ id, to })}
                  onRequestDelete={setConfirmTarget}
                />
              </div>
            ))}
          </div>
          <nav className="pager" aria-label="分页">
            <button
              type="button"
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> 上一页
            </button>
            <span className="pager__info">
              第 {meta?.page ?? page} / {totalPages} 页 · 共 {meta?.total ?? 0} 单
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页 <ChevronRight size={14} aria-hidden="true" style={{ verticalAlign: -2 }} />
            </button>
          </nav>
        </>
      )}

      {confirmTarget && (
        <div
          className="modal-mask"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除单子"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setConfirmTarget(null);
          }}
        >
          <div className="modal" role="alertdialog" aria-labelledby="admin-del-title">
            <h3 id="admin-del-title">确认删除</h3>
            <p style={{ marginTop: 0 }}>
              确定删除单子「{confirmTarget.title}」？删除后学生端立即不可见，且不可恢复。
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={pending} onClick={() => setConfirmTarget(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => remove.mutate(confirmTarget.id)}
              >
                {remove.isPending ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
