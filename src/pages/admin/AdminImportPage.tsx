// 批量导入页（SPEC-002，specs/gig-import/spec.md §2/§3；SPEC-003 疑似重复确认增量 specs/import-dedup/spec.md §5.2/§5.3）
// 流程：粘贴原文 → 解析（POST /gigs/import/preview，不写库；SPEC-003：preview 对库中 open 单子宽松匹配填 suspect）
//       → 疑似行自动逐个弹窗裁决（pending 强制二选一；confirmed 置灰不导入 / dismissed 自动勾选照常导入）
//       → 导入选中（POST /gigs/import，服务端逐元素重校验；裁决为前端会话态，不回传不落库）
// 无破坏性操作；色板令牌源自 src/styles/ba-tokens.css（经 Tailwind @theme 映射）
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Inbox, Upload } from 'lucide-react';
import { apiPost } from '../../services/api';
import { DISTRICT_LABEL, GRADE_LABEL, MODE_LABEL } from '../../services/labels';
import type {
  District,
  FieldIssue,
  Gig,
  GigImportCommitResult,
  GigImportDraft,
  GigImportRow,
  GradeLevel,
  ImportSuspect,
  LessonMode,
  MatchSignal,
  StudentGender,
} from '../../services/types';

// SPEC-003 裁决状态（§5.2 状态机）：suspect 行初始 pending；非疑似行 null。
// v0.2.1 三态：confirmed（完全重复）/ dismissed（不重复，插入新单）/ reimport（更新单子，更新旧单内容）
type SuspectDecision = 'pending' | 'confirmed' | 'dismissed' | 'reimport';

// 预览行：所有字段以字符串编辑（select 存枚举值；空串 = 未填）
interface EditRow {
  index: number;
  values: Record<keyof GigImportDraft, string>;
  issues: FieldIssue[];
  duplicate: boolean;
  status: 'ok' | 'error';
  suspect: ImportSuspect | null;
  decision: SuspectDecision | null;
}

const FIELD_META: ReadonlyArray<{
  key: keyof GigImportDraft;
  label: string;
  required: boolean;
  kind: 'text' | 'number' | 'select';
  options?: ReadonlyArray<{ value: string; label: string }>;
}> = [
  { key: 'title', label: '标题', required: true, kind: 'text' },
  { key: 'subject', label: '科目', required: true, kind: 'text' },
  {
    key: 'grade_level',
    label: '年级段',
    required: true,
    kind: 'select',
    options: [
      { value: '', label: '未识别' },
      ...(Object.entries(GRADE_LABEL) as [GradeLevel, string][]).map(([v, l]) => ({ value: v, label: l })),
    ],
  },
  {
    key: 'mode',
    label: '授课模式',
    required: false,
    kind: 'select',
    options: (Object.entries(MODE_LABEL) as [LessonMode, string][]).map(([v, l]) => ({ value: v, label: l })),
  },
  { key: 'region', label: '详细地点', required: true, kind: 'text' },
  {
    key: 'district',
    label: '区县',
    required: false,
    kind: 'select',
    options: [
      { value: '', label: '未识别' },
      ...(Object.entries(DISTRICT_LABEL) as [District, string][]).map(([v, l]) => ({ value: v, label: l })),
    ],
  },
  {
    key: 'student_gender',
    label: '学员性别',
    required: false,
    kind: 'select',
    options: [
      { value: 'unknown', label: '未知' },
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
    ],
  },
  { key: 'student_info', label: '学员情况', required: true, kind: 'text' },
  { key: 'hourly_rate', label: '时薪（元/时）', required: false, kind: 'number' },
  { key: 'rate', label: '薪水原文', required: false, kind: 'text' },
  { key: 'schedule', label: '时间', required: false, kind: 'text' },
  { key: 'requirements', label: '对老师的要求', required: true, kind: 'text' },
  { key: 'contact_wxid', label: '单子专属微信', required: false, kind: 'text' },
];

// ── SPEC-003 对比弹窗：信号名 → 展示标签（§5.3 命中摘要） ──────
const SIGNAL_LABEL: Record<MatchSignal, string> = {
  grade_level: '年级',
  subject: '科目',
  district: '区县',
  hourly_rate: '时薪',
  student_gender: '性别',
  region: '地址',
};

