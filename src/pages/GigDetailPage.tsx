// 单子详情页（T-M3-3，契约：spec.md §2.1「已匹配单子详情」「详情页联系弹层」「不存在的单子」）
// 全字段展示 + 学员情况独立分块（含性别徽标）；matched/closed 时底部「联系管理员接单」禁用；
// 接口 404 GIG_NOT_FOUND → 页面 404 文案。
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { apiGet, ApiError } from '../services/api';
import { GRADE_LABEL, MODE_LABEL, STATUS_LABEL, genderLabel } from '../services/labels';
import { useContact } from '../components/contact/ContactContext';
import StatusBadge from '../components/StatusBadge';
import type { Gig } from '../services/types';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="加载中">
      <div className="task-item animate-pulse" style={{ display: 'block' }}>
        <div className="skel-bar skel-bar--lg" />
        <div className="skel-bar skel-bar--tag" style={{ marginTop: 10 }} />
      </div>
      <div className="task-item animate-pulse" style={{ display: 'block', marginTop: 13 }}>
        <div className="skel-bar" style={{ width: '80%' }} />
        <div className="skel-bar" style={{ marginTop: 10, width: '55%' }} />
      </div>
    </div>
  );
}

export default function GigDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { openContact } = useContact();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['gig', id],
    queryFn: () => apiGet<{ data: Gig }>(`/gigs/${id}`),
    enabled: Boolean(id),
    retry: 1,
  });

  if (isPending) {
    return (
      <main className="page">
        <DetailSkeleton />
      </main>
    );
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <main className="page">
        <Link to="/" className="back-link">
          <ArrowLeft size={13} aria-hidden="true" /> 返回单子列表
        </Link>
        <div className="state-box" style={{ marginTop: 12 }} role="alert">
          {notFound ? (
            <>
              <p className="detail-rate" style={{ fontSize: 34 }}>404</p>
              <p>单子不存在或已下架</p>
              <Link to="/" className="btn">回到首页看看其他单子</Link>
            </>
          ) : (
            <>
              <p>单子加载失败{error instanceof Error ? `：${error.message}` : ''}</p>
              <Link to="/" className="btn">返回单子列表</Link>
            </>
          )}
        </div>
      </main>
    );
  }

  const gig = data!.data;
  const gender = genderLabel(gig.student_gender);
  const contactDisabled = gig.status !== 'open';

  return (
    <main className="page">
      <Link to="/" className="back-link">
        <ArrowLeft size={13} aria-hidden="true" /> 返回单子列表
      </Link>

      <header className="m-head" data-tag={`GIG / ${gig.id.slice(0, 8).toUpperCase()}`}>
        <div className="t-meta" style={{ marginTop: 0, marginBottom: 8 }}>
          <StatusBadge status={gig.status} />
          <span className="tag low">{gig.subject}</span>
        </div>
        <h1 style={{ fontSize: 24 }}>{gig.title}</h1>
      </header>

      <div className="t-meta" style={{ marginTop: 0 }}>
        <span className="tag">{GRADE_LABEL[gig.grade_level]}</span>
        <span className="tag status">{MODE_LABEL[gig.mode]}</span>
        <span className="tag">{gig.region}</span>
        {gender && <span className="tag medium">{gender}</span>}
      </div>

      <p className="detail-label">报酬 / RATE</p>
      <div className="detail-block" style={{ padding: '10px 14px' }}>
        {gig.rate ? <span className="detail-rate">{gig.rate}</span> : <span className="muted">面议</span>}
        {gig.schedule && <span className="muted">　·　时段：{gig.schedule}</span>}
      </div>

      <p className="detail-label">学员情况 / STUDENT</p>
      <div className="detail-block">
        <div className="t-meta" style={{ marginTop: 0, marginBottom: 8 }}>
          {gender ? (
            <span className="tag medium">学员性别：{gender}</span>
          ) : (
            <span className="tag low">学员性别：未知</span>
          )}
        </div>
        <p style={{ margin: 0 }}>{gig.student_info}</p>
      </div>

      <p className="detail-label">对老师的要求 / REQUIREMENTS</p>
      <div className="detail-block">{gig.requirements}</div>

      <p className="muted" style={{ marginTop: 14 }}>
        发布于 {new Date(gig.created_at).toLocaleString('zh-CN', { hour12: false })}
      </p>

      <div className="detail-cta">
        <button
          type="button"
          className="btn btn-primary block"
          style={{ marginTop: 0 }}
          disabled={contactDisabled}
          onClick={() => openContact(gig)}
        >
          {contactDisabled ? `本单${STATUS_LABEL[gig.status]}，无法再联系` : '联系小助理接单'}
        </button>
      </div>
    </main>
  );
}
