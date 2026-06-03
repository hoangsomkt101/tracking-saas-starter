# Impact Postback Test Cases

Tài liệu này mô tả test case cho postback Impact dựa trên payload mẫu trong `test/impact.md` và danh sách `ActionTrackerName` trong màn hình Crypto.com Affiliates.

## Nguồn tham chiếu

- Payload mẫu: `test/impact.md`
- Trigger rule chính: `context/IMPACT_EVENT_TRIGGERS.md`
- Action names từ hình Crypto.com:
  - `Verified email`
  - `Verified phone`
  - `iOS`
  - `KYC Success`
  - `Android`
  - `First Transaction`
  - `30 Day Activity`
  - `Daily transactions`
  - `Card opening`
- Action names có trong `test/impact.md`:
  - `Purchase`
  - `Sign Up`
  - `iOS`

## Điều kiện test chung

Mỗi test case cần có sẵn dữ liệu sau:

1. Tenant/workspace có Impact affiliate platform, slug thường là `impact`.
2. Có tracking link thuộc campaign.
3. Campaign có ít nhất một dataset active.
4. Có `ClickEvent` đã được tạo trước với `clickUuid` trùng `SubId1` trong postback.
5. Webhook gọi vào endpoint:

```txt
GET /affiliate-webhooks/:tenantKey/:platformSlug
```

Ví dụ:

```txt
GET /affiliate-webhooks/{tenantPublicKey}/impact?SubId1={clickUuid}&ActionTrackerName=iOS&Amount=0.00&Payout=0.00&ActionTrackerId=47334&RefClickId=abc
```

## Rule kỳ vọng

### Event conversion chính

| `Amount` | `Payout` | Event conversion chính |
| --- | --- | --- |
| `0` | `0` | `CompleteRegistration` |
| `> 0` | `0` | `Purchase` |
| `0` | `> 0` | `Purchase` |
| `> 0` | `> 0` | `Purchase` |

Ghi chú:

- `Amount` và `Payout` từ Impact thường là string như `"0.00"`, `"100.00"`.
- Phải parse sang number trước khi so sánh.
- Rule hiện tại dùng `Amount` hoặc `Payout` khác `0` để gửi `Purchase`.

### Custom event `Payout`

| `Payout` | Có gửi custom event `Payout`? | Value kỳ vọng |
| --- | --- | --- |
| `0` | Không | N/A |
| `> 0` | Có | Theo enrichment hiện có, thường ưu tiên `Payout` |
| Không parse được | Không | N/A |

### Custom event theo `ActionTrackerName`

Mọi postback Impact có `ActionTrackerName` hợp lệ phải gửi thêm custom event:

```json
{
  "eventName": "<ActionTrackerName>",
  "value": "Number(Amount)",
  "clickUuid": "<SubId1>"
}
```

Ghi chú:

- `value` của event theo `ActionTrackerName` lấy từ `Amount`, không lấy từ `Payout`.
- Nếu `Amount = "0.00"` thì `value = 0`.
- Nếu `Amount = "100.00"` thì `value = 100`.
- Nếu `Amount` không parse được thì test cần xác nhận hệ thống bỏ `value` hoặc fallback an toàn theo implementation.

## Matrix test theo `Amount` / `Payout`

Áp dụng matrix này cho từng `ActionTrackerName` trong danh sách:

- `Verified email`
- `Verified phone`
- `iOS`
- `KYC Success`
- `Android`
- `First Transaction`
- `30 Day Activity`
- `Daily transactions`
- `Card opening`

