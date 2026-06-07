import type { Metadata } from 'next';
import { AdminSeriesEditorIsland } from '@/components/admin/AdminSeriesEditorIsland';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Quản lý truyện - Cuộn Truyện',
  robots: {
    index: false,
    follow: false
  }
};

export default async function AdminSeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  return <AdminSeriesEditorIsland seriesId={seriesId} />;
}
