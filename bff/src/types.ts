// 领域类型：与 specs/spec.md §1 术语表、specs/gig.schema.json 逐字一致
export type GigStatus = 'open' | 'matched' | 'closed';
export type LessonMode = 'online' | 'offline';
export type GradeLevel = 'primary' | 'junior' | 'senior' | 'college';
export type StudentGender = 'male' | 'female' | 'unknown';

export const GRADE_LEVELS: readonly GradeLevel[] = ['primary', 'junior', 'senior', 'college'];
export const MODES: readonly LessonMode[] = ['online', 'offline'];
export const STATUSES: readonly GigStatus[] = ['open', 'matched', 'closed'];
export const GENDERS: readonly StudentGender[] = ['male', 'female', 'unknown'];

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

// 账号级联系资料（profiles 行，v0.3.0）；GET/PATCH /me 与 GigDetail.publisher_contact 用
export type ProfileRole = 'admin' | 'free';

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

// 发布者联系资料投影（不暴露 role 等非联系字段）
export interface PublisherContact {
  wxid: string | null;
  qr_image_url: string | null;
}

export interface GigDetail extends Gig {
  publisher_contact: PublisherContact;
}

export type GigStatusFilter = GigStatus | 'all';
