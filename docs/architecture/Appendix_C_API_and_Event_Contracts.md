# APPENDIX C — API, EVENT & INTEGRATION CONTRACTS

**Document:** NexCart companion specification  
**Version:** 1.2  
**Purpose:** Define external REST API conventions, endpoint catalogue, representative payloads, event contracts, gRPC rules, errors and integration behavior.

> This is the initial contract baseline. Before implementation, publish OpenAPI specifications for REST APIs and versioned schemas for Kafka events. Examples are illustrative; do not treat IDs, provider fields or signatures shown here as real credentials.

---

## C.1 Contract principles

1. Public browser traffic enters through the API Gateway over HTTPS.
2. Public APIs use `/api/v1` until a breaking change requires a new major version.
3. JSON is the default REST payload format.
4. Use consistent naming, validation and error contracts.
5. Never expose internal database entities blindly as API responses.
6. Return only fields the caller is authorized to see.
7. Use `BigDecimal`/decimal JSON values or integer minor units consistently. This specification uses decimal strings for money examples to avoid JSON floating-point ambiguity.
8. Require an idempotency key for checkout, payment initiation and refund creation.
9. Use cursor pagination for potentially large result sets.
10. Events are versioned and may be delivered more than once.
11. Every event has a unique `eventId`, event type/version, timestamp and correlation context.
12. Do not put secrets, raw payment credentials or unnecessary personal data in events.

## C.2 Common HTTP conventions

### C.2.1 Headers

| Header | Purpose | Rule |
|---|---|---|
| `Authorization: Bearer <token>` | Authenticated caller | Required for protected APIs |
| `Content-Type: application/json` | Request body format | Required for JSON body |
| `Accept: application/json` | Response format | Recommended |
| `X-Correlation-ID` | Cross-service request correlation | Gateway generates if absent or validates accepted format |
| `Idempotency-Key` | Safe retry for selected write commands | Required for checkout/payment/refund operations |
| `If-Match` | Optional optimistic concurrency for resource updates | Use ETag/version where implemented |

Do not accept a client-supplied `X-Tenant-ID` as proof of access. The service must validate tenant scope from authenticated identity and resource ownership.

### C.2.2 Client application topology

NexCart has three independent Next.js clients: Customer (`frontend/apps/web`), Seller (`frontend/apps/seller`) and Admin (`frontend/apps/admin`). They are separate deployments but consume the same versioned public API surface through the API Gateway. Each app may have app-specific screens and access scopes; API request/response contracts remain owned and versioned here, not redefined independently by each app.

- Browser-facing requests MUST use the public HTTPS API Gateway origin and `/api/v1` contracts. A Next.js server-side request may use a private/internal Gateway address only when deployment networking permits it; do not expose internal service URLs to browser bundles.
- The API Gateway MUST allow only explicitly configured frontend origins for each environment. Do not use wildcard origins with credentialed requests.
- If authentication uses cookies, configure `Secure`, `HttpOnly` and an appropriate `SameSite` policy; define the cookie host/domain deliberately. Prefer host-only cookies unless cross-subdomain sharing is a documented requirement. Do not broaden cookie scope to every subdomain by default.
- Credentialed cross-origin requests require an explicit origin allowlist and `Access-Control-Allow-Credentials`; CORS is not authentication or authorization.
- Cookie-authenticated state-changing requests MUST have CSRF protection (for example, a validated CSRF token and Origin/Referer policy). If bearer tokens are used instead, token storage, refresh and XSS exposure must be explicitly reviewed; do not store long-lived refresh tokens in localStorage by default.
- Backend services MUST authorize every operation using the authenticated principal, role/permission and tenant/resource ownership. Hiding a page, button or route in a frontend is not an access-control boundary.
- The three apps MUST NOT call each other to perform privileged operations or share session secrets. Cross-portal links may navigate the user, but the destination app must establish/validate its own authenticated session according to the selected identity design.

Production hostnames, cookie strategy, CSRF mechanism, token/session lifecycle and exact CORS origins are deployment/security decisions that must be recorded before production. The local default ports are web `3000`, seller `3001`, admin `3002`, and API Gateway `8080`; local ports are not production origins.

### C.2.3 HTTP methods