// 对比字段：六项信号 + 标题/学员情况/时间/要求/发布时间（上下对照：上本批行、下库中单子）
const COMPARE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'grade_level', label: '年级段' },
  { key: 'subject', label: '科目' },
  { key: 'district', label: '区县' },
  { key: 'region', label: '详细地点' },
  { key: 'hourly_rate', label: '时薪（元/时）' },
  { key: 'student_gender', label: '学员性别' },
  { key: 'title', label: '标题' },
  { key: 'student_info', label: '学员情况' },
  { key: 'schedule', label: '时间' },
  { key: 'requirements', label: '对老师的要求' },
  { key: 'created_at', label: '库中发布时间' },
];

const GENDER_TEXT: Record<StudentGender, string> = { male: '男', female: '女', unknown: '未知' };

function fmtDraft(row: EditRow, key: string): string {
  if (key === 'created_at') return '—';
  const v = row.values[key as keyof GigImportDraft] ?? '';
  switch (key) {
    case 'grade_level':
      return v === '' ? '—' : (GRADE_LABEL[v as GradeLevel] ?? v);
    case 'district':
      return v === '' ? '—' : (DISTRICT_LABEL[v as District] ?? v);
    case 'student_gender':
      return v === '' ? '—' : (GENDER_TEXT[v as StudentGender] ?? v);
    case 'hourly_rate':
      return v === '' ? '—' : `${v} 元/时`;
    default: {
      const t = String(v).trim();
      return t === '' ? '—' : t;
    }
  }
}

function fmtGig(gig: Gig, key: string): string {
  switch (key) {
    case 'created_at':
      return new Date(gig.created_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
    case 'grade_level':
      return GRADE_LABEL[gig.grade_level] ?? '—';
    case 'district':
      return DISTRICT_LABEL[gig.district] ?? '—';
    case 'student_gender':
      return GENDER_TEXT[gig.student_gender] ?? '—';
    case 'hourly_rate':
      return gig.hourly_rate === null ? '—' : `${gig.hourly_rate} 元/时`;
    default: {
      const v = (gig as unknown as Record<string, unknown>)[key];
      const t = typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v);
      return t === '' ? '—' : t;
    }
  }
}

function rowFrom(g: GigImportRow): EditRow {
  const d = g.draft;
  const str = (v: string | null) => (v === null ? '' : v);
  return {
    index: g.index,
    duplicate: g.duplicate,
    status: g.status,
    issues: g.issues,
    suspect: g.suspect ?? null,
    decision: g.suspect ? ('pending' as const) : null,
    values: {
      title: str(d.title),
      subject: str(d.subject),
      grade_level: d.grade_level ?? '',
      mode: d.mode,
      region: str(d.region),
      district: d.district,
      student_gender: d.student_gender,
      student_info: str(d.student_info),
      hourly_rate: d.hourly_rate === null ? '' : String(d.hourly_rate),
      rate: str(d.rate),
      schedule: str(d.schedule),
      requirements: str(d.requirements),
      contact_wxid: str(d.contact_wxid),
    },
  };
}

// 提交载荷：空串归一为 null；grade_level 空 → null（服务端校验拒绝 → failed 行，符合 §5.3 权威校验）
function toPayload(values: Record<keyof GigImportDraft, string>): GigImportDraft {
  const opt = (s: string) => {
    const t = s.trim();
    return t === '' ? null : t;
  };
  const rateStr = values.hourly_rate.trim();
  return {
    title: values.title.trim() || null,
    subject: values.subject.trim() || null,
    grade_level: (values.grade_level as GradeLevel) || null,
    mode: (values.mode as LessonMode) || 'offline',
    region: values.region.trim() || null,
    district: (values.district as District) || 'other',
    hourly_rate: rateStr === '' ? null : Number(rateStr),
    student_gender: (values.student_gender as StudentGender) || 'unknown',
    student_info: values.student_info.trim() || null,
    rate: opt(values.rate),
    schedule: opt(values.schedule),
    requirements: values.requirements.trim() || null,
    contact_wxid: opt(values.contact_wxid),
  };
}