| Case | `ActionTrackerName` | `Amount` | `Payout` | Event names kỳ vọng | Value của event `ActionTrackerName` |
| --- | --- | --- | --- | --- | --- |
| A0P0 | `<ActionTrackerName>` | `0.00` | `0.00` | `CompleteRegistration`, `<ActionTrackerName>` | `0` |
| A1P0 | `<ActionTrackerName>` | `1.00` | `0.00` | `Purchase`, `<ActionTrackerName>` | `1` |
| A0P1 | `<ActionTrackerName>` | `0.00` | `1.00` | `Purchase`, `Payout`, `<ActionTrackerName>` | `0` |
| A1P1 | `<ActionTrackerName>` | `1.00` | `1.00` | `Purchase`, `Payout`, `<ActionTrackerName>` | `1` |
| A100P0 | `<ActionTrackerName>` | `100.00` | `0.00` | `Purchase`, `<ActionTrackerName>` | `100` |
| A0P100 | `<ActionTrackerName>` | `0.00` | `100.00` | `Purchase`, `Payout`, `<ActionTrackerName>` | `0` |
| A100P50 | `<ActionTrackerName>` | `100.00` | `50.00` | `Purchase`, `Payout`, `<ActionTrackerName>` | `100` |

## Test case cụ thể từ `test/impact.md`

### TC-IMPACT-FIXTURE-001: Base44 Purchase, payout > 0

Payload chính:

```json
{
  "SubId1": "0c6976c6-8f1f-45d5-b2b3-e410fbbe5edf",
  "CampaignId": "25619",
  "CampaignName": "Base44 ",
  "ActionTrackerId": "47270",
  "ActionTrackerName": "Purchase",
  "Amount": "0.00",
  "Payout": "100.00",
  "RefClickId": "zLRQ0O29mxyZTyWRlh0tUVu:UkuUkm0HLXyTU40"
}
```

Expected semantic triggers:

| Trigger | Event name | Reason | Value |
| --- | --- | --- | --- |
| Main conversion | `Purchase` | `Payout = 100 > 0` | Theo normal enrichment, ưu tiên `Payout = 100` |
| Custom payout | `Payout` | `Payout = 100 > 0` | Theo normal enrichment, ưu tiên `Payout = 100` |
| Custom action tracker | `Purchase` | `ActionTrackerName = Purchase` | `Amount = 0` |

Important collision note:

- `ActionTrackerName` trùng event conversion chính `Purchase`.
- Nếu hệ thống dedupe theo `eventName`, observable CAPI event names có thể chỉ là:
  - `Purchase`
  - `Payout`
- Test cần kiểm tra policy xử lý collision: nếu cần tách semantic event main `Purchase` và custom action `Purchase`, cần cơ chế phân biệt thêm ngoài `eventName`.

### TC-IMPACT-FIXTURE-002: Base44 Sign Up, amount/payout = 0

Payload chính:

```json
{
  "SubId1": "0c6976c6-8f1f-45d5-b2b3-e410fbbe5edf",
  "CampaignId": "25619",
  "CampaignName": "Base44 ",
  "ActionTrackerId": "47269",
  "ActionTrackerName": "Sign Up",
  "Amount": "0.00",
  "Payout": "0.00",
  "RefClickId": "zLRQ0O29mxyZTyWRlh0tUVu:UkuUkm0HLXyTU40"
}
```

Expected event names:

| Event name | Reason | Value |
| --- | --- | --- |
| `CompleteRegistration` | `Amount = 0` và `Payout = 0` | `0` |
| `Sign Up` | `ActionTrackerName = Sign Up` | `Amount = 0` |

Không gửi `Purchase`.
Không gửi `Payout` custom.

### TC-IMPACT-FIXTURE-003: Crypto.com iOS, amount/payout = 0

Payload chính:

```json
{
  "SubId1": "da623d23-be0d-4ab8-a2ca-f642d2ccdf56",
  "CampaignId": "25666",
  "CampaignName": "Crypto.com Affiliates",
  "ActionTrackerId": "47334",
  "ActionTrackerName": "iOS",
  "Amount": "0.00",
  "Payout": "0.00",
  "RefClickId": "XrWQRnw58xyZRpFSVYQqxWuJUkuUqaS-LXyWzU0"
}
```

Expected event names:

| Event name | Reason | Value |
| --- | --- | --- |
| `CompleteRegistration` | `Amount = 0` và `Payout = 0` | `0` |
| `iOS` | `ActionTrackerName = iOS` | `Amount = 0` |

Không gửi `Purchase`.
Không gửi `Payout` custom.

## Generated test cases cho action names trong hình

### `Verified email`

