// 领域类型：与 specs/spec.md §1 术语表、specs/gig.schema.json 逐字一致
export type GigStatus = 'open' | 'matched' | 'closed';
export type LessonMode = 'online' | 'offline';
export type GradeLevel = 'primary' | 'junior' | 'senior' | 'college';
export type StudentGender = 'male' | 'female' | 'unknown';
// 长沙区县枚举（spec v0.4.0 §1）：顺序即枚举声明顺序；other 兜底宁乡/浏阳等
export type District = 'wangcheng' | 'kaifu' | 'yuelu' | 'furong' | 'tianxin' | 'yuhua' | 'changsha_county' | 'other';

export const GRADE_LEVELS: readonly GradeLevel[] = ['primary', 'junior', 'senior', 'college'];
export const MODES: readonly LessonMode[] = ['online', 'offline'];
export const STATUSES: readonly GigStatus[] = ['open', 'matched', 'closed'];
export const GENDERS: readonly StudentGender[] = ['male', 'female', 'unknown'];
export const DISTRICTS: readonly District[] = ['wangcheng', 'kaifu', 'yuelu', 'furong', 'tianxin', 'yuhua', 'changsha_county', 'other'];

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

// 列表筛选扩展（spec v0.4.0 §3）：price 档位左开右闭；sort 支持 newest（缺省）| rate_desc（NULL 殿后）
export type PriceFilter = 'le50' | '50-80' | '80-120' | '120-200' | 'gt200';
export type GigSort = 'newest' | 'rate_desc';

// price 档位 → [下限(开), 上限(闭)]；null 表示该侧无界
export const PRICE_BOUNDS: Record<PriceFilter, [number | null, number | null]> = {
  le50: [null, 50],
  '50-80': [50, 80],
  '80-120': [80, 120],
  '120-200': [120, 200],
  gt200: [200, null],
};
export const PRICE_FILTERS: readonly PriceFilter[] = ['le50', '50-80', '80-120', '120-200', 'gt200'];
export const SORTS: readonly GigSort[] = ['newest', 'rate_desc'];
// 性别筛选值：unknown 表示未标注，不可作为筛选值（spec §3）
export const GENDER_FILTERS: readonly StudentGender[] = ['male', 'female'];
