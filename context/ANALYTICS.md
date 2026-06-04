# Analytics Context

Analytics đã được đơn giản hoá thành một màn hình đối soát event thô theo 3 nhóm dữ liệu:

1. **Data click**: dữ liệu click đã capture, trước đây nằm riêng ở `/click-events`.
2. **CAPI delivery**: các event app/worker đã post tới endpoint Meta/TikTok CAPI.
3. **Postback**: conversion/postback affiliate network gửi về app. UI không dùng label "Conversion attribution" nữa.

Mục tiêu: gọn, dễ debug, dễ đối soát. Không tập trung vào dashboard phân tích nâng cao, funnel, breakdown hoặc report scheduler.

## Route và UI

- Route chính: `/analytics`.
- Route cũ `/click-events` redirect về `/analytics`.
- Sidebar không còn item riêng `Click Events`.
- Menu feature `click-events` được bỏ khỏi seed active/core; data click nằm trong feature `analytics`.
- Trang docs trỏ nút kiểm tra click về `/analytics`.

File UI chính:

- `apps/web/src/features/analytics/AnalyticsPage.tsx`
- `apps/web/src/app/DashboardLayout.tsx`
- `apps/web/src/app/DashboardRoutes.tsx`
- `apps/web/src/config/navigation.ts`

## 1. Data click

### Nguồn dữ liệu

Bảng: `ClickEvent`.

Nguồn tạo click:

- Redirect service: `apps/redirect/src/server.ts`, route `GET /:slug/:tenantKey`.
- Tracking script endpoint: `apps/api/src/server.ts`, route `POST /atp/events` với event `AffiliateClick`/`click`.

API đọc dữ liệu:

```http
GET /click-events
```

Frontend `/analytics` load endpoint này với pagination khi đang ở route analytics.

### Field hiển thị trong UI

Bảng **Data click** hiển thị:

- Created time.
- Tracking link slug.
- Campaign id nếu có.
- Offer/brand name nếu có.
- Affiliate platform/network nếu có.
- Click UUID.
- Signal ưu tiên `fbclid`, sau đó `ttclid`, sau đó referrer.
- IP.

### Vai trò

Data click dùng để:

- Xác nhận app đã capture được click.
- Kiểm tra `clickUuid` đã được tạo và append sang affiliate URL.
- Là dữ liệu nền để match với postback qua `clickUuid`.
- Là nguồn cho worker tạo CAPI delivery jobs.

## 2. CAPI delivery

### Nguồn dữ liệu

Bảng: `CapiEvent`.

Nguồn tạo/gửi:

- BullMQ job `click.created`.
- Worker: `apps/worker/src/worker.ts`.

Worker load click, lấy active datasets của campaign, build payload Meta/TikTok rồi post tới endpoint CAPI.

API đọc dữ liệu:

```http
GET /capi-events
```

CSV export:

```http
GET /analytics/export.csv?type=capi
```

### Field hiển thị trong UI

Bảng **CAPI delivery** hiển thị:

- Platform: `META` hoặc `TIKTOK`.
- Event name.
- Source: `click`, `affiliate_conversion`, `tracking_script`.
- Source id nếu có.
- Click: tracking link slug hoặc click UUID.
- Status: `PENDING`, `PROCESSING`, `DELIVERED`, `FAILED`.
- Attempts.
- Error gần nhất.
- Created time.

### Ý nghĩa status

- `PROCESSING`: worker đang xử lý/gửi.
- `DELIVERED`: đã post thành công hoặc dry-run thành công.
- `FAILED`: post thất bại, có `lastError`.

Lưu ý:

- `CAPI_DRY_RUN` mặc định bật. Chỉ gửi thật khi `CAPI_DRY_RUN=false`.
- Payload request/response được lưu trong `CapiEvent.payload` để debug.

## 3. Postback

### Nguồn dữ liệu

Bảng: `AffiliateConversionEvent`.

Nguồn tạo:

```http
GET/POST /affiliate-webhooks/:tenantKey/:platformSlug
```

API đọc dữ liệu:

```http
GET /conversion-events
```

CSV export:

```http
GET /analytics/export.csv?type=conversions
```

### Tên gọi UI

UI gọi phần này là **Postback**.

Không dùng label cũ:

- `Conversion attribution`
- `affiliate/EAPI conversions`

Mục tiêu là diễn đạt đúng bản chất: network gửi postback về app.

### Field hiển thị trong UI

Bảng **Postback** hiển thị:

- Network.
- Event name.
- Click UUID từ payload.
- Matched click:
  - `Matched` nếu app tìm được click theo `tenantId + clickUuid` hoặc snapshot cho thấy đã match.
  - `Unmatched` nếu không match được click.
- Amount: ưu tiên payout, commission, rồi spend.
- Requests: `requestCount` và prefix idempotency key.
- Method: GET/POST.
- Created time.

### Vai trò

Postback dùng để:

- Xác nhận affiliate network đã gửi event về app.
- Kiểm tra event name/mapping.
- Kiểm tra click UUID có match với click đã capture không.
- Trigger CAPI jobs có source `affiliate_conversion` nếu postback mới và match được click.

## Filter chung

`/analytics` dùng `EventFiltersForm`, áp dụng chung cho 3 bảng:

- Search.
- Start date.
- End date.
- Campaign.
- Tracking link.
- Affiliate platform.
- CAPI status.

Lưu ý:

- `status` chỉ ảnh hưởng CAPI delivery.
- Date filter áp dụng theo `createdAt` của từng bảng riêng:
  - `ClickEvent.createdAt` cho data click.
  - `CapiEvent.createdAt` cho CAPI delivery.
  - `AffiliateConversionEvent.createdAt` cho postback.
- Conversion/postback filter theo campaign/tracking link cần resolve qua matching click UUIDs trong API.

## Export CSV

UI hiện có 3 nút export:

| Button | Query |
| --- | --- |
| Data click CSV | `/analytics/export.csv?type=clicks` |
| CAPI delivery CSV | `/analytics/export.csv?type=capi` |
| Postback CSV | `/analytics/export.csv?type=conversions` |

`breakdown` export không còn nằm trong UI đơn giản mới.

## Data loading frontend

Trong `DashboardLayout.tsx`:

- Khi route là `/analytics`, frontend load:
  - `/analytics/breakdown` để lấy summary CAPI delivered/failed và giữ compatibility với dashboard.
  - `/click-events` để hiển thị Data click.
  - `/capi-events` để hiển thị CAPI delivery.
  - `/conversion-events` để hiển thị Postback.
- Pagination page size: `eventPageSize = 25`.
- Apply filter reset page về 1 cho cả click/CAPI/postback.

## Những phần đã bỏ khỏi UI Analytics đơn giản

Các phần này vẫn có code backend/type cũ nhưng không còn hiển thị trong `AnalyticsPage`:

- Funnel chart.
- Period comparison.
- Breakdown by campaign.
- Breakdown by tracking link/offer.
- Breakdown by affiliate platform.
- Breakdown by day.
- Report scheduler panel.
- Stat revenue/conversion/attribution cards.

Nếu cần dùng lại dashboard phân tích nâng cao sau này, có thể tạo route/page riêng như `/reports` hoặc `/performance`.

## Ghi nhớ tên gọi

Tên nên dùng trong UI/document:

- **Data click**: click đã capture.
- **CAPI delivery**: event đã/đang post tới Meta/TikTok endpoint.
- **Postback**: affiliate network gửi event/conversion về app.

Tên nên tránh ở UI đơn giản hiện tại:

- `Conversion attribution`.
- `affiliate/EAPI conversions`.
- `Funnel`.
- `Breakdown`.
