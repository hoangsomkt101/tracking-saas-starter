# Impact Event Trigger Context

Tài liệu này mô tả riêng luồng trigger gửi sự kiện khi hệ thống nhận postback từ Impact.

## Phạm vi

- Affiliate platform: `Impact`.
- Endpoint nhận postback: `GET/POST /affiliate-webhooks/:tenantKey/:platformSlug`.
- Platform slug hiện dùng để match Impact thường là `impact`.
- Tracking param mặc định của Impact: `subid1`.
- Event được gửi tiếp qua worker tới dataset của campaign: Meta CAPI hoặc TikTok Events API.

## Nguồn code liên quan

- `apps/api/src/server.ts`
  - Nhận affiliate webhook.
  - Nhận diện payload Impact.
  - Map event Impact thành `CompleteRegistration` hoặc `Purchase`.
  - Bổ sung trigger custom event riêng cho Impact: `Payout` và event theo `ActionTrackerName`.
  - Lưu `AffiliateConversionEvent`.
  - Enqueue job CAPI/EAPI khi match được click.
- `apps/worker/src/worker.ts`
  - Xử lý queue `click-events`.
  - Build payload Meta/TikTok.
  - Gửi event tới dataset active trong campaign.
- `packages/shared/src/index.ts`
  - Định nghĩa Impact là supported affiliate platform.
- `apps/redirect/src/server.ts`
  - Tạo click ban đầu và gắn `subid1={clickUuid}` vào affiliate URL.

## Điều kiện để nhận diện payload Impact

Hàm hiện tại: `isImpactPostbackPayload(payload)`.

Payload được xem là Impact nếu thỏa một trong các nhóm dấu hiệu sau:

1. `userAgent` hoặc `user_agent` chứa chuỗi `impact-postback-client`; hoặc
2. Có dấu hiệu tracker Impact:
   - `ActionTrackerId`
   - `ActionTrackerName`
   - `RefClickId`

và đồng thời có ít nhất một trong hai nhóm:

- Dữ liệu tiền:
  - `Amount`
  - `Payout`
  - `amount`
  - `payout`
- Dữ liệu click:
  - `SubId1`
  - `subid1`

## Click UUID / attribution

Impact click UUID được lấy từ payload bằng `extractClickUuid(...)`.

Các field được scan gồm:

- `clickUuid`
- `click_uuid`
- `click_id`
- `subid`
- `sub_id`
- `subid1`
- `sid`
- `sid1`
- `fp_sid`
- tracking param stored của platform, với Impact mặc định là `subid1`

Với Impact, luồng redirect/script trước đó sẽ gắn `clickUuid` vào affiliate URL bằng query param `subid1`.

Ví dụ:

```txt
https://impact-offer.example/path?subid1=<clickUuid>
```

Khi postback về, nếu payload có `SubId1` hoặc `subid1` trùng `ClickEvent.clickUuid`, hệ thống sẽ match được click và biết campaign/dataset cần gửi CAPI/EAPI.

## Mapping event riêng cho Impact

Impact có 2 nhóm event trigger:

1. Event conversion chính: `CompleteRegistration` hoặc `Purchase`.
2. Custom event bổ sung: `Payout` và event theo `ActionTrackerName`.

### Event conversion chính

Hàm hiện tại: `getImpactEventMatch(payload)`.

Logic:

| Điều kiện Impact payload | Event gửi đi |
| --- | --- |
| `Amount = 0` và `Payout = 0` | `CompleteRegistration` |
| `Amount != 0` hoặc `Payout != 0` | `Purchase` |

Chi tiết metadata mapping được lưu:

- `eventRule`
  - `Impact Amount/Payout both 0`
  - hoặc `Impact Amount/Payout non-zero`
- `eventMatchedField`: `Amount, Payout`
- `eventMatchedValue`: ví dụ `Amount=0; Payout=0`

Nếu platform là Impact nhưng payload không đủ dấu hiệu Impact để match rule trên, hệ thống fallback về `defaultEventName` của platform. Mặc định hiện tại là `CompleteRegistration`.

### Custom event `Payout`

Nếu Impact payload có `Payout > 0`, hệ thống phải gửi thêm một custom event có `eventName = "Payout"`.

Lưu ý xử lý dữ liệu:

- `Payout` từ Impact thường là string.
- Phải ép/parse sang number trước khi so sánh.
- Ví dụ:
  - `"10"` → `10` → gửi `Payout`.
  - `"10.50"` → `10.5` → gửi `Payout`.
  - `"0"`, `"0.00"`, rỗng hoặc parse không ra số → không gửi `Payout`.

Custom event `Payout` dùng lại data attribution/click của click trước đó:

- `clickUuid`
- `clickEventId`
- `tenantId`
- `trackingLinkId`
- campaign/dataset gắn với click

Custom event này không thay thế và không ảnh hưởng tới `CompleteRegistration` hoặc `Purchase`. Nếu điều kiện event conversion chính đúng, hệ thống vẫn gửi event conversion chính bình thường và gửi thêm `Payout` khi `Payout > 0`.

### Custom event theo `ActionTrackerName`