- `GET`: Read; no business side effect.
- `POST`: Create or execute a command.
- `PUT`: Full replacement only where that behavior is clear.
- `PATCH`: Partial update.
- `DELETE`: Remove/deactivate only where the lifecycle permits.

### C.2.4 Status codes

| Code | Usage |
|---|---|
| 200 | Successful read/update/command with representation |
| 201 | Resource created |
| 202 | Accepted for asynchronous processing; return operation/resource reference |
| 204 | Successful action without response body |
| 400 | Malformed request or invalid syntax |
| 401 | Missing/invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource not found or intentionally hidden to prevent disclosure |
| 409 | State conflict, duplicate conflict or idempotency key reused with different request |
| 422 | Syntactically valid request that fails business validation, if adopted consistently |
| 429 | Rate limit exceeded |
| 500 | Unexpected internal error |
| 502/503/504 | Upstream failure, unavailable dependency or timeout as appropriate |

Choose a consistent policy for 400 versus 422 and document it in OpenAPI.

## C.3 Standard response and error contracts

### C.3.1 Resource response example

```json
{
  "data": {
    "id": "5c69dba2-1a6e-4ee5-bf90-9717bc75d5b4",
    "status": "CONFIRMED"
  },
  "meta": {
    "requestId": "req-01J..."
  }
}
```

### C.3.2 Collection response with cursor

```json
{
  "data": [
    { "id": "order-opaque-1", "status": "CONFIRMED" },
    { "id": "order-opaque-2", "status": "FULFILLING" }
  ],
  "page": {
    "limit": 20,
    "nextCursor": "eyJjcmVhdGVkQXQiOi...",
    "hasMore": true
  },
  "meta": { "requestId": "req-01J..." }
}
```

Cursor must be opaque and validated. It should encode stable sort position (for example `created_at` plus unique ID), not a raw SQL offset. The backend must cap `limit`.

### C.3.3 RFC 9457 Problem Details

```json
{
  "type": "https://api.nexcart.example/problems/inventory-unavailable",
  "title": "Inventory unavailable",
  "status": 409,
  "detail": "One or more requested items are no longer available.",
  "instance": "/api/v1/orders/checkout",
  "code": "INVENTORY_UNAVAILABLE",
  "correlationId": "corr-01J...",
  "errors": [
    {
      "field": "items[0].quantity",
      "code": "INSUFFICIENT_STOCK",
      "message": "The requested quantity is not available."
    }
  ]
}
```

Do not return stack traces, SQL, internal hostnames, provider secrets or token values.

## C.4 API versioning and compatibility

- Keep `/api/v1` compatible for additive changes.
- Adding optional response fields is generally non-breaking if clients ignore unknown fields.
- Removing/renaming fields, changing meaning, or changing required request fields is breaking.
- Publish a new major API version for breaking external contract changes.
- Keep service OpenAPI files in source control and validate them in CI.
- Generate TypeScript client types or validate the hand-written client against OpenAPI; do not let frontend and backend independently invent shapes.

---

## C.5 Identity & Access API catalogue

Base path: `/api/v1/auth` and `/api/v1/users`.


| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register and trigger mandatory email verification | Public, rate-limited |
| POST | `/api/v1/auth/email-verification/confirm` | Confirm single-use email challenge | Public, rate-limited |
| POST | `/api/v1/auth/email-verification/resend` | Resend verification email | Public, rate-limited |
| POST | `/api/v1/auth/login` | Authenticate verified user | Public, rate-limited |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | Refresh credential |
| POST | `/api/v1/auth/logout` | Revoke current session | Authenticated |
| POST | `/api/v1/auth/forgot-password` | Request password reset | Public, rate-limited |
| POST | `/api/v1/auth/reset-password` | Complete password reset | Reset challenge |
| GET | `/api/v1/users/me` | Current user profile | Authenticated |
| PATCH | `/api/v1/users/me` | Update allowed profile fields | Authenticated |
| GET | `/api/v1/users/me/addresses` | List current user's addresses | Authenticated |
| POST | `/api/v1/users/me/addresses` | Create address | Authenticated |
| PATCH | `/api/v1/users/me/addresses/{addressId}` | Update own address | Authenticated + ownership |
| DELETE | `/api/v1/users/me/addresses/{addressId}` | Delete/deactivate own address | Authenticated + ownership |
| POST | `/api/v1/users/me/addresses/{addressId}/default` | Set default address | Authenticated + ownership |
| GET | `/api/v1/users/me/sessions` | List active sessions | Authenticated |
| DELETE | `/api/v1/users/me/sessions/{sessionId}` | Revoke session | Authenticated, owner |

