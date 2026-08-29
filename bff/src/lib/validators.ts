// 校验器：签名与规则逐字对齐 specs/spec.md §5.3；必填性/NULL 触发条件见 §5.2
import { HTTPException } from 'hono/http-exception';
import { DISTRICTS, GRADE_LEVELS, GENDERS, MODES, STATUSES, type District, type Gig, type GigStatus, type StudentGender } from '../types';

export interface FieldIssue {
  field: string;
  reason: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; details: FieldIssue[] };

export interface GigCreate {
  title: string;
  subject: string;
  grade_level: Gig['grade_level'];
  mode: Gig['mode'];
  region: string;
  district: District;
  hourly_rate: number | null;
  student_gender: StudentGender;
  student_info: string;
  rate: string | null;
  schedule: string | null;
  requirements: string;
  contact_wxid: string | null;
}

export interface SiteConfigUpdate {
  wxid?: string;
  qr_image_url?: string;
  notice?: string | null;
}

export interface ProfileUpdate {
  wxid?: string | null;
  qr_image_url?: string | null;
}

// 状态机（spec §5.1）：Allowed 表是唯一迁移 oracle；同值重申放行
const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  'open>matched',
  'open>closed',
  'matched>open',
  'matched>closed',
  'closed>open',
]);

export function assertTransition(from: GigStatus, to: GigStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS.has(`${from}>${to}`)) {
    throw new HTTPException(422, {
      res: new Response(JSON.stringify({ error: '非法的状态迁移', code: 'GIG_INVALID_TRANSITION' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    });
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asTrimmed(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null;
}

function checkLen(issues: FieldIssue[], field: string, v: unknown, min: number, max: number): string | null {
  const s = asTrimmed(v);
  if (s === null || s.length < min || s.length > max) {
    issues.push({ field, reason: `长度须在 ${min}..${max}` });
    return null;
  }
  return s;
}

function checkEnum<T extends string>(issues: FieldIssue[], field: string, v: unknown, members: readonly T[]): T | null {
  if (typeof v !== 'string' || !(members as readonly string[]).includes(v)) {
    issues.push({ field, reason: `须为 ${members.join(' | ')} 之一` });
    return null;
  }
  return v as T;
}

// 可空文本（rate/schedule/contact_wxid）：缺省或显式 null → null；字符串 → ≤max
function checkOptionalText(issues: FieldIssue[], field: string, v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max) {
    issues.push({ field, reason: `须为 ≤${max} 字符的字符串或 null` });
    return null;
  }
  return v;
}

function pickGigFields(body: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'title', 'subject', 'grade_level', 'mode', 'region', 'district', 'hourly_rate', 'student_gender',
    'student_info', 'rate', 'schedule', 'requirements', 'contact_wxid', 'status',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

// 实体级校验（POST 与 PATCH 合并后共用）：必填 = title/subject/grade_level/mode/region/district/student_info/requirements
function validateGigEntity(body: Record<string, unknown>): ValidationResult<GigCreate> {
  const issues: FieldIssue[] = [];
  const title = checkLen(issues, 'title', body.title, 1, 60);
  const subject = checkLen(issues, 'subject', body.subject, 1, 40);
  const grade_level = checkEnum(issues, 'grade_level', body.grade_level, GRADE_LEVELS);
  const mode = checkEnum(issues, 'mode', body.mode, MODES);
  const region = checkLen(issues, 'region', body.region, 1, 40);
  // district：必填枚举（spec v0.4.0 §5.2）
  const district = checkEnum(issues, 'district', body.district, DISTRICTS);
  // hourly_rate：可空整数 0..10000（spec v0.4.0 §5.2/§5.3）
  let hourly_rate: number | null = null;
  if (body.hourly_rate !== undefined && body.hourly_rate !== null) {
    const n = body.hourly_rate as unknown;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10000) {
      issues.push({ field: 'hourly_rate', reason: '须为 0..10000 的整数或 null' });
    } else {
      hourly_rate = n;
    }
  }
  // student_gender：缺省或显式 null → unknown（spec §5.2）
  const student_gender: StudentGender =
    body.student_gender === undefined || body.student_gender === null
      ? 'unknown'
      : (checkEnum(issues, 'student_gender', body.student_gender, GENDERS) ?? 'unknown');
  const student_info = checkLen(issues, 'student_info', body.student_info, 1, 500);
  const requirements = checkLen(issues, 'requirements', body.requirements, 1, 2000);
  const rate = checkOptionalText(issues, 'rate', body.rate, 40);
  const schedule = checkOptionalText(issues, 'schedule', body.schedule, 120);
  const contact_wxid = checkOptionalText(issues, 'contact_wxid', body.contact_wxid, 40);

  if (issues.length > 0) return { ok: false, details: issues };
  return {
    ok: true,
    value: {
      title: title as string,
      subject: subject as string,
      grade_level: grade_level as Gig['grade_level'],
      mode: mode as Gig['mode'],
      region: region as string,
      district: district as District,
      hourly_rate,
      student_gender,
      student_info: student_info as string,
      rate,
      schedule,
      requirements: requirements as string,
      contact_wxid,
    },
  };
}

export function validateGigInput(body: unknown): ValidationResult<GigCreate> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: 'body', reason: '须为 JSON 对象' }] };
  }
  return validateGigEntity(pickGigFields(body));
}