Mọi postback từ Impact phải gửi thêm một custom event có `eventName` lấy từ field `ActionTrackerName` trong payload.

Ví dụ:

```json
{
  "ActionTrackerName": "Install",
  "SubId1": "click_uuid_123"
}
```

Sẽ trigger custom event:

```json
{
  "eventName": "Install",
  "clickUuid": "click_uuid_123",
  "value": "Amount"
}
```

`value` của custom event theo `ActionTrackerName` phải lấy từ `Amount` trong payload Impact. `Amount` thường có thể là string nên cần parse/ép về number trước khi gửi vào CAPI/EAPI.

Custom event này cũng dùng lại data attribution/click của click trước đó:

- `clickUuid`
- `clickEventId`
- `tenantId`
- `trackingLinkId`
- campaign/dataset gắn với click

Nếu `ActionTrackerName` rỗng hoặc không tồn tại thì không tạo custom event theo `ActionTrackerName`.

## Trigger gửi CAPI/EAPI sau postback Impact

Khi Impact postback về endpoint webhook, hệ thống thực hiện:

1. Tìm `AffiliatePlatform` theo:
   - `platformSlug`
   - `tenantKey` là `Tenant.id` hoặc `Tenant.publicKey`
2. Normalize/sanitize payload.
3. Extract `clickUuid` từ `SubId1/subid1` hoặc field tương đương.
4. Resolve event conversion chính theo Impact rule:
   - `CompleteRegistration`
   - hoặc `Purchase`
5. Resolve các custom event bổ sung:
   - `Payout` nếu `Number(Payout) > 0` sau khi parse string về number.
   - Giá trị `ActionTrackerName` cho mọi Impact postback có `ActionTrackerName` hợp lệ; event này dùng `value = Number(Amount)` sau khi parse string về number.
6. Tạo hoặc update `AffiliateConversionEvent` theo idempotency key.
7. Tìm `ClickEvent` theo `tenantId + clickUuid`.
8. Chỉ khi tất cả điều kiện sau đúng thì mới enqueue gửi CAPI/EAPI:
   - Conversion không phải duplicate.
   - Match được `ClickEvent`.
   - Conversion đã được tạo thành công.
9. Worker nhận job và gửi từng event tới tất cả dataset active trong campaign của click.

Danh sách event cần enqueue cho một postback Impact mới:

```ts
const impactEventsToSend = [
  eventMatch.eventName,              // CompleteRegistration hoặc Purchase
  payoutNumber > 0 ? 'Payout' : null,
  actionTrackerName || null
].filter(Boolean)
```

Mỗi event trong danh sách trên cần được enqueue riêng để worker tạo/gửi CAPI/EAPI riêng theo `eventName` đó.

## Những event hệ thống tạo ra khi Impact postback

### 1. AffiliateConversionEvent

Luôn được tạo mới nếu chưa duplicate và chưa vượt billing limit EAPI.

Các field đáng chú ý:

- `tenantId`
- `affiliatePlatformId`
- `clickEventId` nếu match được click
- `clickUuid`
- `eventName`: `CompleteRegistration` hoặc `Purchase`
- `eventRule`
- `eventMatchedField`
- `eventMatchedValue`
- `payoutAmount`
- `commissionAmount`
- `spendAmount`
- `currency`
- `rawPayload`
- `capiEnrichment`
- `attributionSnapshot`
- `receivedMethod`: `GET` hoặc `POST`
- `idempotencyKey`
- `requestCount`

### 2. Queue job `click.created`

Chỉ được tạo nếu postback Impact match được click và không duplicate.

Một postback Impact mới có thể tạo nhiều queue job, mỗi job cho một event name:

- Event conversion chính: `CompleteRegistration` hoặc `Purchase`.
- Custom event `Payout` nếu `Payout > 0` sau khi parse sang number.
- Custom event có `eventName = ActionTrackerName` nếu payload có `ActionTrackerName` hợp lệ.

Job data:

```json
{
  "clickEventId": "<clickEvent.id>",
  "clickUuid": "<clickUuid>",
  "tenantId": "<tenantId>",
  "trackingLinkId": "<trackingLinkId>",
  "eventName": "CompleteRegistration hoặc Purchase hoặc Payout hoặc <ActionTrackerName>",
  "source": "affiliate_conversion",
  "sourceId": "<AffiliateConversionEvent.id>"
}
```

### 3. CapiEvent

Worker tạo/gửi `CapiEvent` cho từng dataset active trong campaign gắn với click.

Event name gửi đi chính là từng event Impact đã resolve:

- `CompleteRegistration`
- hoặc `Purchase`
- `Payout` nếu `Payout > 0`
- giá trị `ActionTrackerName` nếu có

Với dataset:

- `meta` → gửi Meta CAPI payload với `event_name`.
- `tiktok` → gửi TikTok Events API payload với `event`.

Uniqueness của CAPI event dựa trên:

- `clickEventId`
- `datasetId`
- `eventName`
- `source`
- `sourceId`

