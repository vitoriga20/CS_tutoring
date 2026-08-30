// 批量导入页（SPEC-002，specs/gig-import/spec.md §2/§3；tasks T-IMPORT-2-1..2-4）
// 流程：粘贴原文 → 解析（POST /gigs/import/preview，不写库）→ 预览行编辑/勾选
//       → 导入选中（POST /gigs/import，服务端逐元素重校验）→ 结果提示，failed 行回填标红
// 无破坏性操作；色板令牌源自 src/styles/ba-tokens.css（经 Tailwind @theme 映射）
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Inbox, Upload } from 'lucide-react';import { apiPost } from '../../services/api';
import { DISTRICT_LABEL, GRADE_LABEL, MODE_LABEL } from '../../services/labels';
import type {
  District,
  FieldIssue,
  GigImportCommitResult,
  GigImportDraft,
  GigImportRow,
  GradeLevel,
  LessonMode,
  StudentGender,
} from '../../services/types';

// 预览行：所有字段以字符串编辑（select 存枚举值；空串 = 未填）
interface EditRow {
  index: number;
  values: Record<keyof GigImportDraft, string>;
  issues: FieldIssue[];
  duplicate: boolean;
  status: 'ok' | 'error';
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

function rowFrom(g: GigImportRow): EditRow {
  const d = g.draft;
  const str = (v: string | null) => (v === null ? '' : v);
  return {
    index: g.index,
    duplicate: g.duplicate,
    status: g.status,
    issues: g.issues,
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

  // 解析预览（不写库）
  const parse = useMutation({
    mutationFn: () => apiPost<{ data: { rows: GigImportRow[] } }>('/gigs/import/preview', { raw_text: rawText }),
    onSuccess: (res) => {
      const next = res.data.rows.map(rowFrom);
      setRows(next);
      setSelected(new Set(next.filter((r) => r.status === 'ok' && !r.duplicate).map((r) => r.index)));
      setPreviewError(null);
    },
    onError: (e) => {
      setRows(null);
      setPreviewError(e instanceof Error ? e.message : '解析失败，请重试');
    },
  });

  // 导入选中（服务端逐元素重校验）
  const commit = useMutation({
    mutationFn: (payload: GigImportDraft[]) =>
      apiPost<{ data: GigImportCommitResult }>('/gigs/import', { rows: payload }),
    onSuccess: (res) => {
      const { created, failed } = res.data;
      void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
      setPreviewError(`导入完成：已创建 ${created.length} 条`);
      if (failed.length > 0 && rows) {
        // failed 行回填服务端 issues（权威校验结果），管理员修正后可重新导入
        const failIndexes = new Set(failed.map((f) => f.index));
        setRows(rows.map((r) => (failIndexes.has(r.index) ? { ...r, issues: failed.find((f) => f.index === r.index)?.details ?? r.issues } : r)));
        setSelected(new Set(selected));
        setPreviewError(`导入完成：已创建 ${created.length} 条，失败 ${failed.length} 条（已标红，请修正后重新导入）`);
      }
    },
    onError: (e) => setPreviewError(e instanceof Error ? e.message : '导入失败，请重试'),
  });

  const payloadRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => selected.has(r.index)).map((r) => toPayload(r.values));
  }, [rows, selected]);

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
          disabled={commit.isPending || payloadRows.length === 0}
          onClick={() => void commit.mutate(payloadRows)}
        >
          <Upload size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
          {commit.isPending ? '导入中…' : `导入选中（${payloadRows.length}）`}
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
            <PreviewRow key={row.index} row={row} checked={selected.has(row.index)} onToggle={() => toggle(row.index)} onValue={(k, v) => setValue(row.index, k, v)} />
          ))}
        </div>
      )}
    </main>
  );
}

// 单行预览卡片：勾选框 + 字段网格（红框 = issue）；duplicate 置灰不可勾
function PreviewRow({
  row,
  checked,
  onToggle,
  onValue,
}: {
  row: EditRow;
  checked: boolean;
  onToggle: () => void;
  onValue: (key: keyof GigImportDraft, value: string) => void;
}) {
  const issueMap = new Map(row.issues.map((i) => [i.field, i.reason]));
  return (
    <div className="task-item" style={{ padding: 12, opacity: row.duplicate ? 0.55 : 1 }}>
      <div className="t-main">
        <label className="f-check" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={checked} disabled={row.duplicate} onChange={onToggle} aria-label={`第 ${row.index + 1} 行`} />
          <span className="t-title" style={{ margin: 0 }}>
            #{row.index + 1} {row.values.title || '（无标题）'}
          </span>
          {row.duplicate && <span className="tag">重复</span>}
          {row.status === 'error' && !row.duplicate && <span className="tag high">待修正</span>}
        </label>
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
                disabled={row.duplicate}
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
                disabled={row.duplicate}
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