### Register request

```json
{
  "email": "customer@example.com",
  "password": "example-password-not-for-production",
  "displayName": "Customer One"
}
```

Response: `201 Created` with safe user fields and verification next step. Do not return password hash or raw refresh token except through the intended secure login/refresh flow.

### Confirm email verification

`POST /api/v1/auth/email-verification/confirm`

```json
{
  "token": "single-use-verification-token-from-email"
}
```

Response: `204 No Content` on success. Expired, already-used, revoked or invalid tokens must fail with a safe, documented error. Store only a hash of the challenge token; never log or persist the raw token. The challenge has a configured expiry and is single-use.

### Resend email verification

`POST /api/v1/auth/email-verification/resend`

```json
{
  "email": "customer@example.com"
}
```

Return a non-enumerating response. Apply per-account and per-IP rate limits. A newly issued challenge must safely supersede or revoke prior outstanding challenges.

### Login response example

```json
{
  "data": {
    "accessToken": "<short-lived-access-token>",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "user-opaque-id",
      "displayName": "Customer One",
      "email": "customer@example.com"
    }
  }
}
```

Refresh token delivery must use the selected client security design (for browser apps, consider Secure, HttpOnly, SameSite cookies with CSRF defenses). Do not place long-lived refresh tokens in localStorage by default.

---

## C.6 Tenant / Merchant API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/v1/seller-applications` | Submit seller application | Authenticated user |
| GET | `/api/v1/seller-applications/me` | View own application | Applicant |
| GET | `/api/v1/admin/seller-applications` | Search applications | Admin permission |
| GET | `/api/v1/admin/seller-applications/{id}` | Application detail | Admin permission |
| POST | `/api/v1/admin/seller-applications/{id}/approve` | Approve seller | Admin permission + audit |
| POST | `/api/v1/admin/seller-applications/{id}/reject` | Reject with reason | Admin permission + audit |
| POST | `/api/v1/stores` | Create store | Approved seller |
| GET | `/api/v1/stores/{storeId}` | Get store | Authorized scope |
| PATCH | `/api/v1/stores/{storeId}` | Update store | Store owner/role |
| GET | `/api/v1/organizations/me` | Current seller organization | Seller member |
| POST | `/api/v1/organizations/{id}/members` | Invite/add member | Seller owner/admin |

### Application request example

```json
{
  "organization": {
    "legalName": "Example Retail Private Limited",
    "displayName": "Example Retail",
    "businessType": "COMPANY"
  },
  "contact": {
    "email": "seller@example.com",
    "phone": "+91XXXXXXXXXX"
  }
}
```

MVP seller application collects basic business/contact details only. PAN, GSTIN and document uploads are deferred. When enhanced verification is introduced, do not place raw document bytes in normal JSON: create an authorized upload intent and use private object storage with a pre-signed URL.

---

## C.7 Catalog API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/v1/products` | Search/browse published products | Public |
| GET | `/api/v1/products/{productId}` | Product detail | Public if published; seller/admin for drafts |
| POST | `/api/v1/seller/products` | Create product draft | Seller role |
| PATCH | `/api/v1/seller/products/{productId}` | Update seller-owned product | Seller role + ownership |
| POST | `/api/v1/seller/products/{productId}/publish` | Publish directly or enter review depending on category policy | Seller role + ownership |
| POST | `/api/v1/admin/products/{productId}/approve` | Approve a product in a category requiring moderation | Admin permission |
| POST | `/api/v1/admin/products/{productId}/reject` | Reject a product in a category requiring moderation | Admin permission |
| POST | `/api/v1/seller/products/{productId}/media-upload-intents` | Generate upload intent | Seller role + ownership |
| GET | `/api/v1/categories` | List categories | Public |

