# Các postback của partner stack

## case 1 
[
  {
    "headers": {
      "host": "n8n.dbaiagents.com",
      "user-agent": "python-requests/2.26.0",
      "content-length": "1818",
      "accept": "/",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare; loops=1",
      "cf-connecting-ip": "35.196.45.91",
      "cf-ipcountry": "US",
      "cf-ray": "9fbb839058960eef-ATL",
      "cf-visitor": "{"scheme":"https"}",
      "content-type": "application/json",
      "traceparent": "00-6a0601e8000000005196f666f3de7267-9214e63fb981263a-00",
      "tracestate": "dd=p:9214e63fb981263a;s:0;t.dm:-1;t.tid:6a0601e800000000",
      "x-datadog-parent-id": "10526291390441268794",
      "x-datadog-sampling-priority": "0",
      "x-datadog-tags": "_dd.p.dm=-1,_dd.p.tid=6a0601e800000000",
      "x-datadog-trace-id": "5879157285617300071",
      "x-forwarded-for": "104.22.24.9",
      "x-forwarded-host": "n8n.dbaiagents.com",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-forwarded-server": "9532bff7317f",
      "x-real-ip": "104.22.24.9"
    },
    "params": {},
    "query": {},
    "body": {
      "event": "customer.created",
      "data": {
        "key": "cus_AcOLfPJYaM7mfF",
        "sub_ids": [],
        "shared_id": null,
        "has_paid": false,
        "company": {
          "key": "co_0wGrIBXWHBf02A",
          "name": "Eleven Labs Inc."
        },
        "partnership_key": "part_MonH6KAwdrU9qL",
        "customer_name": "006c55d38d164e2ca31be397a69304b2",
        "customer_email": "006c55d38d164e2ca31be397a69304b2@email.com",
        "fields": [
          {
            "name": "Customer Name",
            "api_name": "name",
            "description": null,
            "help_text": null,
            "position": 0,
            "type": "input",
            "required": true,
            "options": {},
            "value": "006c55d38d164e2ca31be397a69304b2",
            "read_only": true
          },
          {
            "name": "Email",
            "api_name": "email",
            "description": null,
            "help_text": null,
            "position": 1,
            "type": "email",
            "required": true,
            "options": {},
            "value": "006c55d38d164e2ca31be397a69304b2@email.com",
            "read_only": true
          },
          {
            "name": "Company Name",
            "api_name": "company_name",
            "description": null,
            "help_text": null,
            "position": 2,
            "type": "input",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Website",
            "api_name": "website",
            "description": null,
            "help_text": null,
            "position": 3,
            "type": "input",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Phone Number",
            "api_name": "phone",
            "description": null,
            "help_text": null,
            "position": 4,
            "type": "phone",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Country",
            "api_name": "country_iso",
            "description": null,
            "help_text": null,
            "position": 8,
            "type": "country",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Source Type",
            "api_name": "source_type",
            "description": null,
            "help_text": null,
            "position": 9,
            "type": "input",
            "required": false,
            "options": {},
            "value": "link",
            "read_only": true
          }
        ],
        "created_at": 1778778600731,
        "updated_at": 1778778600731
      },
      "test": false
    },
    "webhookUrl": "https://n8n.dbaiagents.com/webhook/postback-partnerstack",
    "executionMode": "production"
  }
]

## Case 2

