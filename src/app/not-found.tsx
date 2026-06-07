import type { Metadata } from 'next';
import { StaticInfoPage } from '@/components/public/StaticInfoPage';
import { nextNotFoundPageData } from '@/lib/server/static-pages.mjs';

const page = nextNotFoundPageData();

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  robots: {
    index: false,
    follow: false
  }
};

export default function NotFoundPage() {
  return <StaticInfoPage page={page} />;
}
