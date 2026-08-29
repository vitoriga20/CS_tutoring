// 单子卡片（T-M3-2）：移植的 grad .task-item 切角卡片行；
// 内容按 tasks.md：区域、性别徽标（仅 male/female 显示）、报酬与时段。
import { Link } from 'react-router';
import { DISTRICT_LABEL, GRADE_LABEL, MODE_LABEL, genderLabel } from '../services/labels';
import type { Gig } from '../services/types';

export default function GigCard({ gig }: { gig: Gig }) {
  const gender = genderLabel(gig.student_gender);
  return (
    <Link to={`/gigs/${gig.id}`} className="task-item" style={{ textDecoration: 'none' }}>
      <div className="t-main">
        <p className="t-title">{gig.title}</p>
        <div className="t-meta">
          <span className="tag">{GRADE_LABEL[gig.grade_level]}</span>
          <span className="tag status">{MODE_LABEL[gig.mode]}</span>
          <span className="tag status">{DISTRICT_LABEL[gig.district]}</span>
          <span className="tag">{gig.region}</span>
          {gender && <span className="tag medium">{gender}</span>}
          <span className="tag low">{gig.subject}</span>
        </div>
        {gig.schedule && <p className="t-subs" style={{ marginTop: 8 }}>时段：{gig.schedule}</p>}
      </div>
      {gig.rate && <span className="detail-rate">{gig.rate}</span>}
    </Link>
  );
}