Product listing parameters: `q`, `categoryId`, `sellerId` (filter only; not authorization), `minPrice`, `maxPrice`, `sort`, `limit`, `cursor`.

### Category-driven publish behavior

`POST /api/v1/seller/products/{productId}/publish` evaluates the product's category inside Catalog Service:

- If category `requires_approval=false`, an active seller's valid product becomes `PUBLISHED` immediately.
- If category `requires_approval=true`, the product becomes `PENDING_REVIEW` and is not public until an administrator approves it.
- Seller cannot override this policy through a request field. Only an authorized admin may change category moderation policy.

### Create product example

```json
{
  "storeId": "store-opaque-id",
  "sku": "SELLER-SKU-001",
  "name": "Cotton T-Shirt",
  "description": "Product description",
  "categoryId": "category-opaque-id",
  "variants": [
    {
      "sku": "SELLER-SKU-001-M-BLK",
      "displayName": "M / Black",
      "attributes": { "size": "M", "color": "Black" },
      "price": { "amount": "499.00", "currency": "INR" }
    }
  ]
}
```

Server derives seller scope from authentication/membership; a body `storeId` is checked against that scope. It is not accepted as proof of ownership.

---

## C.8 Inventory API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/v1/seller/inventory` | List seller inventory | Seller inventory permission |
| GET | `/api/v1/inventory/variants/{variantId}` | Public/safe availability | Public or authenticated as policy permits |
| POST | `/api/v1/seller/inventory/adjustments` | Adjust stock | Seller inventory permission |
| POST | `/internal/v1/inventory/reservations` | Reserve stock | Service identity / internal |
| POST | `/internal/v1/inventory/reservations/{reservationId}/release` | Release reservation | Service identity / internal |
| POST | `/internal/v1/inventory/reservations/{reservationId}/commit` | Commit/allocation transition | Service identity / internal |
| GET | `/internal/v1/inventory/orders/{orderId}/reservations` | Get reservations for order | Service identity / internal |

### Stock adjustment example

```json
{
  "storeId": "store-opaque-id",
  "variantId": "variant-opaque-id",
  "quantityDelta": 25,
  "reasonCode": "RESTOCK",
  "note": "New stock received"
}
```

### Reservation command example

```json
{
  "reservationKey": "order-item-opaque-id:checkout-attempt-1",
  "orderId": "order-opaque-id",
  "orderItemId": "order-item-opaque-id",
  "storeId": "store-opaque-id",
  "variantId": "variant-opaque-id",
  "quantity": 2,
  "expiresAt": "2026-11-25T12:00:00Z"
}
```

Reservation endpoint must be idempotent by `reservationKey`. A repeated command with same key and same content returns the existing reservation. A conflicting payload returns `409`.

---

## C.9 Cart API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/v1/cart` | Get current cart | Customer |
| POST | `/api/v1/cart/items` | Add item | Customer |
| PATCH | `/api/v1/cart/items/{itemId}` | Update quantity | Customer + cart ownership |
| DELETE | `/api/v1/cart/items/{itemId}` | Remove item | Customer + cart ownership |
| DELETE | `/api/v1/cart` | Clear cart | Customer |

Add item example:

```json
{
  "productId": "product-opaque-id",
  "variantId": "variant-opaque-id",
  "quantity": 2
}
```

The API may return display price and estimated total. The response must label these as estimates if they have not been revalidated during checkout.

---

## C.10 Order API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/v1/orders/checkout` | Start checkout | Customer + idempotency key |
| GET | `/api/v1/orders` | Customer order list | Customer |
| GET | `/api/v1/orders/{orderId}` | Customer order detail | Owner or authorized support/admin |
| GET | `/api/v1/orders/{orderId}/timeline` | Order status history | Owner or authorized scope |
| POST | `/api/v1/orders/{orderId}/cancel-requests` | Request cancellation | Customer, eligible state |
| GET | `/api/v1/seller/orders` | Seller-specific orders | Seller order permission |
| GET | `/api/v1/seller/orders/{sellerOrderId}` | Seller order detail | Seller owns seller order |
| POST | `/api/v1/seller/orders/{sellerOrderId}/accept` | Accept/process | Seller order permission |

### Checkout request