// PATCH：对提供的字段逐项校验 + 合并后整体校验（spec §5.2/§5.3）；返回值只含提供的合法字段
export function validateGigPatch(body: unknown, current: Gig): ValidationResult<Partial<GigCreate>> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: 'body', reason: '须为 JSON 对象' }] };
  }
  const provided = pickGigFields(body);
  const issues: FieldIssue[] = [];

  if ('status' in provided) {
    checkEnum(issues, 'status', provided.status, STATUSES);
  }
  if ('student_gender' in provided && provided.student_gender !== null) {
    checkEnum(issues, 'student_gender', provided.student_gender, GENDERS);
  }
  if ('region' in provided && provided.region !== null) {
    const s = asTrimmed(provided.region);
    if (s === null || s.length < 1 || s.length > 40) {
      issues.push({ field: 'region', reason: '长度须在 1..40' });
    }
  }
  if ('district' in provided && provided.district !== null) {
    checkEnum(issues, 'district', provided.district, DISTRICTS);
  }
  if ('hourly_rate' in provided && provided.hourly_rate !== null) {
    const n = provided.hourly_rate;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10000) {
      issues.push({ field: 'hourly_rate', reason: '须为 0..10000 的整数或 null' });
    }
  }
  for (const [field, max] of [
    ['title', 60],
    ['subject', 40],
    ['student_info', 500],
    ['requirements', 2000],
  ] as const) {
    if (field in provided) {
      const s = asTrimmed(provided[field]);
      if (s === null || s.length < 1 || s.length > max) {
        issues.push({ field, reason: `长度须在 1..${max}` });
      }
    }
  }
  for (const [field, max] of [
    ['rate', 40],
    ['schedule', 120],
    ['contact_wxid', 40],
  ] as const) {
    if (field in provided && provided[field] !== null) {
      const v = provided[field];
      if (typeof v !== 'string' || v.length > max) {
        issues.push({ field, reason: `须为 ≤${max} 字符的字符串或 null` });
      }
    }
  }
  if (issues.length > 0) return { ok: false, details: issues };

  // 合并到当前实体后整体校验（必填字段不可被 PATCH 置空）
  const merged: Record<string, unknown> = { ...current, ...provided };
  const entity = validateGigEntity(merged);
  if (!entity.ok) return entity;

  const value: Record<string, unknown> = {};
  const entityValue = entity.value as unknown as Record<string, unknown>;
  for (const k of Object.keys(provided)) {
    // status 不在 GigCreate（实体校验）范围内，从已过枚举校验的原始值透传
    value[k] = k === 'status' ? provided.status : entityValue[k];
  }
  if ('student_gender' in provided && provided.student_gender === null) value.student_gender = 'unknown';
  return { ok: true, value: value as Partial<GigCreate> };
}

export function validateSiteConfigPatch(body: unknown): ValidationResult<SiteConfigUpdate> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: 'body', reason: '须为 JSON 对象' }] };
  }
  const issues: FieldIssue[] = [];
  const value: SiteConfigUpdate = {};

  if ('wxid' in body) {
    const s = asTrimmed(body.wxid);
    if (s === null || s.length < 1 || s.length > 40) {
      issues.push({ field: 'wxid', reason: '长度须在 1..40' });
    } else {
      value.wxid = s;
    }
  }
  if ('qr_image_url' in body) {
    const v = body.qr_image_url;
    if (typeof v !== 'string' || v.length < 1 || v.length > 500 || !v.startsWith('https://')) {
      issues.push({ field: 'qr_image_url', reason: '须为 https:// 开头且 ≤500 字符的字符串' });
    } else {
      value.qr_image_url = v;
    }
  }
  if ('notice' in body) {
    // 空字符串规范化为 null（spec §5.3）
    if (body.notice === null || body.notice === '') {
      value.notice = null;
    } else if (typeof body.notice !== 'string' || body.notice.length > 200) {
      issues.push({ field: 'notice', reason: '须为 ≤200 字符的字符串或 null' });
    } else {
      value.notice = body.notice;
    }
  }
  if (issues.length > 0) return { ok: false, details: issues };
  return { ok: true, value };
}

// PATCH /me（spec §5.3 profile.* 规则）：wxid 显式 null 合法（清空）；qr_image_url 只经上传回写产生，但契约仍允许显式 null
export function validateProfilePatch(body: unknown): ValidationResult<ProfileUpdate> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: 'body', reason: '须为 JSON 对象' }] };
  }
  const issues: FieldIssue[] = [];
  const value: ProfileUpdate = {};

  if ('wxid' in body) {
    if (body.wxid === null) {
      value.wxid = null;
    } else {
      const s = asTrimmed(body.wxid);
      if (s === null || s.length < 1 || s.length > 40) {
        issues.push({ field: 'wxid', reason: '须为 1..40 字符的字符串或 null' });
      } else {
        value.wxid = s;
      }
    }
  }
  if ('qr_image_url' in body) {
    if (body.qr_image_url === null) {
      value.qr_image_url = null;
    } else if (typeof body.qr_image_url !== 'string' || body.qr_image_url.length < 1 || body.qr_image_url.length > 500 || !body.qr_image_url.startsWith('https://')) {
      issues.push({ field: 'qr_image_url', reason: '须为 https:// 开头且 ≤500 字符的字符串或 null' });
    } else {
      value.qr_image_url = body.qr_image_url;
    }
  }
  if (issues.length > 0) return { ok: false, details: issues };
  return { ok: true, value };
}
