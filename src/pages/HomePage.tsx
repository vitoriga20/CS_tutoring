// 首页列表（T-M3-2 + v0.4.0 筛选增强，契约：spec.md §2.1 + §3）
// 状态机：pending=骨架屏（6 卡）→ 成功有数据=卡片流 + 分页；成功无数据=空态文案；
// 失败=错误态 + 重试。空态时不得渲染骨架屏或错误提示（TC-VIEW-003）。
// 筛选 UI（用户对齐确认 2026-08-30）：区域/科目/年级 BA chip 横排点选（单选，再点取消）；
// 模式/价格/性别/排序收进「更多筛选」展开区；任何筛选变化回到第 1 页。
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Inbox, SlidersHorizontal } from 'lucide-react';
import { apiGet } from '../services/api';
import type { Page } from '../services/types';
import type { District, Gig, GigSort, GradeLevel, LessonMode, PriceFilter, StudentGender } from '../services/types';
import GigCard from '../components/GigCard';
import { DISTRICT_LABEL, GRADE_LABEL, MODE_LABEL, PRICE_LABEL, SORT_LABEL, SUBJECT_OPTIONS } from '../services/labels';

const PAGE_SIZE = 20;
const SKELETON_COUNT = 6;

const DISTRICTS = Object.keys(DISTRICT_LABEL) as District[];
const GRADES = Object.keys(GRADE_LABEL) as GradeLevel[];
const PRICES = Object.keys(PRICE_LABEL) as PriceFilter[];

export default function HomePage() {
  const [district, setDistrict] = useState<District | ''>('');
  const [subject, setSubject] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [grade, setGrade] = useState<GradeLevel | ''>('');
  const [mode, setMode] = useState<LessonMode | ''>('');
  const [price, setPrice] = useState<PriceFilter | ''>('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [sort, setSort] = useState<GigSort>('newest');
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(1);

  // 科目自定义输入 350ms 防抖后再发起查询；点 chip 立即生效
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSubject(subjectText.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [subjectText]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['gigs', { district, subject, grade, mode, price, gender, sort, page }],
    queryFn: () =>
      apiGet<Page<Gig>>('/gigs', {
        district: district || undefined,
        subject: subject || undefined,
        grade_level: grade || undefined,
        mode: mode || undefined,
        price: price || undefined,
        student_gender: gender || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
    retry: 1,
  });

  const meta = data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const activeCount = [district, subject, grade, mode, price, gender, sort !== 'newest'].filter(Boolean).length;

  // chip 单选语义：点已选中的 chip 取消（回 ''）
  const toggle = <T extends string>(cur: T | '', val: T, set: (v: T | '') => void) => {
    set(cur === val ? '' : val);
    setPage(1);
  };

  const Chip = ({
    label,
    active,
    onClick,
    title,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      className={`chip${active ? ' is-on' : ''}`}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <main className="page">
      <header className="m-head" data-tag="TUTORING ORDERS / STUDENT">
        {/* BA 换皮（decisions/005）：官方生成器 logo，alpha 包围盒已裁剪（public/logo-ba.png） */}
        <img className="m-head__logo" src="/logo-ba.png" alt="CS_tutoring" />
        <h1>家教单</h1>
        <p className="m-head-sub">Open Orders · 免登录浏览 · 联系管理员接单</p>
      </header>

      <div className="filter-bar">
        <div className="chip-row" role="group" aria-label="按区县筛选">
          <span className="chip-row__label">区域</span>
          {DISTRICTS.map((d) => (
            <Chip
              key={d}
              label={DISTRICT_LABEL[d]}
              active={district === d}
              onClick={() => toggle(district, d, setDistrict)}
            />
          ))}
        </div>

        <div className="chip-row" role="group" aria-label="按科目筛选">
          <span className="chip-row__label">科目</span>
          {SUBJECT_OPTIONS.map((s) => (
            <Chip key={s} label={s} active={subject === s} onClick={() => {
              setSubject(subject === s ? '' : s);
              setSubjectText(subject === s ? '' : s);
              setPage(1);
            }} />
          ))}
          <input
            className="chip-custom"
            type="text"
            aria-label="自定义科目筛选"
            placeholder="自定义科目…"
            maxLength={40}
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
          />
        </div>

        <div className="chip-row" role="group" aria-label="按年级段筛选">
          <span className="chip-row__label">年级</span>
          {GRADES.map((g) => (
            <Chip key={g} label={GRADE_LABEL[g]} active={grade === g} onClick={() => toggle(grade, g, setGrade)} />
          ))}
        </div>

        <button
          type="button"
          className="chip more-toggle"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <SlidersHorizontal size={12} aria-hidden="true" /> 更多筛选
          {activeCount > 0 && <span className="more-toggle__badge">{activeCount}</span>}
          <ChevronDown size={12} aria-hidden="true" style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }} />
        </button>

        {moreOpen && (
          <div className="more-panel">
            <div className="chip-row" role="group" aria-label="按授课模式筛选">
              <span className="chip-row__label">模式</span>
              {(Object.keys(MODE_LABEL) as LessonMode[]).map((m) => (
                <Chip key={m} label={MODE_LABEL[m]} active={mode === m} onClick={() => toggle(mode, m, setMode)} />
              ))}
            </div>
            <div className="chip-row" role="group" aria-label="按时薪筛选">
              <span className="chip-row__label">时薪</span>
              {PRICES.map((p) => (
                <Chip key={p} label={PRICE_LABEL[p]} active={price === p} onClick={() => toggle(price, p, setPrice)} />
              ))}
            </div>
            <div className="chip-row" role="group" aria-label="按学员性别筛选">
              <span className="chip-row__label">性别</span>
              <Chip label="男" active={gender === 'male'} onClick={() => toggle(gender, 'male', setGender)} />
              <Chip label="女" active={gender === 'female'} onClick={() => toggle(gender, 'female', setGender)} />
            </div>
            <div className="chip-row" role="group" aria-label="排序">
              <span className="chip-row__label">排序</span>
              {(Object.keys(SORT_LABEL) as GigSort[]).map((s) => (
                <Chip key={s} label={SORT_LABEL[s]} active={sort === s} onClick={() => { setSort(s); setPage(1); }} />
              ))}
            </div>
          </div>
        )}
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
