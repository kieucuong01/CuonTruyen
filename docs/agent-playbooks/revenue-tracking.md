# Revenue tracking and ads

Cuon Truyen supports lightweight public ads plus donate tracking. Admin routes never show ads by default.

## Ad placements

Only these public placements should render ads:

- `home`: one light slot near the home support panel.
- `series`: one light slot on a series detail page.
- `chapter-end`: one slot after a chapter's images/actions, never between reader images.

Do not insert ads in the middle of comic page images.

## AdSense environment

Set these env vars on Vercel/local production builds:

```powershell
ADS_ENABLED=true
ADS_PROVIDER=adsense
ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
ADSENSE_SLOT_HOME=1234567890
ADSENSE_SLOT_SERIES=1234567891
ADSENSE_SLOT_CHAPTER_END=1234567892
```

Optional local test mode:

```powershell
ADSENSE_TEST_MODE=true
```

If `ADSENSE_CLIENT` or the placement slot is missing, the slot is not rendered. This avoids fake ad placeholders and blank reader gaps.

## Tracking

Frontend events:

- `ad_impression`: sent after a real ad slot is at least 50% visible for about 800ms.
- `donate_click`: sent with placement `home`, `series`, `reader`, or `reader-menu`.
- `ad_click`: reserved for first-party/manual ad units. Do not try to track clicks inside AdSense iframes.

Admin dashboard endpoint:

```text
GET /api/admin/analytics/summary?range=7d
GET /api/admin/analytics/summary?range=30d
GET /api/admin/analytics/summary?range=all
```

Dashboard metrics:

- Views
- Ad impressions
- Internal ad CTR
- Donate clicks
- Top series by engagement

AdSense revenue and AdSense click reports remain the source of truth inside Google AdSense.
