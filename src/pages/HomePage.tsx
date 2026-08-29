// 首页列表（T-M3-2，契约：spec.md §2.1 + §3 分页/筛选参数）
// 状态机：pending=骨架屏（6 卡）→ 成功有数据=卡片流 + 分页；成功无数据=空态文案；
// 失败=错误态 + 重试。空态时不得渲染骨架屏或错误提示（TC-VIEW-003）。
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { apiGet } from '../services/api';
import type { Page } from '../services/types';
import type { Gig } from '../services/types';
import GigCard from '../components/GigCard';

const PAGE_SIZE = 20;
const SKELETON_COUNT = 6;

export default function HomePage() {
  const [grade, setGrade] = useState('');
  const [mode, setMode] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);

  // 科目输入 350ms 防抖后再发起查询；任何筛选变化回到第 1 页
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSubject(subjectText.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [subjectText]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['gigs', { grade, mode, subject, page }],
    queryFn: () =>
      apiGet<Page<Gig>>('/gigs', {
        grade_level: grade || undefined,
        mode: mode || undefined,
        subject: subject || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    retry: 1,
  });

  const meta = data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <main className="page">
      <header className="m-head" data-tag="TUTORING ORDERS / STUDENT">
        <h1>家教单</h1>
        <p className="m-head-sub">Open Orders · 免登录浏览 · 联系管理员接单</p>
      </header>

      <div className="filter-bar">
        <div className="filter-m">
          <select
            className="input"
            aria-label="按年级段筛选"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部年级</option>
            <option value="primary">小学</option>
            <option value="junior">初中</option>
            <option value="senior">高中</option>
            <option value="college">大学</option>
          </select>
          <select
            className="input"
            aria-label="按授课模式筛选"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部模式</option>
            <option value="online">线上</option>
            <option value="offline">线下</option>
          </select>
          <input
            className="input filter-m__subject"
            type="text"
            aria-label="按科目筛选"
            placeholder="科目筛选，如：数学"
            maxLength={40}
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
          />
        </div>
      </div>

      {isPending ? (
        <div className="task-list" aria-busy="true" aria-label="加载中">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className="task-item animate-pulse" aria-hidden="true" style={{ display: 'block' }}>
              <div className="skel-bar skel-bar--lg" />
              <div className="skel-bar skel-bar--tag" style={{ marginTop: 10 }} />
              <div className="skel-bar" style={{ marginTop: 10, width: '45%' }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="state-box state-box--error" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <p>单子加载失败{error instanceof Error ? `：${error.message}` : ''}</p>
          <button type="button" className="btn" onClick={() => void refetch()}>重试</button>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="state-box">
          <Inbox size={28} aria-hidden="true" />
          <p>暂时没有新单子，过几天再来看看</p>
        </div>
      ) : (
        <>
          <div className="task-list">
            {data.data.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
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
    </main>
  );
}
