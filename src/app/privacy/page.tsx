import type { Metadata } from 'next';
import { StaticInfoPage } from '@/components/public/StaticInfoPage';
import { staticPageJsonLd } from '@/lib/server/next-json-ld.mjs';
import { nextStaticPageData } from '@/lib/server/static-pages.mjs';
import { absoluteSiteUrl, siteBaseUrl } from '@/lib/shared/urls';

export const dynamic = 'force-static';

const page = nextStaticPageData('/privacy')!;
const jsonLd = staticPageJsonLd(page, siteBaseUrl());

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: absoluteSiteUrl(page.path) },
  openGraph: {
    title: page.title,
    description: page.description,
    url: absoluteSiteUrl(page.path)
  },
  twitter: {
    card: 'summary',
    title: page.title,
    description: page.description
  }
};

export default function PrivacyPage() {
  return <StaticInfoPage page={page} jsonLd={jsonLd} />;
}
