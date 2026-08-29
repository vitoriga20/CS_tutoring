// 发布/编辑共用表单（T-M4-3，校验规则逐字对齐 specs/spec.md §5.3）
// 客户端先做同规则校验（trim 后长度/必填），通过后提交；服务端 422 VALIDATION_ERROR
// 的 details[] 按 field 映射回对应字段错误行（服务端是权威校验）。
// label 显式 htmlFor 关联（NFR：键盘可达 / Lighthouse a11y 门）。
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type FieldIssue } from '../../services/api';
import { DISTRICT_LABEL, GRADE_LABEL, MODE_LABEL } from '../../services/labels';
import type { District, Gig, GradeLevel, LessonMode, StudentGender } from '../../services/types';

export interface GigFormValues {
  title: string;
  subject: string;
  grade_level: GradeLevel;
  mode: LessonMode;
  district: District;
  region: string;
  student_gender: StudentGender;
  student_info: string;
  hourlyRateStr: string;
  negotiable: boolean;
  schedule: string;
  requirements: string;
  contact_wxid: string;
}

/** 提交载荷：可空字段空串归一为 null（对齐 §5.2 NULL 触发条件）；
 *  rate 文本由时薪数字自动生成「N元/小时」，面议/未填时 null（v0.4.0 §5.2） */
export interface GigFormPayload {
  title: string;
  subject: string;
  grade_level: GradeLevel;
  mode: LessonMode;
  district: District;
  region: string;
  hourly_rate: number | null;
  student_gender: StudentGender;
  student_info: string;
  rate: string | null;
  schedule: string | null;
  requirements: string;
  contact_wxid: string | null;
}

export function gigFormValuesFrom(gig: Gig): GigFormValues {
  return {
    title: gig.title,
    subject: gig.subject,
    grade_level: gig.grade_level,
    mode: gig.mode,
    district: gig.district,
    region: gig.region,
    student_gender: gig.student_gender,
    student_info: gig.student_info,
    hourlyRateStr: gig.hourly_rate === null ? '' : String(gig.hourly_rate),
    negotiable: gig.hourly_rate === null,
    schedule: gig.schedule ?? '',
    requirements: gig.requirements,
    contact_wxid: gig.contact_wxid ?? '',
  };
}

const EMPTY_VALUES: GigFormValues = {
  title: '',
  subject: '',
  grade_level: 'primary',
  mode: 'offline', // 新建默认「线下」（用户 PO 指示 2026-08-29 v0.3.2；编辑时以单子现有值为准）
  district: '' as District,
  region: '',
  student_gender: 'unknown',
  student_info: '',
  hourlyRateStr: '',
  negotiable: false,
  schedule: '',
  requirements: '',
  contact_wxid: '',
};

function clientValidate(v: GigFormValues): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const len = (s: string) => s.trim().length;
  if (len(v.title) < 1 || len(v.title) > 60) issues.push({ field: 'title', reason: '长度须在 1..60' });
  if (len(v.subject) < 1 || len(v.subject) > 40) issues.push({ field: 'subject', reason: '长度须在 1..40' });
  if (!v.district) issues.push({ field: 'district', reason: '请选择区县' });
  if (len(v.region) < 1 || len(v.region) > 40) issues.push({ field: 'region', reason: '长度须在 1..40' });
  if (len(v.student_info) < 1 || len(v.student_info) > 500)
    issues.push({ field: 'student_info', reason: '长度须在 1..500' });
  if (len(v.requirements) < 1 || len(v.requirements) > 2000)
    issues.push({ field: 'requirements', reason: '长度须在 1..2000' });
  // 时薪：面议时不校验；填了必须是 0..10000 整数
  if (!v.negotiable && v.hourlyRateStr.trim() !== '') {
    const n = Number(v.hourlyRateStr.trim());
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      issues.push({ field: 'hourly_rate', reason: '须为 0..10000 的整数，或勾选面议' });
    }
  }
  for (const [field, max] of [
    ['schedule', 120],
    ['contact_wxid', 40],
  ] as const) {
    const s = v[field];
    if (s.trim().length > max) issues.push({ field, reason: `长度须 ≤${max}` });
  }
  return issues;
}

