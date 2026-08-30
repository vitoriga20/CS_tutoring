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
const MODES = Object.keys(MODE_LABEL) as LessonMode[];
const SORTS = Object.keys(SORT_LABEL) as GigSort[];

// 筛选持久化（v0.4.1 用户对齐 2026-08-30）：sessionStorage 保存筛选值+页码，
// 进详情/退回来与刷新页面均保留，关闭页面重置；「更多筛选」展开状态不持久化。
const FILTERS_KEY = 'cs-tutoring.list-filters.v1';

interface StoredFilters {
  district?: District;
  subject?: string;
  subjectText?: string;
  grade?: GradeLevel;
  mode?: LessonMode;
  price?: PriceFilter;
  gender?: StudentGender;
  sort?: GigSort;
  // v0.5.0 标题搜索：q=实际生效搜索词（trim 后），qText=输入框文本（随持久化恢复输入态）
  q?: string;
  qText?: string;
  page?: number;
}

function readFilters(): StoredFilters | null {
  try {
    const raw = window.sessionStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as StoredFilters) : null;
  } catch {
    return null;
  }
}

// 恢复时做枚举/长度合法性校验，防止脏数据或旧格式污染状态
const pickEnum = <T extends string>(list: readonly T[], v: unknown): T | '' =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : '';
const pickText = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 40) : '');
// 搜索词上限 60（与 title 列约束一致，spec §3 q 契约）；复用 pickText 截断思路
const pickQText = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 60) : '');
const pickPage = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1);

export default function HomePage() {
  // 挂载时从 sessionStorage 恢复筛选+页码（无历史时 saved 为 null，各字段回默认值）
  const [saved] = useState(readFilters);
  const [district, setDistrict] = useState<District | ''>(() => pickEnum(DISTRICTS, saved?.district));
  const [subject, setSubject] = useState(() => pickText(saved?.subject));
  const [subjectText, setSubjectText] = useState(() => pickText(saved?.subjectText) || pickText(saved?.subject));
  const [grade, setGrade] = useState<GradeLevel | ''>(() => pickEnum(GRADES, saved?.grade));
  const [mode, setMode] = useState<LessonMode | ''>(() => pickEnum(MODES, saved?.mode));
  const [price, setPrice] = useState<PriceFilter | ''>(() => pickEnum(PRICES, saved?.price));
  const [gender, setGender] = useState<StudentGender | ''>(() => pickEnum(['male', 'female'], saved?.gender));
  const [sort, setSort] = useState<GigSort>(() => pickEnum(SORTS, saved?.sort) || 'newest');
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(() => pickPage(saved?.page));
  // v0.5.0 标题搜索：qText=输入框文本（含未生效输入），q=防抖后实际生效的搜索词
  const [q, setQ] = useState(() => pickQText(saved?.q));
  const [qText, setQText] = useState(() => pickQText(saved?.qText) || pickQText(saved?.q));

  // 科目自定义输入 350ms 防抖后再发起查询；点 chip 立即生效
  // 仅在输入值确实变化时重置页码（恢复 sessionStorage 时 subjectText===subject，不重置）
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = subjectText.trim();
      if (v !== subject) {
        setSubject(v);
        setPage(1);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [subjectText, subject]);

  // 搜索词 350ms 防抖即时生效（v0.5.0，复用科目输入防抖模式）：
  // 仅在 trim 后值确实变化时重置页码（恢复 sessionStorage 时 qText.trim()===q，不重置）
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = qText.trim();
      if (v !== q) {
        setQ(v);
        setPage(1);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [qText, q]);

  // 筛选+页码变化即写入 sessionStorage（含 subjectText/qText 输入态，供下次挂载恢复输入框）
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({ district, subject, subjectText, grade, mode, price, gender, sort, q, qText, page }),
      );
    } catch {
      // 隐私模式等写入被拒时静默忽略：仅本次会话不持久化，功能不受影响
    }
  }, [district, subject, subjectText, grade, mode, price, gender, sort, q, qText, page]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['gigs', { district, subject, grade, mode, price, gender, sort, q, page }],
    queryFn: () =>
      apiGet<Page<Gig>>('/gigs', {
        district: district || undefined,
        subject: subject || undefined,
        q: q || undefined,
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
      </header>

      <div className="filter-bar">
        {/* v0.5.0 标题搜索：常驻搜索框（350ms 防抖即时生效，无需回车；标题即单号） */}
        <input
          className="input filter-search"
          type="search"
          aria-label="搜单号 / 标题关键词"
          placeholder="搜单号 / 标题关键词"
          maxLength={60}
          value={qText}
          onChange={(e) => setQText(e.target.value)}
        />

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
          {/* v0.5.0：搜索激活且无结果时用搜索空态文案，与默认空态区分；清空搜索词恢复默认空态 */}
          <p>{q ? '没有找到相关单子，换个关键词试试' : '暂时没有新单子，过几天再来看看'}</p>
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