Vì `sourceId` là conversion id, mỗi conversion Impact mới có thể tạo event CAPI riêng. Với cùng một conversion id, mỗi event name (`CompleteRegistration`/`Purchase`, `Payout`, `ActionTrackerName`) là một `CapiEvent` riêng. Duplicate postback cùng idempotency key không enqueue lại.

### 4. ActivityLog

API ghi log:

- `affiliate_conversion.received` khi conversion mới.
- `affiliate_conversion.duplicate` khi postback duplicate.

Worker ghi log:

- `capi.delivered` nếu gửi thành công.
- `capi.failed` nếu gửi thất bại.

## CAPI enrichment riêng cho Impact

Hàm hiện tại: `getImpactCapiValue(payload)` và `buildCapiEnrichment(...)`.

Với event conversion chính (`CompleteRegistration`/`Purchase`) và custom event `Payout`, `value` ưu tiên:

1. `Payout` khác `0`; nếu không có thì
2. `Amount` khác `0`; nếu không có thì
3. fallback về `Payout`; nếu không có thì
4. fallback về `Amount`.

Với custom event theo `ActionTrackerName`, `value` phải lấy từ `Amount` trong payload Impact:

1. Parse `Amount` từ string/number sang number.
2. Gửi `value = parsed Amount` cho event có `eventName = ActionTrackerName`.
3. Nếu `Amount=0`, value gửi là `0`.
4. Nếu không parse được `Amount`, bỏ `value` hoặc fallback theo logic an toàn hiện có.

Nếu `Amount=0` và `Payout=0`, value gửi CAPI có thể là `0`.

Các field bổ sung có thể được lấy từ payload để enrich CAPI:

- `currency`
- `contentId/contentIds/productId/sku/offerId`
- `contentName/productName/offerName`
- `orderId/transactionId`
- `customerEmail/email`
- `customerId/userId/externalId`
- `customerPhone/phone`
- `firstName/lastName`
- `city/state/zip/country`
- `eventSourceUrl/pageUrl/url`

## Idempotency / duplicate

Idempotency key được build theo thứ tự ưu tiên:

1. Header `x-idempotency-key` hoặc payload `idempotencyKey/idempotency_key`.
2. Network id như:
   - `conversionId`
   - `transactionId`
   - `orderId`
   - `saleId`
   - `leadId`
   - `eventId`
   - `postbackId`
   - `id`
3. Nếu không có các field trên, dùng hash của payload + `clickUuid` + `eventName`.

Nếu duplicate:

- Update `AffiliateConversionEvent` hiện có.
- Increment `requestCount`.
- Ghi activity log `affiliate_conversion.duplicate`.
- Không enqueue gửi CAPI/EAPI lại.

## Trường hợp không gửi CAPI/EAPI

Impact postback sẽ không trigger gửi CAPI/EAPI nếu:

- Không tìm thấy `AffiliatePlatform` theo `tenantKey + platformSlug`.
- Billing limit EAPI đã vượt khi tạo conversion mới.
- Không extract được `clickUuid` hoặc không match được `ClickEvent` trong tenant.
- Conversion là duplicate.
- Click có campaign nhưng campaign không có dataset active.
- Worker gửi thất bại hoặc bị giới hạn CAPI billing limit.

Riêng custom event:

- Không gửi `Payout` nếu không parse được `Payout` thành number hoặc `Payout <= 0`.
- Không gửi custom event theo `ActionTrackerName` nếu field này rỗng hoặc không tồn tại.

Lưu ý: nếu không match click, hệ thống vẫn có thể lưu `AffiliateConversionEvent` và `ActivityLog`, nhưng không gửi CAPI/EAPI vì không biết campaign/dataset nào cần nhận event.

## Quan hệ với event trước postback

Trước khi Impact postback về, click có thể đã tạo event khác:

- Redirect shortlink hoặc tracking script tạo `ClickEvent`.
- Luồng click hiện có thể gửi `AddToCart` tới Meta/TikTok cho click ban đầu.

Postback Impact là trigger riêng để gửi thêm event conversion và custom event:

- Event conversion chính:
  - `CompleteRegistration`
  - `Purchase`
- Custom event bổ sung:
  - `Payout` nếu `Payout > 0`
  - giá trị `ActionTrackerName` cho mọi postback Impact có field này, với `value = Amount`

## Tóm tắt nhanh

- Impact dùng `subid1` để nhận lại `clickUuid`.
- Impact postback `Amount=0` và `Payout=0` → gửi `CompleteRegistration`.
- Impact postback `Amount` hoặc `Payout` khác `0` → gửi `Purchase`.
- Nếu `Payout > 0` sau khi parse string sang number → gửi thêm custom event `Payout`.
- Mọi postback Impact có `ActionTrackerName` → gửi thêm custom event có `eventName` bằng giá trị `ActionTrackerName`, `value = Amount` sau khi parse sang number.
- Custom events dùng lại `clickUuid` và attribution của click trước đó.
- Chỉ gửi CAPI/EAPI khi postback match được click và không duplicate.
- Gửi tới tất cả dataset active của campaign gắn với click.
- Duplicate postback chỉ tăng `requestCount`, không gửi lại event.
