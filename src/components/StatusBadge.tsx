// 状态徽标（学生端详情页与管理端列表共用；色档映射与 T-M3-3 一致）
import { STATUS_LABEL } from '../services/labels';
import type { GigStatus } from '../services/types';

export default function StatusBadge({ status }: { status: GigStatus }) {
  const cls = status === 'open' ? 'tag tag-open' : status === 'matched' ? 'tag medium' : 'tag high';
  return <span className={cls}>{STATUS_LABEL[status]}</span>;
}
