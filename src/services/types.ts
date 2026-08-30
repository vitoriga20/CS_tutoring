// 领域类型：字段名与枚举逐字对齐 specs/spec.md §1 术语表与 specs/openapi.yaml，禁止自创成员
export type GigStatus = 'open' | 'matched' | 'closed';
export type LessonMode = 'online' | 'offline';
export type GradeLevel = 'primary' | 'junior' | 'senior' | 'college';
export type StudentGender = 'male' | 'female' | 'unknown';
export type ProfileRole = 'admin' | 'free';
// 长沙区县枚举（spec v0.4.0 §1）：other 兜底宁乡/浏阳等
export type District = 'wangcheng' | 'kaifu' | 'yuelu' | 'furong' | 'tianxin' | 'yuhua' | 'changsha_county' | 'other';
// 列表筛选（spec v0.4.0 §3）
export type PriceFilter = 'le50' | '50-80' | '80-120' | '120-200' | 'gt200';
export type GigSort = 'newest' | 'rate_desc';

// 字段级问题（批量导入 SPEC-002 与错误响应 details 共用；specs/gig-import/spec.md §1）
export interface FieldIssue {
  field: string;
  reason: string;
}

export interface Gig {
  id: string;
  title: string;
  subject: string;
  grade_level: GradeLevel;
  mode: LessonMode;
  region: string;
  district: District;
  hourly_rate: number | null;
  student_gender: StudentGender;
  student_info: string;
  rate: string | null;
  schedule: string | null;
  requirements: string;
  contact_wxid: string | null;
  status: GigStatus;
  published_by: string;
  created_at: string;
  updated_at: string;
}

export interface SiteConfig {
  wxid: string;
  qr_image_url: string;
  notice: string | null;
}

// 发布者账号级联系资料（GET /gigs/:id 随详情返回，spec v0.3.0 §3）
export interface PublisherContact {
  wxid: string | null;
  qr_image_url: string | null;
}

export interface GigDetail extends Gig {
  publisher_contact: PublisherContact;
}

// 当前登录账号资料（GET/PATCH /me，用户中心数据源）
export interface Profile {
  id: string;
  role: ProfileRole;
  display_name: string | null;
  avatar_url: string | null;
  wxid: string | null;
  qr_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GigListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Page<T> {
  data: T[];
  meta: GigListMeta;
}

// ── 批量导入（SPEC-002，specs/gig-import/spec.md §3） ─────────────
// 导入草稿：字段可能缺失（null），与 GigCreate 字段集一致
export interface GigImportDraft {
  title: string | null;
  subject: string | null;
  grade_level: GradeLevel | null;
  mode: LessonMode;
  region: string | null;
  district: District;
  hourly_rate: number | null;
  student_gender: StudentGender;
  student_info: string | null;
  rate: string | null;
  schedule: string | null;
  requirements: string | null;
  contact_wxid: string | null;
}

// 疑似重复匹配信号（SPEC-003，specs/import-dedup/spec.md §5.1 信号池）
export type MatchSignal = 'grade_level' | 'subject' | 'district' | 'hourly_rate' | 'student_gender' | 'region';

// 疑似重复的库中 open 单子（SPEC-003 §3.1；匹配器在 BFF 服务端计算，裁决为前端会话态不入库）
export interface ImportSuspect {
  gig: Gig;
  score: number;
  hard: boolean;
  matched: MatchSignal[];
}

export interface GigImportRow {
  index: number;
  draft: GigImportDraft;
  issues: FieldIssue[];
  duplicate: boolean;
  status: 'ok' | 'error';
  // SPEC-003 追加（向后兼容可空）：duplicate=false 且与库中 open 单子宽松匹配命中时非空
  suspect?: ImportSuspect | null;
}

export interface GigImportCommitResult {
  created: Gig[];
  // v0.2.0（SPEC-003「更新单子」裁决）：更新成功的库中旧单
  updated: Gig[];
  // kind：v0.2.0 区分 insert（缺省，index=rows 数组下标）/ update（index=updates 数组下标）
  failed: { index: number; kind?: 'insert' | 'update'; code: string; details: FieldIssue[] }[];
}