| Case | `Amount` | `Payout` | Expected event names | `Verified email.value` |
| --- | --- | --- | --- | --- |
| VE-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `Verified email` | `0` |
| VE-A1P0 | `1.00` | `0.00` | `Purchase`, `Verified email` | `1` |
| VE-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `Verified email` | `0` |
| VE-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `Verified email` | `1` |

### `Verified phone`

| Case | `Amount` | `Payout` | Expected event names | `Verified phone.value` |
| --- | --- | --- | --- | --- |
| VP-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `Verified phone` | `0` |
| VP-A1P0 | `1.00` | `0.00` | `Purchase`, `Verified phone` | `1` |
| VP-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `Verified phone` | `0` |
| VP-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `Verified phone` | `1` |

### `iOS`

| Case | `Amount` | `Payout` | Expected event names | `iOS.value` |
| --- | --- | --- | --- | --- |
| IOS-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `iOS` | `0` |
| IOS-A1P0 | `1.00` | `0.00` | `Purchase`, `iOS` | `1` |
| IOS-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `iOS` | `0` |
| IOS-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `iOS` | `1` |

### `KYC Success`

| Case | `Amount` | `Payout` | Expected event names | `KYC Success.value` |
| --- | --- | --- | --- | --- |
| KYC-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `KYC Success` | `0` |
| KYC-A1P0 | `1.00` | `0.00` | `Purchase`, `KYC Success` | `1` |
| KYC-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `KYC Success` | `0` |
| KYC-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `KYC Success` | `1` |

### `Android`

| Case | `Amount` | `Payout` | Expected event names | `Android.value` |
| --- | --- | --- | --- | --- |
| AND-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `Android` | `0` |
| AND-A1P0 | `1.00` | `0.00` | `Purchase`, `Android` | `1` |
| AND-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `Android` | `0` |
| AND-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `Android` | `1` |

### `First Transaction`

| Case | `Amount` | `Payout` | Expected event names | `First Transaction.value` |
| --- | --- | --- | --- | --- |
| FT-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `First Transaction` | `0` |
| FT-A1P0 | `1.00` | `0.00` | `Purchase`, `First Transaction` | `1` |
| FT-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `First Transaction` | `0` |
| FT-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `First Transaction` | `1` |

### `30 Day Activity`

| Case | `Amount` | `Payout` | Expected event names | `30 Day Activity.value` |
| --- | --- | --- | --- | --- |
| 30D-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `30 Day Activity` | `0` |
| 30D-A1P0 | `1.00` | `0.00` | `Purchase`, `30 Day Activity` | `1` |
| 30D-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `30 Day Activity` | `0` |
| 30D-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `30 Day Activity` | `1` |

### `Daily transactions`

| Case | `Amount` | `Payout` | Expected event names | `Daily transactions.value` |
| --- | --- | --- | --- | --- |
| DT-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `Daily transactions` | `0` |
| DT-A1P0 | `1.00` | `0.00` | `Purchase`, `Daily transactions` | `1` |
| DT-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `Daily transactions` | `0` |
| DT-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `Daily transactions` | `1` |

### `Card opening`

| Case | `Amount` | `Payout` | Expected event names | `Card opening.value` |
| --- | --- | --- | --- | --- |
| CO-A0P0 | `0.00` | `0.00` | `CompleteRegistration`, `Card opening` | `0` |
| CO-A1P0 | `1.00` | `0.00` | `Purchase`, `Card opening` | `1` |
| CO-A0P1 | `0.00` | `1.00` | `Purchase`, `Payout`, `Card opening` | `0` |
| CO-A1P1 | `1.00` | `1.00` | `Purchase`, `Payout`, `Card opening` | `1` |

## Payload template cho từng test case