function toPayload(v: GigFormValues): GigFormPayload {
  const opt = (s: string) => {
    const t = s.trim();
    return t === '' ? null : t;
  };
  const hourly_rate = v.negotiable ? null : v.hourlyRateStr.trim() === '' ? null : Number(v.hourlyRateStr.trim());
  const rate = hourly_rate === null ? null : `${hourly_rate}元/小时`;
  return {
    title: v.title.trim(),
    subject: v.subject.trim(),
    grade_level: v.grade_level,
    mode: v.mode,
    district: v.district,
    region: v.region.trim(),
    hourly_rate,
    student_gender: v.student_gender,
    student_info: v.student_info.trim(),
    rate,
    schedule: opt(v.schedule),
    requirements: v.requirements.trim(),
    contact_wxid: opt(v.contact_wxid),
  };
}

const FIELD_LABEL: Record<string, string> = {
  title: '标题',
  subject: '科目',
  grade_level: '年级段',
  mode: '授课模式',
  district: '区县',
  region: '详细地点',
  student_gender: '学员性别',
  student_info: '学员情况',
  hourly_rate: '时薪',
  schedule: '时间',
  requirements: '对老师的要求',
  contact_wxid: '单子专属微信',
};

interface GigFormProps {
  /** 编辑时传入现有单子填充表单 */
  initial?: Gig;
  submitLabel: string;
  /** 新建时「单子专属微信」默认值（当前账号 profiles.wxid，用户中心维护；可改可清空） */
  defaultContactWxid?: string;
  /** resolve 即视为成功（返回值仅用于 await 时序，表单不消费） */
  onSubmit: (payload: GigFormPayload) => Promise<unknown>;
  onCancel: () => void;
}

