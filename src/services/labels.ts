// 枚举 → 中文展示标签（枚举成员以 specs/spec.md §1 为唯一出处，映射只做展示）
import type { GradeLevel, GigStatus, LessonMode, StudentGender } from './types';

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

/** 性别徽标文案；unknown 时不展示（specs/tasks.md T-M3-2） */
export function genderLabel(gender: StudentGender): string | null {
  if (gender === 'male') return '男';
  if (gender === 'female') return '女';
  return null;
}