export default function AdminImportPage() {
  const qc = useQueryClient();
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);
  // SPEC-003：当前打开的对比弹窗行 index（null = 无弹窗）
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);

  // 解析预览（不写库）
  const parse = useMutation({
    mutationFn: () => apiPost<{ data: { rows: GigImportRow[] } }>('/gigs/import/preview', { raw_text: rawText }),
    onSuccess: (res) => {
      const next = res.data.rows.map(rowFrom);
      setRows(next);
      // 疑似行默认不勾选（SPEC-003 §5.3）；ok 且非疑似行默认勾（既有逻辑不变）
      setSelected(new Set(next.filter((r) => r.status === 'ok' && !r.duplicate && r.suspect === null).map((r) => r.index)));
      setPreviewError(null);
      // 解析完成后按 index 升序自动弹出首个 pending 的对比弹窗（§5.3 自动弹窗队列）
      const firstPending = next.filter((r) => r.suspect !== null).sort((a, b) => a.index - b.index);
      setDialogIndex(firstPending.length > 0 ? firstPending[0].index : null);
    },
    onError: (e) => {
      setRows(null);
      setDialogIndex(null);
      setPreviewError(e instanceof Error ? e.message : '解析失败，请重试');
    },
  });

  // 提交分流（v0.2.0 §5.3）：勾选行按裁决分流——dismissed → rows（插入）；reimport → updates（{id=suspect.gig.id, values}）；
  // updateIndexMap 记录 updates 数组下标 → 预览行 index（failed 回填定位用）
  const commitPayload = useMemo(() => {
    const insertRows: GigImportDraft[] = [];
    const updateRows: { id: string; values: GigImportDraft }[] = [];
    const updateIndexMap = new Map<number, number>();
    if (rows) {
      for (const r of rows) {
        if (!selected.has(r.index)) continue;
        if (r.suspect !== null && r.decision === 'reimport') {
          updateIndexMap.set(updateRows.length, r.index);
          updateRows.push({ id: r.suspect.gig.id, values: toPayload(r.values) });
        } else {
          insertRows.push(toPayload(r.values));
        }
      }
    }
    return { insertRows, updateRows, updateIndexMap };
  }, [rows, selected]);
  const commitCount = commitPayload.insertRows.length + commitPayload.updateRows.length;

  // 导入选中（服务端逐元素重校验；v0.2.0 双通道：rows 插入「不重复」行 + updates 更新旧单「更新单子」行）
  const commit = useMutation({
    mutationFn: () =>
      apiPost<{ data: GigImportCommitResult }>('/gigs/import', {
        rows: commitPayload.insertRows,
        updates: commitPayload.updateRows,
      }),
    onSuccess: (res) => {
      const { created, updated, failed } = res.data;
      void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
      let msg = `导入完成：已创建 ${created.length} 条`;
      if (updated.length > 0) msg += `，已更新 ${updated.length} 条`;
      if (failed.length > 0 && rows) {
        // failed 回填：kind=insert（缺省）沿用既有 index=预览行 index 语义（SPEC-002 遗留，勾选不连续时可能错位，未改动）；
        // kind=update 按 updates 数组下标 → 预览行 index 映射回填（§3.4）
        const failedByRow = new Map<number, FieldIssue[]>();
        for (const f of failed) {
          const rowIndex = f.kind === 'update' ? commitPayload.updateIndexMap.get(f.index) : f.index;
          if (rowIndex === undefined) continue;
          failedByRow.set(rowIndex, f.details);
        }
        setRows(rows.map((r) => (failedByRow.has(r.index) ? { ...r, issues: failedByRow.get(r.index) ?? r.issues } : r)));
        setSelected(new Set(selected));
        msg += `，失败 ${failed.length} 条（已标红，请修正后重新导入）`;
      }
      setPreviewError(msg);
    },
    onError: (e) => setPreviewError(e instanceof Error ? e.message : '导入失败，请重试'),
  });

  // SPEC-003：存在任一疑似行裁决为 pending → 「导入选中」禁用（§5.3）
  const hasPending = rows?.some((r) => r.suspect !== null && r.decision === 'pending') ?? false;
  const dialogRow = rows?.find((r) => r.index === dialogIndex) ?? null;

  const setValue = (index: number, key: keyof GigImportDraft, value: string) => {
    setRows((prev) => (prev ? prev.map((r) => (r.index === index ? { ...r, values: { ...r.values, [key]: value } } : r)) : prev));
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // SPEC-003 裁决（§5.2 状态机 v0.2.0）：pending → confirmed（取消勾选+置灰）/ dismissed（自动勾选，插入）/ reimport（自动勾选，更新旧单）；
  // 三态间可经「查看对比」任意改判（confirmed → 取消+置灰；dismissed/reimport → 自动勾选并换提交通道）；
  // 裁决完自动弹出下一个 pending；全部裁决完毕 → 无弹窗、导入按钮恢复可用
  const decide = (index: number, d: 'confirmed' | 'dismissed' | 'reimport') => {
    if (!rows) return;
    const row = rows.find((r) => r.index === index);
    if (!row) return;
    const updated = rows.map((r) => (r.index === index ? { ...r, decision: d } : r));
    setRows(updated);
    setSelected((prev) => {
      const next = new Set(prev);
      if (d === 'confirmed') {
        next.delete(index);
      } else if (row.status === 'ok') {
        // 不重复/更新单子 → 自动勾选（等同普通 ok 行）；error 行裁决后仍需修正字段后人工勾（红标与裁决两维度独立 §5.2）
        next.add(index);
      }
      return next;
    });
    const nextPending = updated.filter((r) => r.suspect !== null && r.decision === 'pending').sort((a, b) => a.index - b.index);
    setDialogIndex(nextPending.length > 0 ? nextPending[0].index : null);
  };

  return (
    <main className="page">
      <header className="m-head" data-tag="ADMIN / IMPORT">
        <h1>批量导入</h1>
      </header>

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => void parse.mutate()} disabled={parse.isPending || rawText.trim() === ''}>
          <ClipboardPaste size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
          {parse.isPending ? '解析中…' : '解析'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={commit.isPending || commitCount === 0 || hasPending}
          onClick={() => void commit.mutate()}
        >
          <Upload size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
          {commit.isPending ? '导入中…' : `导入选中（${commitCount}）`}
        </button>
      </div>

      <textarea
        className="input block-input"
        rows={6}
        placeholder="粘贴家教网原始文本（支持多条单子，格式见 specs/gig-import/spec.md）"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
      />

      {previewError && (
        <div className="state-box state-box--error" role="alert" style={{ padding: '14px 16px', marginTop: 13 }}>
          <p style={{ margin: 0 }}>{previewError}</p>
        </div>
      )}

      {parse.isPending && (
        <div className="state-box" aria-busy="true" style={{ marginTop: 13 }}>
          <p>解析中…</p>
        </div>
      )}

      {rows === null && !parse.isPending && !previewError && (
        <div className="state-box" style={{ marginTop: 13 }}>
          <Inbox size={28} aria-hidden="true" />
          <p>粘贴家教网原文后点「解析」，系统按规则抽取字段生成预览，可逐行修正后批量导入。</p>
        </div>
      )}

      {rows !== null && (
        <div className="task-list" style={{ marginTop: 14 }}>
          {rows.map((row) => (
            <PreviewRow
              key={row.index}
              row={row}
              checked={selected.has(row.index)}
              onToggle={() => toggle(row.index)}
              onValue={(k, v) => setValue(row.index, k, v)}
              onCompare={() => setDialogIndex(row.index)}
            />
          ))}
        </div>
      )}

      {dialogRow && <SuspectDialog row={dialogRow} onDecide={decide} onClose={() => setDialogIndex(null)} />}
    </main>
  );
}

