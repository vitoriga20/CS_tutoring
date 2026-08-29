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