[
  {
    "headers": {
      "host": "n8n.dbaiagents.com",
      "user-agent": "python-requests/2.26.0",
      "content-length": "1862",
      "accept": "/",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare; loops=1",
      "cf-connecting-ip": "35.196.45.91",
      "cf-ipcountry": "US",
      "cf-ray": "9fbb8e2d5c95ed7c-ATL",
      "cf-visitor": "{"scheme":"https"}",
      "content-type": "application/json",
      "traceparent": "00-6a06039b000000002cbfdfadc68ae835-de2b8db2d58c5a2a-00",
      "tracestate": "dd=p:de2b8db2d58c5a2a;s:0;t.dm:-1;t.tid:6a06039b00000000",
      "x-datadog-parent-id": "16009045099645000234",
      "x-datadog-sampling-priority": "0",
      "x-datadog-tags": "_dd.p.dm=-1,_dd.p.tid=6a06039b00000000",
      "x-datadog-trace-id": "3224541795673892917",
      "x-forwarded-for": "108.162.238.152",
      "x-forwarded-host": "n8n.dbaiagents.com",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-forwarded-server": "9532bff7317f",
      "x-real-ip": "108.162.238.152"
    },
    "params": {},
    "query": {},
    "body": {
      "event": "customer.updated",
      "data": {
        "key": "cus_AcOLfPJYaM7mfF",
        "sub_ids": [
          "8ecd4270-989e-4eb3-9345-9bebf99a8c98"
        ],
        "shared_id": null,
        "has_paid": true,
        "company": {
          "key": "co_0wGrIBXWHBf02A",
          "name": "Eleven Labs Inc."
        },
        "partnership_key": "part_MonH6KAwdrU9qL",
        "customer_name": "006c55d38d164e2ca31be397a69304b2",
        "customer_email": "006c55d38d164e2ca31be397a69304b2@email.com",
        "fields": [
          {
            "name": "Customer Name",
            "api_name": "name",
            "description": null,
            "help_text": null,
            "position": 0,
            "type": "input",
            "required": true,
            "options": {},
            "value": "006c55d38d164e2ca31be397a69304b2",
            "read_only": true
          },
          {
            "name": "Email",
            "api_name": "email",
            "description": null,
            "help_text": null,
            "position": 1,
            "type": "email",
            "required": true,
            "options": {},
            "value": "006c55d38d164e2ca31be397a69304b2@email.com",
            "read_only": true
          },
          {
            "name": "Company Name",
            "api_name": "company_name",
            "description": null,
            "help_text": null,
            "position": 2,
            "type": "input",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Website",
            "api_name": "website",
            "description": null,
            "help_text": null,
            "position": 3,
            "type": "input",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Phone Number",
            "api_name": "phone",
            "description": null,
            "help_text": null,
            "position": 4,
            "type": "phone",
            "required": false,
            "options": {},
            "value": null,
            "read_only": true
          },
          {
            "name": "Country",
            "api_name": "country_iso",
            "description": null,
            "help_text": null,
            "position": 8,
            "type": "country",
            "required": false,
            "options": {},
            "value": "Hong Kong",
            "read_only": true
          },
          {
            "name": "Source Type",
            "api_name": "source_type",
            "description": null,
            "help_text": null,
            "position": 9,
            "type": "input",
            "required": false,
            "options": {},
            "value": "link",
            "read_only": true
          }
        ],
        "created_at": 1778778601000,
        "updated_at": 1778779035345
      },
      "test": false
    },
    "webhookUrl": "https://n8n.dbaiagents.com/webhook/postback-partnerstack",
    "executionMode": "production"
  }
]

## case 3

[
  {
    "headers": {
      "host": "n8n.dbaiagents.com",
      "user-agent": "python-requests/2.26.0",
      "content-length": "490",
      "accept": "/",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare; loops=1",
      "cf-connecting-ip": "35.196.45.91",
      "cf-ipcountry": "US",
      "cf-ray": "9fbb8e2fd8f4de26-ATL",
      "cf-visitor": "{"scheme":"https"}",
      "content-type": "application/json",
      "traceparent": "00-6a06039c00000000015a1cd099389a56-76e2c067b48a02af-01",
      "tracestate": "dd=p:76e2c067b48a02af;s:1;t.dm:-0;t.tid:6a06039c00000000",
      "x-datadog-parent-id": "8566620992855212719",
      "x-datadog-sampling-priority": "1",
      "x-datadog-tags": "_dd.p.dm=-0,_dd.p.tid=6a06039c00000000",
      "x-datadog-trace-id": "97422024191285846",
      "x-forwarded-for": "104.22.24.8",
      "x-forwarded-host": "n8n.dbaiagents.com",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-forwarded-server": "9532bff7317f",
      "x-real-ip": "104.22.24.8"
    },
    "params": {},
    "query": {},
    "body": {
      "event": "transaction.created",
      "data": {
        "archived": false,
        "partnership_key": "part_MonH6KAwdrU9qL",
        "amount": 660,
        "currency": "USD",
        "amount_usd": 660,
        "product_key": null,
        "metadata": null,
        "company": {
          "key": "co_0wGrIBXWHBf02A",
          "name": "Eleven Labs Inc."
        },
        "customer": {
          "key": "cus_AcOLfPJYaM7mfF",
          "sub_ids": [
            "8ecd4270-989e-4eb3-9345-9bebf99a8c98"
          ],
          "shared_id": null
        },
        "key": "ch_3TX2p4LmdOdiMXBs1S7cEV4Y",
        "created_at": 1778779035165,
        "updated_at": 1778779035182
      },
      "test": false
    },
    "webhookUrl": "https://n8n.dbaiagents.com/webhook/postback-partnerstack",
    "executionMode": "production"
  }
]