export default function GigForm({ initial, submitLabel, defaultContactWxid, onSubmit, onCancel }: GigFormProps) {
  const [values, setValues] = useState<GigFormValues>(() =>
    initial ? gigFormValuesFrom(initial) : { ...EMPTY_VALUES, contact_wxid: defaultContactWxid ?? '' },
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof GigFormValues>(key: K, value: GigFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const issues = clientValidate(values);
    if (issues.length > 0) {
      setFieldErrors(Object.fromEntries(issues.map((i) => [i.field, i.reason])));
      setFormError('请修正表单中标红的字段');
      return;
    }
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit(toPayload(values));
    } catch (err) {
      if (err instanceof ApiError && err.details && err.details.length > 0) {
        // 服务端 422 details 按字段回填（未知字段归入表单级错误）
        const map: Record<string, string> = {};
        const unknown: string[] = [];
        for (const d of err.details) {
          if (d.field in FIELD_LABEL) map[d.field] = d.reason;
          else unknown.push(`${FIELD_LABEL[d.field] ?? d.field}：${d.reason}`);
        }
        setFieldErrors(map);
        setFormError(unknown.length > 0 ? unknown.join('；') : '请修正表单中标红的字段');
      } else {
        setFormError(err instanceof Error ? err.message : '提交失败，请稍后重试');
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) =>
    fieldErrors[key] ? (
      <p className="f-err" role="alert">
        {FIELD_LABEL[key] ?? key}：{fieldErrors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} aria-label={initial ? '编辑单子表单' : '发布单子表单'} noValidate>
      <label className="f-label" htmlFor="gf-title">标题 * / TITLE</label>
      <input
        id="gf-title"
        className="input block-input"
        type="text"
        maxLength={60}
        value={values.title}
        onChange={(e) => set('title', e.target.value)}
        aria-required="true"
      />
      {fieldError('title')}

      <div className="form-grid">
        <div>
          <label className="f-label" htmlFor="gf-subject">科目 * / SUBJECT</label>
          <input
            id="gf-subject"
            className="input block-input"
            type="text"
            maxLength={40}
            value={values.subject}
            onChange={(e) => set('subject', e.target.value)}
            aria-required="true"
          />
          {fieldError('subject')}
        </div>
        <div>
          <label className="f-label" htmlFor="gf-grade">年级段 * / GRADE</label>
          <select
            id="gf-grade"
            className="input block-input"
            value={values.grade_level}
            onChange={(e) => set('grade_level', e.target.value as GradeLevel)}
            aria-required="true"
          >
            {(Object.keys(GRADE_LABEL) as GradeLevel[]).map((g) => (
              <option key={g} value={g}>
                {GRADE_LABEL[g]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div>
          <label className="f-label" htmlFor="gf-mode">授课模式 * / MODE</label>
          <select
            id="gf-mode"
            className="input block-input"
            value={values.mode}
            onChange={(e) => set('mode', e.target.value as LessonMode)}
            aria-required="true"
          >
            {(Object.keys(MODE_LABEL) as LessonMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="f-label" htmlFor="gf-gender">学员性别 / GENDER</label>
          <select
            id="gf-gender"
            className="input block-input"
            value={values.student_gender}
            onChange={(e) => set('student_gender', e.target.value as StudentGender)}
          >
            <option value="unknown">未知</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div>
          <label className="f-label" htmlFor="gf-district">区县 * / DISTRICT</label>
          <select
            id="gf-district"
            className="input block-input"
            value={values.district}
            onChange={(e) => set('district', e.target.value as District)}
            aria-required="true"
          >
            <option value="" disabled>请选择区县</option>
            {(Object.keys(DISTRICT_LABEL) as District[]).map((d) => (
              <option key={d} value={d}>
                {DISTRICT_LABEL[d]}
              </option>
            ))}
          </select>
          {fieldError('district')}
        </div>
        <div>
          <label className="f-label" htmlFor="gf-region">详细地点 * / PLACE</label>
          <input
            id="gf-region"
            className="input block-input"
            type="text"
            maxLength={40}
            placeholder="如：梅溪湖壹号（不重复区名）"
            value={values.region}
            onChange={(e) => set('region', e.target.value)}
            aria-required="true"
          />
          {fieldError('region')}
        </div>
      </div>

      <label className="f-label" htmlFor="gf-student-info">学员情况 * / STUDENT</label>
      <textarea
        id="gf-student-info"
        className="input block-input"
        rows={3}
        maxLength={500}
        placeholder="分数、基础、性格等（≤500 字）"
        value={values.student_info}
        onChange={(e) => set('student_info', e.target.value)}
        aria-required="true"
      />
      {fieldError('student_info')}

      <div className="form-grid">
        <div>
          <label className="f-label" htmlFor="gf-rate">时薪（元/小时）/ RATE</label>
          <input
            id="gf-rate"
            className="input block-input"
            type="number"
            min={0}
            max={10000}
            step={1}
            inputMode="numeric"
            placeholder="如：80"
            value={values.hourlyRateStr}
            disabled={values.negotiable}
            onChange={(e) => set('hourlyRateStr', e.target.value)}
          />
          {fieldError('hourly_rate')}
          <label className="f-check" htmlFor="gf-negotiable">
            <input
              id="gf-negotiable"
              type="checkbox"
              checked={values.negotiable}
              onChange={(e) => set('negotiable', e.target.checked)}
            />
            面议（不参与价格筛选）
          </label>
        </div>
        <div>
          <label className="f-label" htmlFor="gf-schedule">时间 / SCHEDULE</label>
          <input
            id="gf-schedule"
            className="input block-input"
            type="text"
            maxLength={120}
            placeholder="如：周六全天（可空）"
            value={values.schedule}
            onChange={(e) => set('schedule', e.target.value)}
          />
          {fieldError('schedule')}
        </div>
      </div>

      <label className="f-label" htmlFor="gf-requirements">对老师的要求 * / REQUIREMENTS</label>
      <textarea
        id="gf-requirements"
        className="input block-input"
        rows={5}
        maxLength={2000}
        placeholder="授课频次、经验期望等（≤2000 字）"
        value={values.requirements}
        onChange={(e) => set('requirements', e.target.value)}
        aria-required="true"
      />
      {fieldError('requirements')}

      <label className="f-label" htmlFor="gf-contact">单子专属微信 / CONTACT WXID</label>
      <input
        id="gf-contact"
        className="input block-input"
        type="text"
        maxLength={40}
        placeholder="可空；为空时学生联系站点小助理"
        value={values.contact_wxid}
        onChange={(e) => set('contact_wxid', e.target.value)}
      />
      {fieldError('contact_wxid')}

      {formError && (
        <p className="f-err" role="alert">
          {formError}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '提交中…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
