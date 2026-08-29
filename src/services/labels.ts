// 枚举 → 中文展示标签（枚举成员以 specs/spec.md §1 为唯一出处，映射只做展示）
import type { District, GradeLevel, GigSort, GigStatus, LessonMode, PriceFilter, StudentGender } from './types';

export const GRADE_LABEL: Record<GradeLevel, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  college: '大学',
};

export const MODE_LABEL: Record<LessonMode, string> = {
  online: '线上',
  offline: '线下',
};

export const STATUS_LABEL: Record<GigStatus, string> = {
  open: '招募中',
  matched: '已匹配',
  closed: '已关闭',
};

/** 区县展示标签（v0.4.0） */
export const DISTRICT_LABEL: Record<District, string> = {
  wangcheng: '望城区',
  kaifu: '开福区',
  yuelu: '岳麓区',
  furong: '芙蓉区',
  tianxin: '天心区',
  yuhua: '雨花区',
  changsha_county: '长沙县',
  other: '其他',
};

/** 价格档位标签（v0.4.0，左开右闭：(50,80] 等） */
export const PRICE_LABEL: Record<PriceFilter, string> = {
  le50: '≤50',
  '50-80': '51-80',
  '80-120': '81-120',
  '120-200': '121-200',
  gt200: '200+',
};

/** 排序标签（v0.4.0） */
export const SORT_LABEL: Record<GigSort, string> = {
  newest: '最新发布',
  rate_desc: '时薪优先',
};

/** 热门科目 chips（v0.4.0；列表页点选即筛，自定义输入保留） */
export const SUBJECT_OPTIONS = ['数学', '英语', '物理', '化学', '语文', '生物', '编程'];

/** 性别徽标文案；unknown 时不展示（specs/tasks.md T-M3-2） */
export function genderLabel(gender: StudentGender): string | null {
  if (gender === 'male') return '男';
  if (gender === 'female') return '女';
  return null;
}