## case 4

[
  {
    "headers": {
      "host": "n8n.dbaiagents.com",
      "user-agent": "python-requests/2.26.0",
      "content-length": "1202",
      "accept": "/",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare; loops=1",
      "cf-connecting-ip": "35.196.45.91",
      "cf-ipcountry": "US",
      "cf-ray": "9fbb8fe12ef9b03b-ATL",
      "cf-visitor": "{"scheme":"https"}",
      "content-type": "application/json",
      "traceparent": "00-6a0603e100000000d91e3f4d0bc192f7-4870f62a35eb80a7-00",
      "tracestate": "dd=p:4870f62a35eb80a7;s:0;t.dm:-1;t.tid:6a0603e100000000",
      "x-datadog-parent-id": "5219942629276090535",
      "x-datadog-sampling-priority": "0",
      "x-datadog-tags": "_dd.p.dm=-1,_dd.p.tid=6a0603e100000000",
      "x-datadog-trace-id": "15645011755673948919",
      "x-forwarded-for": "172.71.23.29",
      "x-forwarded-host": "n8n.dbaiagents.com",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-forwarded-server": "9532bff7317f",
      "x-real-ip": "172.71.23.29"
    },
    "params": {},
    "query": {},
    "body": {
      "event": "reward.created",
      "data": {
        "partnership_key": "part_MonH6KAwdrU9qL",
        "company": {
          "id": 9195,
          "key": "co_0wGrIBXWHBf02A",
          "name": "Eleven Labs Inc."
        },
        "payment_status": null,
        "payout_id": null,
        "payment_date": null,
        "withdrawn": false,
        "customer": {
          "key": "cus_AcOLfPJYaM7mfF",
          "sub_ids": [
            "8ecd4270-989e-4eb3-9345-9bebf99a8c98"
          ],
          "shared_id": null,
          "name": "006c55d38d164e2ca31be397a69304b2",
          "email": "006c55d38d164e2ca31be397a69304b2@email.com",
          "created_at": 1778778601000,
          "updated_at": 1778779101755
        },
        "source": {
          "type": "transaction",
          "key": "ch_3TX2p4LmdOdiMXBs1S7cEV4Y"
        },
        "transaction": {
          "created_at": 1778779035165,
          "updated_at": 1778779035182,
          "currency": "USD",
          "amount": 660,
          "amount_usd": 660,
          "archived": false,
          "category_key": null,
          "product_key": null
        },
        "description": "Earn 22% on every customer transaction for the first 12 months of customers lifetime! - $6.60 USD purchase by 006c55d38d164e2ca31be397a69304b2",
        "amount": 145,
        "reward_status": "scheduled",
        "currency": "USD",
        "decline_reason": null,
        "creation_source": null,
        "created_by": null,
        "created_by_name": null,
        "key": "rwrd_GivmMOp9cvu26w",
        "created_at": 1786555035165,
        "updated_at": 1778779102063
      },
      "test": false
    },
    "webhookUrl": "https://n8n.dbaiagents.com/webhook/postback-partnerstack",
    "executionMode": "production"
  }
]