```json
{
  "cartId": "cart-opaque-id",
  "addressId": "address-opaque-id",
  "requestedCurrency": "INR",
  "items": [
    { "variantId": "variant-a", "quantity": 2 },
    { "variantId": "variant-b", "quantity": 1 }
  ]
}
```

The backend must not blindly trust submitted prices, seller IDs, discounts or tax totals. It may use the cart ID and item selection as intent, then reload/validate authoritative details.

### Checkout response

```json
{
  "data": {
    "orderId": "order-opaque-id",
    "orderNumber": "NC-2026-ABCD1234",
    "status": "PAYMENT_PENDING",
    "currency": "INR",
    "totalAmount": "1497.00",
    "paymentAction": {
      "type": "REDIRECT",
      "url": "https://payment-provider.example/sandbox/session"
    }
  },
  "meta": { "requestId": "req-opaque-id" }
}
```

Depending on the provider, the response may instead contain a provider SDK token or a `202 Accepted` operation URL. Never expose provider secret keys.

### Idempotency behavior

- Client generates a high-entropy idempotency key for one user intent.
- The key is sent in `Idempotency-Key` header.
- Server scopes it to authenticated customer and operation.
- Server stores a request hash and result/resource reference.
- Same key + same request returns the original result (or current operation status).
- Same key + different request returns `409 IDEMPOTENCY_KEY_REUSED`.
- Key retention is long enough for client/network retry policy and business risk; configure explicitly.

---

## C.11 Payment API catalogue

**Provider decision:** Stripe is the selected adapter target. The Order Service must depend only on a provider-neutral payment contract; the Payment Service owns the Stripe SDK/API integration. Local deterministic tests use a fake provider. Stripe sandbox calls are enabled only when the developer has an eligible Stripe test account. A browser redirect/return URL is never authoritative proof of payment.

**India production gate:** Stripe documents invite-only onboarding for new India accounts and restrictions on India marketplace/Connect funds flows. In particular, its marketplace support page currently states that separate charges and transfers are not supported for Indian platforms. Do not assume that a parent-order charge can later be split or paid out to sellers through Stripe Connect. Stripe’s India support article and public UPI product page also appear to differ on domestic UPI availability; verify the exact methods enabled for the specific account and integration. Obtain provider confirmation before any real-money rollout. See Master BRD Section 10.1 for official references.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/internal/v1/payments` | Create/initiate payment for order | Order service identity |
| GET | `/api/v1/payments/{paymentId}` | Safe payment status | Order owner / permitted support |
| POST | `/internal/v1/payments/{paymentId}/capture` | Capture authorized payment if provider supports | Authorized service identity |
| POST | `/internal/v1/payments/{paymentId}/void` | Void authorization if supported | Authorized service identity |
| POST | `/internal/v1/payments/{paymentId}/refunds` | Create refund | Authorized service identity/admin workflow |
| POST | `/api/v1/webhooks/payments/{providerCode}` | Provider callback | Public endpoint with signature verification |

Payment initiation and refund endpoints require idempotency. Provider callback is authenticated using the provider's signature/verification mechanism; do not rely on a browser redirect as proof of success.

### Payment create request (internal)

```json
{
  "orderId": "order-opaque-id",
  "customerId": "customer-opaque-id",
  "amount": "1497.00",
  "currency": "INR",
  "returnUrl": "https://app.example/checkout/result"
}
```

### Stripe event mapping (adapter boundary)

The Stripe adapter should map provider events such as `payment_intent.succeeded`, `payment_intent.payment_failed` and relevant refund events into NexCart's provider-neutral payment state/events. Confirm the exact event set, PaymentIntent/Checkout Session choice, authorization/capture options and API version against the Stripe account and chosen integration. Verify webhook signatures using the raw request body and Stripe webhook signing secret before processing. Persist `event.id` uniquely for deduplication. Do not trust query parameters or frontend return routes as proof of payment.

### Payment outcome rules

- `SUCCEEDED`: verified capture or provider-confirmed paid state according to adapter semantics.
- `FAILED`: provider has definitively rejected/failed the transaction.
- `PENDING`: awaiting provider completion.
- `UNKNOWN`: timeout/transport issue means final provider state is not known; reconcile.

Do not map `UNKNOWN` to `FAILED` automatically.

---

## C.12 Fulfillment API catalogue

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/internal/v1/fulfillment-groups` | Create fulfillment work | Order service identity |
| GET | `/api/v1/seller/fulfillment-groups` | Seller fulfillment list | Seller order permission |
| GET | `/api/v1/shipments/{shipmentId}` | Shipment detail | Customer owner/seller/admin scope |
| POST | `/api/v1/seller/shipments` | Create/record shipment | Seller fulfillment permission |
| PATCH | `/api/v1/seller/shipments/{shipmentId}` | Update allowed shipment fields | Seller owns shipment |
| GET | `/api/v1/orders/{orderId}/shipments` | List order shipments | Customer owns order |
| POST | `/api/v1/webhooks/shipping/{carrierCode}` | Carrier callback | Signature/auth verification |

