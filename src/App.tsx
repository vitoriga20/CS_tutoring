// 路由表：specs/tasks.md T-M0-2 钉死的七条路径；页面在 M3/M4 里程碑填充实现
import { Route, Routes } from 'react-router';
import HomePage from './pages/HomePage';
import GigDetailPage from './pages/GigDetailPage';
import AdminPage from './pages/admin/AdminPage';
import AdminGigNewPage from './pages/admin/AdminGigNewPage';
import AdminGigEditPage from './pages/admin/AdminGigEditPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/gigs/:id" element={<GigDetailPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/gigs/new" element={<AdminGigNewPage />} />
      <Route path="/admin/gigs/:id/edit" element={<AdminGigEditPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
