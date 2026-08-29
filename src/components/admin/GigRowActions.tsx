// 管理列表行内操作（T-M4-2）：状态迁移按钮按状态机只渲染合法目标状态
// （oracle：services/transitions.ts ↔ spec §5.1）；编辑/删除为移植的圆形 icon-btn。
import { Link } from 'react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { allowedTargets, TRANSITION_LABEL } from '../../services/transitions';
import { STATUS_LABEL } from '../../services/labels';
import type { Gig, GigStatus } from '../../services/types';

export interface GigRowActionsProps {
  gig: Gig;
  onTransition: (id: string, to: GigStatus) => void;
  onRequestDelete: (gig: Gig) => void;
  pending?: boolean;
}

export default function GigRowActions({ gig, onTransition, onRequestDelete, pending = false }: GigRowActionsProps) {
  return (
    <div className="t-actions">
      {allowedTargets(gig.status).map((to) => (
        <button
          key={to}
          type="button"
          className="icon-btn"
          disabled={pending}
          aria-label={`标记为${STATUS_LABEL[to]}`}
          onClick={() => onTransition(gig.id, to)}
        >
          {TRANSITION_LABEL[to]}
        </button>
      ))}
      <Link to={`/admin/gigs/${gig.id}/edit`} className="icon-btn" aria-label="编辑单子" title="编辑">
        <Pencil size={14} aria-hidden="true" />
      </Link>
      <button
        type="button"
        className="icon-btn"
        disabled={pending}
        aria-label="删除单子"
        title="删除"
        onClick={() => onRequestDelete(gig)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
