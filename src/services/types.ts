// 领域类型：字段名与枚举逐字对齐 specs/spec.md §1 术语表与 specs/openapi.yaml，禁止自创成员
export type GigStatus = 'open' | 'matched' | 'closed';
export type LessonMode = 'online' | 'offline';
export type GradeLevel = 'primary' | 'junior' | 'senior' | 'college';
export type StudentGender = 'male' | 'female' | 'unknown';
export type ProfileRole = 'admin' | 'free';

export interface Gig {
  id: string;
  title: string;
  subject: string;
  grade_level: GradeLevel;
  mode: LessonMode;
  region: string;
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

export interface GigListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Page<T> {
  data: T[];
  meta: GigListMeta;
}
