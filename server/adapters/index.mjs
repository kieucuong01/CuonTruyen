import { manhuarockAdapter } from './manhuarock.mjs';
import { truyenqqAdapter } from './truyenqq.mjs';

const adapters = [truyenqqAdapter, manhuarockAdapter];

export function getAdapterForUrl(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return adapters.find((adapter) => adapter.hostnames.some((host) => hostname === host || hostname.endsWith(`.${host}`)))
    || manhuarockAdapter;
}
