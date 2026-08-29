// 布局壳（T-M3-1）：AppBackground 装饰层 + 内容滚动区 + 底部 2 Tab + 全局联系弹层。
// 100dvh + safe-area 由 grad-ui.css .app-shell/.tabbar 承担。
// 管理端 4 页共用 AdminGate 登录门（T-M4-1）：嵌套路由使 gate 跨子路由保持挂载，
// 会话恢复/角色确认不在页间来回闪烁。
import { Route, Routes } from 'react-router';
import HomePage from './pages/HomePage';
import GigDetailPage from './pages/GigDetailPage';
import AdminGate from './components/admin/AdminGate';
import AdminPage from './pages/admin/AdminPage';
import AdminGigNewPage from './pages/admin/AdminGigNewPage';
import AdminGigEditPage from './pages/admin/AdminGigEditPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminAccountPage from './pages/admin/AdminAccountPage';
import NotFoundPage from './pages/NotFoundPage';
import AppBackground from './components/AppBackground';
import TabBar from './components/TabBar';
import { ContactProvider } from './components/contact/ContactContext';

export default function App() {
  return (
    <ContactProvider>
      <AppBackground />
      <div className="app-shell">
        <div className="app-scroll">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/gigs/:id" element={<GigDetailPage />} />
            <Route path="/admin" element={<AdminGate />}>
              <Route index element={<AdminPage />} />
              <Route path="gigs/new" element={<AdminGigNewPage />} />
              <Route path="gigs/:id/edit" element={<AdminGigEditPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="account" element={<AdminAccountPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <TabBar />
      </div>
    </ContactProvider>
  );
}