```json
{
  "headers": {
    "user-agent": "Impact-Postback-Client/1.0"
  },
  "query": {
    "SubId1": "<existing-clickUuid>",
    "SubId2": "",
    "SubId3": "",
    "CampaignId": "25666",
    "CampaignName": "Crypto.com Affiliates",
    "ActionTrackerId": "<action-tracker-id>",
    "ActionTrackerName": "<action-name>",
    "Amount": "<amount-string>",
    "Payout": "<payout-string>",
    "EventDate": "2026-05-13T11:37:49+08:00",
    "CreationDate": "",
    "LockingDate": "2026-06-08T00:00:00+08:00",
    "RefClickId": "<impact-ref-click-id>",
    "SharedId": ""
  },
  "body": {}
}
```

Nếu gọi trực tiếp API bằng GET, map `query` thành query string.

## Assertions cần kiểm tra

### Webhook response

Với conversion mới:

```json
{
  "ok": true,
  "duplicate": false,
  "eventName": "CompleteRegistration hoặc Purchase",
  "eventNames": ["..."],
  "idempotencyKey": "..."
}
```

Cần assert:

- `eventName` là event conversion chính.
- `eventNames` chứa đầy đủ event chính + custom events theo matrix.

### Database `AffiliateConversionEvent`

Assert:

- Có record mới.
- `clickUuid = SubId1`.
- `eventName` là event conversion chính.
- `payoutAmount` parse đúng từ `Payout`.
- `rawPayload.Amount` và `rawPayload.Payout` giữ đúng dữ liệu gốc từ Impact.
- `requestCount = 1` với conversion mới.

### Database `CapiEvent`

Với mỗi dataset active trong campaign, cần có `CapiEvent` theo từng `eventName` trong `eventNames`.

Ví dụ một campaign có 2 dataset active và expected event names là:

```json
["Purchase", "Payout", "iOS"]
```

thì kỳ vọng có 6 `CapiEvent`:

```txt
2 datasets x 3 event names = 6 CapiEvent
```

### Payload gửi Meta/TikTok

Assert theo platform:

- Meta:
  - `data[0].event_name = eventName`
  - `data[0].custom_data.value` đúng rule.
- TikTok:
  - `data[0].event = eventName`
  - `data[0].properties.value` đúng rule.

Rule value:

| Event type | Value expected |
| --- | --- |
| `CompleteRegistration` | Theo normal Impact enrichment, thường `0` nếu `Amount=0`, `Payout=0` |
| `Purchase` | Theo normal Impact enrichment, ưu tiên `Payout` khác `0`, sau đó `Amount` khác `0` |
| `Payout` | Theo normal Impact enrichment, thường là `Payout` |
| `<ActionTrackerName>` | Bắt buộc là `Amount` đã parse sang number |

### Duplicate postback

Gửi lại cùng payload/idempotency:

Expected:

- Webhook response `duplicate = true`.
- `AffiliateConversionEvent.requestCount` tăng.
- Không enqueue/gửi thêm CAPI/EAPI.
- Không tạo thêm `CapiEvent` mới.

## Edge cases cần có

| Case | `ActionTrackerName` | `Amount` | `Payout` | Expected |
| --- | --- | --- | --- | --- |
| EDGE-PAYOUT-STRING | `iOS` | `0.00` | `100.00` | Parse `Payout` string thành `100`, gửi `Purchase`, `Payout`, `iOS`; `iOS.value = 0` |
| EDGE-AMOUNT-STRING | `KYC Success` | `100.00` | `0.00` | Parse `Amount` string thành `100`, gửi `Purchase`, `KYC Success`; `KYC Success.value = 100` |
| EDGE-ZERO-STRINGS | `Verified email` | `0.00` | `0.00` | Gửi `CompleteRegistration`, `Verified email`; `Verified email.value = 0` |
| EDGE-COMMA-PAYOUT | `First Transaction` | `0.00` | `1,000.50` | Parse `Payout` thành `1000.5`, gửi `Purchase`, `Payout`, `First Transaction`; `First Transaction.value = 0` |
| EDGE-ACTION-MISSING | `` | `0.00` | `0.00` | Gửi `CompleteRegistration`; không gửi action tracker event |
| EDGE-ACTION-COLLISION | `Purchase` | `0.00` | `100.00` | Semantic: main `Purchase`, custom `Payout`, custom action `Purchase`; observable eventName có thể collision, cần assert theo policy hệ thống |
