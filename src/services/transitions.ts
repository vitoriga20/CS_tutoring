// 状态机前端映射（oracle：specs/spec.md §5.1 状态机 YAML + 第 5 部分附 P-GIG-01）
// 管理列表操作按钮按此只渲染合法目标状态；服务端 assertTransition 仍是权威校验。
import type { GigStatus } from './types';

/** 每个状态可流转到的目标状态（同值重申不经此入口，UI 不渲染自身按钮） */
const ALLOWED_TARGETS: Record<GigStatus, readonly GigStatus[]> = {
  open: ['matched', 'closed'],
  matched: ['open', 'closed'],
  closed: ['open'],
};

export function allowedTargets(status: GigStatus): readonly GigStatus[] {
  return ALLOWED_TARGETS[status];
}

/** 迁移按钮动作文案（语义=流转到目标状态；完整描述用 STATUS_LABEL） */
export const TRANSITION_LABEL: Record<GigStatus, string> = {
  open: '上架',
  matched: '匹配',
  closed: '关闭',
};