// 单行预览卡片：勾选框 + 字段网格（红框 = issue）；duplicate 置灰不可勾；
// SPEC-003：疑似行默认不勾、pending/confirmed 不可勾；v0.2.0 reimport 行标记「重复-更新旧单」（§5.3）
function PreviewRow({
  row,
  checked,
  onToggle,
  onValue,
  onCompare,
}: {
  row: EditRow;
  checked: boolean;
  onToggle: () => void;
  onValue: (key: keyof GigImportDraft, value: string) => void;
  onCompare: () => void;
}) {
  const issueMap = new Map(row.issues.map((i) => [i.field, i.reason]));
  const dimmed = row.duplicate || (row.suspect !== null && row.decision === 'confirmed');
  const checkboxDisabled =
    row.duplicate || (row.suspect !== null && row.decision !== 'dismissed' && row.decision !== 'reimport');
  return (
    <div className="task-item" style={{ padding: 12, opacity: dimmed ? 0.55 : 1 }}>
      <div className="t-main">
        <label className="f-check" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={checked} disabled={checkboxDisabled} onChange={onToggle} aria-label={`第 ${row.index + 1} 行`} />
          <span className="t-title" style={{ margin: 0 }}>
            #{row.index + 1} {row.values.title || '（无标题）'}
          </span>
          {row.duplicate && <span className="tag">重复</span>}
          {row.suspect !== null && row.decision === 'pending' && <span className="tag medium">疑似重复</span>}
          {row.suspect !== null && row.decision === 'confirmed' && <span className="tag medium">已确认重复</span>}
          {row.suspect !== null && row.decision === 'reimport' && <span className="tag medium">重复-更新旧单</span>}
          {row.status === 'error' && !row.duplicate && <span className="tag high">待修正</span>}
        </label>
        {row.suspect !== null && (
          <button type="button" className="btn" style={{ marginBottom: 8 }} onClick={onCompare}>
            查看对比
          </button>
        )}
      </div>

      <div className="form-grid">
        {FIELD_META.map((f) => {
          const err = issueMap.get(f.key);
          const border = err ? '2px solid var(--red)' : '1px solid var(--line)';
          const label = (
            <span>
              {f.label}
              {f.required ? ' *' : ''}
            </span>
          );
          const control =
            f.kind === 'select' ? (
              <select
                className="input block-input"
                value={row.values[f.key]}
                disabled={checkboxDisabled}
                style={{ border }}
                onChange={(e) => onValue(f.key, e.target.value)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input block-input"
                type={f.kind === 'number' ? 'number' : 'text'}
                min={f.kind === 'number' ? 0 : undefined}
                max={f.kind === 'number' ? 10000 : undefined}
                disabled={checkboxDisabled}
                style={{ border }}
                value={row.values[f.key]}
                onChange={(e) => onValue(f.key, e.target.value)}
              />
            );
          return (
            <div key={f.key}>
              <label className="f-label">{label}</label>
              {control}
              {err && (
                <p className="f-err" role="alert">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// SPEC-003 对比弹窗（§5.3）：字段逐项上下对照 + 命中摘要 + 命中字段黄高亮；
// pending 态只有**三个**裁决按钮（完全重复/不重复/更新单子，v0.2.1 文案），无关闭路径、遮罩不关——保证弹窗队列必然被逐条裁决完；
// 已裁决行重开可在三态间改判、可关闭（状态机 §5.2）
function SuspectDialog({
  row,
  onDecide,
  onClose,
}: {
  row: EditRow;
  onDecide: (index: number, d: 'confirmed' | 'dismissed' | 'reimport') => void;
  onClose: () => void;
}) {
  const s = row.suspect;
  if (!s) return null;
  const mandatory = row.decision === 'pending';
  const hitSet = new Set(s.matched);
  const summary = [`命中 ${s.score}/6`];
  if (s.matched.length > 0) summary.push(s.matched.map((m) => SIGNAL_LABEL[m]).join('、'));
  if (s.hard) summary.push('编号一致（硬信号）');
  return (
    <div
      className="modal-mask"
      role="presentation"
      onMouseDown={mandatory ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="疑似重复对比">
        <h3>疑似重复 · 第 {row.index + 1} 行</h3>
        <p className="suspect-summary">{summary.join('；')}</p>
        <div>
          {COMPARE_FIELDS.map((f) => (
            <div key={f.key} className={hitSet.has(f.key as MatchSignal) ? 'compare-field hit' : 'compare-field'}>
              <span className="compare-label">{f.label}</span>
              <span className="compare-values">
                <span>
                  <span className="cap">本批</span>
                  {fmtDraft(row, f.key)}
                </span>
                <span>
                  <span className="cap">库中</span>
                  {fmtGig(s.gig, f.key)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          {!mandatory && (
            <button type="button" className="btn" onClick={onClose}>
              关闭
            </button>
          )}
          <button type="button" className="btn" onClick={() => onDecide(row.index, 'dismissed')}>
            不重复
          </button>
          <button type="button" className="btn" onClick={() => onDecide(row.index, 'reimport')}>
            更新单子
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onDecide(row.index, 'confirmed')}>
            完全重复
          </button>
        </div>
      </div>
    </div>
  );
}
