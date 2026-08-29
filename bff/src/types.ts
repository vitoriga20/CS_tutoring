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

export type GigStatusFilter = GigStatus | 'all';
