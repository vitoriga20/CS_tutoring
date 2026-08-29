// 编辑单子（T-M4-3，契约：spec.md §2.2 PATCH /gigs/:id；状态流转操作收敛在管理列表页，
// 本页只编辑内容字段；404 GIG_NOT_FOUND → 错误态文案）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { ApiError, apiGet, apiPatch } from '../../services/api';
import GigForm, { type GigFormPayload } from '../../components/admin/GigForm';
import StatusBadge from '../../components/StatusBadge';
import type { Gig } from '../../services/types';

export default function AdminGigEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['gig', id],
    queryFn: () => apiGet<{ data: Gig }>(`/gigs/${id}`),
    enabled: Boolean(id),
    retry: 1,
  });

  const update = useMutation({
    mutationFn: (payload: GigFormPayload) => apiPatch<{ data: Gig }>(`/gigs/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
      void qc.invalidateQueries({ queryKey: ['gig', id] });
      navigate('/admin');
    },
  });

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
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <main className="page">
        <Link to="/admin" className="back-link">
          <ArrowLeft size={13} aria-hidden="true" /> 返回单子管理
        </Link>
        <div className="state-box state-box--error" role="alert" style={{ marginTop: 12 }}>
          {notFound ? <p>单子不存在或已删除</p> : <p>单子加载失败{error instanceof Error ? `：${error.message}` : ''}</p>}
          <Link to="/admin" className="btn">
            返回单子管理
          </Link>
        </div>
      </main>
    );
  }

  const gig = data!.data;

  return (
    <main className="page">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={13} aria-hidden="true" /> 返回单子管理
      </Link>
      <header className="m-head" data-tag={`ADMIN / EDIT ${gig.id.slice(0, 8).toUpperCase()}`}>
        <div className="t-meta" style={{ marginTop: 0, marginBottom: 8 }}>
          <StatusBadge status={gig.status} />
          <span className="tag low">{gig.subject}</span>
        </div>
        <h1 style={{ fontSize: 24 }}>编辑单子</h1>
      </header>
      <GigForm
        initial={gig}
        submitLabel="保存修改"
        onCancel={() => navigate('/admin')}
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
    </main>
  );
}
