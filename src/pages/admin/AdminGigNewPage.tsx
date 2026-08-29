// 发布单子（T-M4-3，契约：spec.md §2.2「发布成功」POST /gigs → 201 status=open）
// 「单子专属微信」默认填当前账号的 wxid（spec v0.3.0：用户中心资料 → 表单默认值），可改可清空。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { apiGet, apiPost } from '../../services/api';
import GigForm, { type GigFormPayload } from '../../components/admin/GigForm';
import type { Profile } from '../../services/types';

export default function AdminGigNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ data: Profile }>('/me'),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (payload: GigFormPayload) => apiPost<{ data: { id: string } }>('/gigs', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
      navigate('/admin');
    },
  });

  return (
    <main className="page">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={13} aria-hidden="true" /> 返回单子管理
      </Link>
      <header className="m-head" data-tag="ADMIN / NEW GIG">
        <h1>发布单子</h1>
        <p className="m-head-sub">New Gig · 发布后状态为招募中</p>
      </header>
      <GigForm
        submitLabel="发布"
        defaultContactWxid={meData?.data.wxid ?? undefined}
        onCancel={() => navigate('/admin')}
        onSubmit={(payload) => create.mutateAsync(payload)}
      />
    </main>
  );
}