MVP uses seller-entered manual shipment updates through the seller shipment API; carrier webhooks are not required. When a carrier integration is added later, callback payloads must be authenticated, normalized and deduplicated while retaining the original provider status.

---

## C.13 Notification and WebSocket contracts

### C.13.1 REST endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/notifications` | List current user's notifications |
| POST | `/api/v1/notifications/{id}/read` | Mark as read |
| PATCH | `/api/v1/notification-preferences` | Update permitted preferences |

### C.13.2 WebSocket behavior

Suggested endpoint: `/ws` through the Gateway.

Connection requirements:
- Authenticate securely during handshake or approved connection-auth mechanism.
- Do not put long-lived tokens in query strings because URLs may be logged.
- Authorize every subscription topic/resource.
- Define heartbeat, maximum message size, connection limit and idle timeout.
- Use Redis Pub/Sub only to fan messages across instances; it is not a durable event store.
- On reconnect, client fetches REST state and may send last-seen event/version if replay support is implemented.

Example server message:

```json
{
  "messageId": "msg-opaque-id",
  "type": "ORDER_STATUS_CHANGED",
  "occurredAt": "2026-11-25T10:35:00Z",
  "resource": {
    "type": "ORDER",
    "id": "order-opaque-id"
  },
  "data": {
    "status": "CONFIRMED"
  }
}
```

The client should treat the message as an instruction to refresh or update a safe local projection; it must not use an unauthenticated message to authorize an action.

### C.12.1 Admin, returns, promotions, reviews and analytics endpoints (P1/P2)

These endpoints are introduced when the related release scope is approved. Every endpoint requires an explicit permission check and audit behavior where it changes sensitive state.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/v1/admin/orders` | Search marketplace orders | Admin/support permission |
| GET | `/api/v1/admin/orders/{orderId}` | Inspect order safely | Admin/support permission |
| GET | `/api/v1/admin/payments` | Search payment records | Finance/admin permission |
| GET | `/api/v1/admin/sellers` | Search sellers | Admin permission |
| POST | `/api/v1/admin/sellers/{sellerId}/suspend` | Suspend seller with reason | Admin permission + audit |
| POST | `/api/v1/returns` | Create return request | Customer owns order item |
| GET | `/api/v1/returns/{returnId}` | View return status | Customer/seller/admin scope |
| POST | `/api/v1/seller/returns/{returnId}/decision` | Approve/reject per policy | Seller permission |
| POST | `/api/v1/admin/returns/{returnId}/decision` | Admin decision/override | Admin permission + audit |
| POST | `/api/v1/admin/promotions` | Create promotion | Promotion admin permission |
| POST | `/api/v1/reviews` | Create eligible product review | Customer + purchase eligibility |
| GET | `/api/v1/products/{productId}/reviews` | List public approved reviews | Public |
| GET | `/api/v1/seller/reports/sales` | Seller sales report | Seller report permission |
| POST | `/api/v1/admin/reports/exports` | Request report export | Admin report permission |
| GET | `/api/v1/reports/exports/{exportId}` | Get export status/download link | Request owner/admin |

---

## C.14 gRPC usage and contract rules

Use gRPC for internal synchronous calls where typed contracts, latency or streaming needs justify it. Do not use it merely to make the architecture look advanced.

Initial candidates:
- `InventoryCommandService.ReserveStock`
- `InventoryCommandService.ReleaseReservation`
- `PaymentCommandService.CreatePayment`

Illustrative proto:

```protobuf
syntax = "proto3";
package nexcart.inventory.v1;

