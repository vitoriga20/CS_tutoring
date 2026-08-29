// 全局 404（路由兜底）；详情页单子不存在的 404 文案在 GigDetailPage 内处理（TC-VIEW-006 页面侧）
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70dvh', gap: 14 }}>
      <p className="detail-rate" style={{ fontSize: 56 }}>404</p>
      <p className="muted">页面不存在</p>
      <Link to="/" className="btn">返回首页</Link>
    </main>
  );
}
