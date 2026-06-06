import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT } from './catalogStore.mjs';
import { queryPostgres, usesPostgresStorage } from './postgresStore.mjs';

const EVENTS_PATH = path.join(IMPORT_ROOT, 'analytics-events.jsonl');

export function normalizeAnalyticsEvent(event = {}) {
  return {
    type: event.type || 'event',
    seriesSlug: event.seriesSlug || event.seriesId || '',
    chapterSlug: event.chapterSlug || event.chapterId || '',
    value: Number(event.value || 0),
    placement: event.placement || '',
    slotId: event.slotId || event.adSlotId || '',
    provider: event.provider || event.adProvider || '',
    source: event.source || '',
    url: event.url || '',
    at: event.at || new Date().toISOString()
  };
}

export async function appendAnalyticsEvent(event) {
  const safeEvent = normalizeAnalyticsEvent(event);
  if (usesPostgresStorage()) {
    await queryPostgres(`
      insert into analytics_events (
        type, series_slug, chapter_slug, value, placement, source, url, raw, created_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9
      )
    `, [
      safeEvent.type,
      safeEvent.seriesSlug,
      safeEvent.chapterSlug,
      safeEvent.value,
      safeEvent.placement,
      safeEvent.source,
      safeEvent.url,
      JSON.stringify(safeEvent),
      safeEvent.at
    ]);
    return safeEvent;
  }
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
  await fs.appendFile(EVENTS_PATH, `${JSON.stringify(safeEvent)}\n`);
  return safeEvent;
}

export async function listAnalyticsEvents({ limit = 200 } = {}) {
  if (usesPostgresStorage()) {
    const result = await queryPostgres(`
      select type, series_slug, chapter_slug, value, placement, source, url, raw, created_at
      from analytics_events
      order by created_at desc
      limit $1
    `, [Math.max(1, Number(limit || 200))]);
    return result.rows.map((row) => ({
      ...(row.raw || {}),
      type: row.type,
      seriesSlug: row.series_slug || '',
      chapterSlug: row.chapter_slug || '',
      value: Number(row.value || 0),
      placement: row.placement || '',
      source: row.source || '',
      url: row.url || '',
      at: row.raw?.at || row.created_at?.toISOString?.() || row.created_at
    }));
  }
  try {
    const text = await fs.readFile(EVENTS_PATH, 'utf8');
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return rows.slice(-Math.max(1, Number(limit || 200))).reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function rangeStartDate(range = '30d', now = new Date()) {
  const value = String(range || '30d').trim().toLowerCase();
  if (value === 'all') return null;
  const days = value === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function createMetricRow(series = {}) {
  const stats = series.stats || {};
  return {
    seriesId: series.id || '',
    seriesSlug: series.slug || '',
    title: series.title || series.slug || 'Không rõ truyện',
    views: Number(stats.views || 0),
    adImpressions: Number(stats.adViews || stats.adImpressions || 0),
    adClicks: Number(stats.adClicks || 0),
    donateClicks: Number(stats.donateClicks || 0),
    readDepth: Number(stats.readDepth || 0),
    placements: {}
  };
}

function emptySummary(range) {
  return {
    range,
    totals: {
      views: 0,
      adImpressions: 0,
      adClicks: 0,
      adCtr: 0,
      donateClicks: 0
    },
    topSeries: [],
    placements: {}
  };
}

function incrementMetric(row, event) {
  if (!row) return;
  if (event.type === 'pageview') row.views += 1;
  if (event.type === 'ad_view' || event.type === 'ad_impression') row.adImpressions += 1;
  if (event.type === 'ad_click') row.adClicks += 1;
  if (event.type === 'donate_click') row.donateClicks += 1;
  if (event.type === 'read_depth') row.readDepth = Math.max(row.readDepth, Number(event.value || 0));
}

function incrementPlacement(target, event) {
  const placement = event.placement || 'unknown';
  const current = target[placement] || { placement, adImpressions: 0, adClicks: 0, donateClicks: 0 };
  if (event.type === 'ad_view' || event.type === 'ad_impression') current.adImpressions += 1;
  if (event.type === 'ad_click') current.adClicks += 1;
  if (event.type === 'donate_click') current.donateClicks += 1;
  target[placement] = current;
}

export function buildAnalyticsSummary({ catalog = {}, events = [], range = '30d', now = new Date() } = {}) {
  const summary = emptySummary(range);
  const startDate = rangeStartDate(range, now);
  const seriesRows = new Map();

  for (const series of catalog.series || []) {
    if (!series?.slug) continue;
    seriesRows.set(series.slug, range === 'all' ? createMetricRow(series) : { ...createMetricRow(series), views: 0, adImpressions: 0, adClicks: 0, donateClicks: 0, readDepth: 0 });
  }

  const filteredEvents = (events || []).filter((event) => {
    if (!startDate) return true;
    const date = new Date(event.at || 0);
    return Number.isFinite(date.getTime()) && date >= startDate;
  });

  for (const event of filteredEvents) {
    const slug = event.seriesSlug || '';
    if (!slug && !event.placement) continue;
    if (slug && !seriesRows.has(slug)) {
      seriesRows.set(slug, createMetricRow({ slug, title: slug, stats: {} }));
    }
    const row = slug ? seriesRows.get(slug) : null;
    incrementMetric(row, event);
    if (row) incrementPlacement(row.placements, event);
    incrementPlacement(summary.placements, event);
  }

  const rows = [...seriesRows.values()].map((row) => ({
    ...row,
    adCtr: row.adImpressions ? Number((row.adClicks / row.adImpressions).toFixed(4)) : 0
  }));

  summary.topSeries = rows
    .filter((row) => row.views || row.adImpressions || row.donateClicks || row.adClicks)
    .sort((a, b) => (b.views + b.donateClicks * 20 + b.adImpressions / 10) - (a.views + a.donateClicks * 20 + a.adImpressions / 10))
    .slice(0, 20);

  for (const row of rows) {
    summary.totals.views += row.views;
    summary.totals.adImpressions += row.adImpressions;
    summary.totals.adClicks += row.adClicks;
    summary.totals.donateClicks += row.donateClicks;
  }
  summary.totals.adCtr = summary.totals.adImpressions
    ? Number((summary.totals.adClicks / summary.totals.adImpressions).toFixed(4))
    : 0;

  return summary;
}
