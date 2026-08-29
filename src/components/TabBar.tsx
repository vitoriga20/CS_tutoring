// 底部 2 Tab 布局壳（T-M3-1；2026-08-29 用户调整：移除「联系」Tab，联系入口收敛到单子详情页）。
// 素材库无移动端 Tab 组件，样式为 M3 新增（grad-ui.css，令牌取值）。
import { NavLink, useLocation } from 'react-router';
import { List, Shield } from 'lucide-react';

export default function TabBar() {
  const { pathname } = useLocation();
  // 单子 Tab 覆盖学生端两级路由；管理 Tab 覆盖 /admin/*
  const gigsActive = pathname === '/' || pathname.startsWith('/gigs/');
  const adminActive = pathname.startsWith('/admin');

  return (
    <nav className="tabbar" aria-label="主导航">
      <NavLink to="/" className={`tabbar__item${gigsActive ? ' active' : ''}`} aria-current={gigsActive ? 'page' : undefined}>
        <List size={20} aria-hidden="true" />
        <span>单子</span>
        <i className="tabbar__ind" aria-hidden="true" />
      </NavLink>
      <NavLink to="/admin" className={`tabbar__item${adminActive ? ' active' : ''}`} aria-current={adminActive ? 'page' : undefined}>
        <Shield size={20} aria-hidden="true" />
        <span>管理</span>
        <i className="tabbar__ind" aria-hidden="true" />
      </NavLink>
    </nav>
  );
}
