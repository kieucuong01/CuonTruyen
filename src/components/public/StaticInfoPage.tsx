import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';

type StaticPage = {
  heading: string;
  body: string;
  items?: string[];
};

export function StaticInfoPage({ page, jsonLd }: { page: StaticPage; jsonLd?: any }) {
  return (
    <main className="next-shell">
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <header className="next-topbar">
        <Link className="next-brand" href="/">Cuộn Truyện</Link>
      </header>
      <section className="next-static-page">
        <h1>{page.heading}</h1>
        <p className="next-muted">{page.body}</p>
        {Array.isArray(page.items) && page.items.length > 0 && (
          <ul>
            {page.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
