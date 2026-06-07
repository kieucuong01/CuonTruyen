import type { Metadata } from 'next';
import { AdminDashboardIsland } from '@/components/admin/AdminDashboardIsland';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Admin - Cuộn Truyện',
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminPage() {
  return <AdminDashboardIsland />;
}