service InventoryCommandService {
  rpc ReserveStock(ReserveStockRequest) returns (ReserveStockResponse);
  rpc ReleaseReservation(ReleaseReservationRequest) returns (ReleaseReservationResponse);
}

message ReserveStockRequest {
  string reservation_key = 1;
  string order_id = 2;
  string order_item_id = 3;
  string store_id = 4;
  string variant_id = 5;
  int32 quantity = 6;
  string expires_at_rfc3339 = 7;
  string correlation_id = 8;
}

message ReserveStockResponse {
  string reservation_id = 1;
  string status = 2;
}

message ReleaseReservationRequest {
  string reservation_id = 1;
  string reason_code = 2;
  string correlation_id = 3;
}

message ReleaseReservationResponse {
  string reservation_id = 1;
  string status = 2;
}
```

Rules:
- Version package names such as `inventory.v1`.
- Set explicit client deadlines.
- Propagate correlation/trace metadata.
- Define status-code/error mapping.
- Make commands idempotent using stable business keys.
- Use backward-compatible additive field changes.
- Keep generated code out of manual-edit workflows.

---

## C.15 Kafka event contract

### C.15.1 Common event envelope

```json
{
  "eventId": "evt-opaque-id",
  "eventType": "OrderCreated",
  "eventVersion": 1,
  "occurredAt": "2026-11-25T10:30:00Z",
  "producer": "order-service",
  "aggregateType": "ORDER",
  "aggregateId": "order-opaque-id",
  "tenantId": "seller-organization-id-or-null-for-marketplace-scope",
  "correlationId": "corr-opaque-id",
  "causationId": "command-or-event-id",
  "traceparent": "00-...",
  "payload": {}
}
```

Rules:
- `eventId` is immutable and unique.
- `eventType` and `eventVersion` are explicit.
- `occurredAt` is event time in UTC; consumer also records received time.
- `aggregateId` identifies the business aggregate.
- Kafka message key should normally be the aggregate ID when order is required per aggregate.
- Do not include secrets or unnecessary PII.
- Consumers must ignore unknown optional fields.
- Breaking changes require a new compatible version/topic strategy.

### C.15.2 Proposed topic catalogue

| Topic | Producer | Key | Consumer(s) | Purpose |
|---|---|---|---|---|
| `identity.user-registered.v1` | Identity | user ID | Notification, Analytics | New account |
| `merchant.application-submitted.v1` | Tenant | organization ID | Notification, Admin projection | Review required |
| `merchant.seller-approved.v1` | Tenant | organization ID | Catalog, Notification | Seller enabled |
| `merchant.seller-suspended.v1` | Tenant | organization ID | Catalog, Order, Notification | Restrict seller |
| `catalog.product-published.v1` | Catalog | product ID | Analytics, search/read model | Product public |
| `catalog.product-archived.v1` | Catalog | product ID | Cart/read model | Product no longer purchasable |
| `inventory.stock-adjusted.v1` | Inventory | variant/store key | Analytics, Notification | Stock change |
| `inventory.reserved.v1` | Inventory | order ID | Order | Reservation succeeded |
| `inventory.reservation-rejected.v1` | Inventory | order ID | Order | Reservation failed |
| `inventory.released.v1` | Inventory | order ID | Order, Analytics | Reservation released |
| `order.created.v1` | Order | order ID | Analytics | Parent order created |
| `order.payment-requested.v1` | Order | order ID | Payment | Start payment |
| `payment.pending.v1` | Payment | order/payment ID | Order, Notification | Provider pending |
| `payment.succeeded.v1` | Payment | order ID | Order, Notification, Analytics | Provider-confirmed payment |
| `payment.failed.v1` | Payment | order ID | Order, Notification, Analytics | Definitive failure |
| `payment.unknown.v1` | Payment | order ID | Order, Operations | Reconciliation required |
| `order.confirmed.v1` | Order | order ID | Fulfillment, Notification, Analytics | Fulfillment may begin |
| `order.cancelled.v1` | Order | order ID | Inventory, Notification, Analytics | Cancellation |
| `fulfillment.created.v1` | Fulfillment | seller order ID | Order, Notification | Seller work created |
| `shipment.updated.v1` | Fulfillment | shipment ID | Order, Notification, Analytics | Tracking update |
| `shipment.delivered.v1` | Fulfillment | shipment ID | Order, Notification | Delivery complete |
| `payment.refund-completed.v1` | Payment | order ID | Order, Notification, Analytics | Refund success |

Topic naming may be adjusted, but ownership and semantics must remain explicit. Avoid using one generic `events` topic for every domain unless a deliberate event-platform design justifies it.

### C.15.3 Example `OrderCreated` payload

```json
{
  "eventId": "evt-10001",
  "eventType": "OrderCreated",
  "eventVersion": 1,
  "occurredAt": "2026-11-25T10:30:00Z",
  "producer": "order-service",
  "aggregateType": "ORDER",
  "aggregateId": "order-10001",
  "correlationId": "corr-10001",
  "causationId": "cmd-checkout-10001",
  "payload": {
    "orderId": "order-10001",
    "customerId": "customer-10001",
    "currency": "INR",
    "totalAmount": "2500.00",
    "sellerOrderIds": ["seller-order-01", "seller-order-02"]
  }
}
```

### C.15.4 Consumer processing pattern

1. Deserialize and validate schema.
2. Check `eventId`/business command deduplication record.
3. If already processed, acknowledge/commit according to consumer design.
4. Begin local database transaction.
5. Apply business state change.
6. Insert processed-event record and any outbox event in the same transaction.
7. Commit transaction.
8. Commit Kafka offset only after successful processing according to configured listener/ack strategy.
9. Retry only transient failures; route exhausted or non-retryable messages to DLQ with diagnostic metadata.

Exactly-once effects across multiple services are not assumed. The system achieves safe business behavior through local transactions, deduplication and idempotent commands.

### C.15.5 Retry and DLQ policy

Initial policy to tune under test:
- Retry transient errors with exponential backoff and jitter.
- Example delays: 1s, 5s, 15s, 60s, then DLQ; actual policy is per consumer.
- Do not retry schema-invalid or permanently unauthorized messages indefinitely.
- DLQ record must include original topic/partition/offset, event ID, error category, failed timestamp, attempt count and safe diagnostic context.
- DLQ replay must be an operator-controlled, audited action.
- Replayed message must remain idempotent and preserve original event identity or include an explicit replay identity.

---

## C.16 Correlation, tracing and audit propagation

- Gateway assigns `X-Correlation-ID` if absent.
- HTTP clients propagate correlation ID and W3C trace context.
- gRPC metadata propagates trace context and safe correlation context.
- Kafka headers propagate trace context, correlation ID and causation ID.
- Consumer creates a new span linked to producer context.
- Business audit identity (actor type/id) is separate from trace identity.

Correlation IDs are for support/debugging; they do not grant authorization.

## C.17 Rate limiting and security controls

Suggested initial policies (tune based on risk and usability):
- Login, password reset and OTP endpoints: strict per-IP and per-account throttling.
- Public product browse: broader per-IP/client throttling.
- Checkout/payment/refund: per-user and per-operation protection plus idempotency.
- Upload creation: rate and size limits.
- WebSocket: per-user and per-IP connection/subscription limits.

Do not reveal sensitive account existence or payment details through error responses. Validate webhook signatures and protect against replay using provider event IDs/timestamps and idempotency.

## C.18 Contract testing checklist

- [ ] Every REST endpoint is documented in OpenAPI.
- [ ] Request and response schemas have validation constraints.
- [ ] Error responses use the agreed Problem Details model.
- [ ] Authorization scope is documented per endpoint.
- [ ] Pagination and sorting are bounded and stable.
- [ ] Idempotency behavior is documented and tested.
- [ ] gRPC `.proto` files are versioned and compatibility-checked.
- [ ] Kafka event schemas are versioned and compatibility-checked.
- [ ] Consumers handle unknown optional fields and duplicate events.
- [ ] Webhook signature and deduplication behavior is tested.
- [ ] Generated frontend types/client are checked in CI where used.

**End of Appendix C.**
