# APPENDIX B — DATABASE DESIGN & DATA DICTIONARY

**Document:** NexCart companion specification  
**Version:** 1.2  
**Purpose:** Define service-owned data, initial relational entities, key fields, constraints, indexes, retention and migration approach.

> This is a logical starting model. Final physical DDL must be created as versioned Flyway migrations and reviewed against actual query patterns. Do not copy every table into one shared schema and allow all services to write it.

---

## B.1 Data design principles

1. Each service owns a separate logical PostgreSQL database and is the only writer to its tables. One local PostgreSQL server may host multiple service databases for learning; this does not weaken database ownership.
2. Use UUID identifiers for public-facing/domain records unless a documented reason requires another identifier.
3. Never use sequential database IDs as public identifiers.
4. Store timestamps in UTC using PostgreSQL `timestamptz`.
5. Store money using `numeric`, never `float`, `real` or binary floating point.
6. Store currency code with every monetary amount. Do not assume all future amounts are INR.
7. Use database constraints for invariants that the database can enforce.
8. Use idempotency and deduplication records for operations/events that may be retried.
9. Never create cross-service foreign keys. Use IDs and API/event contracts across service boundaries.
10. Avoid excessive JSON blobs for core searchable business fields. JSONB is appropriate for flexible attributes or provider payload snapshots with retention/redaction controls.
11. Keep PII, credentials and payment-provider details protected and access-limited.
12. Add indexes based on query needs; every index has write and storage cost.

## B.2 Database ownership map

| Service | Database | Owns |
|---|---|---|
| Identity | `nexcart_identity` | Users, credentials, refresh sessions, email verification challenges, local roles/permissions |
| Tenant | `nexcart_tenant` | Seller organizations, stores, memberships and basic seller applications; document metadata is future |
| Catalog | `nexcart_catalog` | Categories, per-category moderation policy, products, variants, attributes, media references |
| Inventory | `nexcart_inventory` | Stock balances, reservations, stock movements |
| Cart | `nexcart_cart` | Carts and cart items |
| Order | `nexcart_order` | Parent orders, seller orders, order items, status history, Saga, idempotency, outbox |
| Payment | `nexcart_payment` | Stripe/fake provider payment intents/attempts/transactions, callback inbox, refunds, outbox |
| Fulfillment | `nexcart_fulfillment` | Fulfillment groups, shipments, shipment items, seller-entered manual tracking events, delivery proof refs |
| Notification | `nexcart_notification` | Email verification delivery records initially; later notifications, templates, preferences, delivery attempts |
| Analytics | `nexcart_analytics` | Reporting projections/read models and export jobs (created later) |

**Approved isolation model:** For local development, run one PostgreSQL server/container but create one database and one separate least-privilege DB role/credential per service (for example, `nexcart_identity` / `nexcart_identity_app`). Do not use one shared application database with only schema prefixes as the default. Each runtime role can connect only to its own database. Use a separate migration credential for Flyway DDL. Production may later move a service database to a separate RDS instance/cluster when availability, security, performance or scaling justifies it. A shared local server is an infrastructure convenience, not shared data ownership.

### B.2.1 Local database and credential provisioning

Create one database and role per service as the service is scaffolded. Example initial local databases:

| Service | Database | Runtime role | Migration role |
|---|---|---|---|
| Identity | `nexcart_identity` | `nexcart_identity_app` | `nexcart_identity_migrator` |
| Tenant | `nexcart_tenant` | `nexcart_tenant_app` | `nexcart_tenant_migrator` |
| Catalog | `nexcart_catalog` | `nexcart_catalog_app` | `nexcart_catalog_migrator` |

Add Inventory, Cart, Order, Payment, Fulfillment and Notification databases/roles when those services are introduced. Runtime credentials must not have DDL privileges. Migration credentials are used only by the Flyway migration job/script. Store passwords in local environment files excluded from Git; commit only `.env.example` placeholders. Never configure one service with credentials that can read/write another service database.

## B.3 Shared data conventions

| Concept | Convention |
|---|---|
| Primary key | `uuid` |
| External business ID | UUID or stable opaque identifier; never expose internal secrets |
| Timestamp | `timestamptz`, UTC |
| Money | `numeric(19,4)` plus `currency char(3)` |
| Quantity | `numeric(18,3)` where fractional quantity is permitted; otherwise integer |
| Boolean | `boolean not null` when a default is defined |
| State | Constrained `varchar` or database enum; choose one migration strategy and use consistently |
| Soft deletion | Use `deleted_at` only where restoration/retention semantics are clear; do not soft-delete financial/audit history casually |
| Audit fields | `created_at`, `updated_at`, and actor reference where relevant |
| Version | Integer `version` for optimistic locking where required |
| Tenant reference | `organization_id` / `seller_id` as UUID; validated by owning service |

### B.3.1 Messaging support tables

Any service that publishes important domain events MUST own an `outbox_events` table (or an equivalent approved transactional-outbox mechanism) in its own database. At minimum this applies to Identity, Tenant, Catalog, Inventory, Order, Payment and Fulfillment when they publish events. Any service that consumes events and performs side effects SHOULD maintain a `processed_events`/inbox table with a unique event identity; the deduplication record and local business change should commit in the same local transaction where possible. The detailed column set can follow the `outbox_events` and processed-event patterns in Sections B.9 and B.10.6.

### B.3.2 Money handling

The MVP supports INR only, but every persisted amount must still carry an explicit currency code so the data model is future-ready for multiple countries/currencies. A money value must always have an amount and currency. Example: `amount = 1250.00`, `currency = 'INR'`. Use Java `BigDecimal`. Define rounding rules per calculation (for example, currency minor-unit precision and tax/discount allocation). Store calculated line totals and order totals as snapshots. Never recalculate a historic order from the current product price.

### B.3.3 Time handling

Persist UTC timestamps. Frontend may display localized time. Provider event time and platform received time should both be retained when operationally useful, because callbacks can arrive late or out of order.

### B.3.4 Cross-service references

`product_id`, `seller_id`, `customer_id`, `order_id`, `payment_id` and similar values may refer to entities owned elsewhere. Store them as identifiers with an explicit contract. Do not add a cross-database FK. Validate important relationships by service API, event snapshot or controlled ownership checks.

---

## B.4 Identity database

### B.4.1 `users`

Purpose: Store the platform identity record.

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK |
| `email_normalized` | varchar(320) | Unique; normalized according to documented policy |
| `display_name` | varchar(160) | Required |
| `phone_e164` | varchar(20) | Nullable; normalize if stored |
| `status` | varchar(30) | `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `CLOSED` |
| `email_verified_at` | timestamptz | Nullable |
| `phone_verified_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Indexes: unique index on `email_normalized`; optional index on `status` for admin listing.

### B.4.2 `credentials`

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK to `users.id` within Identity DB |
| `password_hash` | varchar(255) | Adaptive hash only; never plaintext |
| `password_changed_at` | timestamptz | Required |
| `created_at` | timestamptz | Required |

Constraint: unique `user_id` for one active password credential in the initial model.

### B.4.3 `refresh_sessions`

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK / session family identifier |
| `user_id` | uuid | Identity-owned user |
| `token_hash` | varchar(255) | Hash/reference of refresh token, never raw token |
| `parent_session_id` | uuid | Nullable; rotation lineage if used |
| `issued_at` | timestamptz | Required |
| `expires_at` | timestamptz | Required |
| `revoked_at` | timestamptz | Nullable |
| `revoke_reason` | varchar(80) | Nullable |
| `device_label` | varchar(160) | Optional, sanitized |
| `created_at` | timestamptz | Required |

Indexes: `(user_id, expires_at)`, unique token hash, active session lookup. Define transactional rotation so concurrent refresh attempts cannot both succeed.

### B.4.4 Additional Identity tables

- `user_addresses(id, user_id, label, recipient_name, phone_e164, address_line_1, address_line_2, locality, city, state, postal_code, country_code, delivery_instructions_safe, is_default, created_at, updated_at)` — customer-owned addresses. Ensure the API only exposes the authenticated user's addresses. Checkout copies the selected address into an immutable order address snapshot so later address edits do not alter historical orders.
- `verification_challenges(id, user_id, channel, purpose, token_hash, expires_at, consumed_at, attempts, created_at)` — for MVP use `channel=EMAIL` and `purpose=EMAIL_VERIFICATION`; store only a hash of the token, enforce single use/expiry and rate-limit resends. The raw verification token is sent only to the user and is never logged.
- `password_reset_requests(id, user_id, token_hash, expires_at, consumed_at, created_at)`
- `roles(id, code, description)`
- `permissions(id, code, description)`
- `role_permissions(role_id, permission_id)`
- `user_role_assignments(id, user_id, role_id, scope_type, scope_id, created_at)`
- `security_audit_events(id, actor_user_id, event_type, outcome, source_ip_hash_or_redacted, correlation_id, created_at)`

Seller organization membership may be owned by Tenant Service. If role assignment is stored in Identity, keep a clear source of truth and do not duplicate membership state in both services.

---

## B.5 Tenant / Merchant database

### B.5.1 `organizations`

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK |
| `owner_user_id` | uuid | Identity reference, not cross-service FK |
| `legal_name` | varchar(200) | Required |
| `display_name` | varchar(160) | Required |
| `business_type` | varchar(60) | Controlled values |
| `status` | varchar(30) | `PENDING`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `CLOSED` |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

### B.5.2 `seller_applications`

Fields: `id`, `organization_id`, `submitted_by_user_id`, `status`, `submitted_at`, `reviewed_at`, `reviewed_by_user_id`, `decision_reason`, `created_at`, `updated_at`.

Indexes: `(status, submitted_at desc)`, `(organization_id, created_at desc)`.

### B.5.3 `stores`

Fields: `id`, `organization_id`, `store_code`, `name`, `slug`, `description`, `status`, `default_currency` (initially `INR` only), `created_at`, `updated_at`. The MVP rejects non-INR checkout; do not implement FX conversion yet.

Constraints: unique `(organization_id, store_code)` and unique `slug` if marketplace-wide public slugs are required. Store ownership must be validated for every seller mutation.

### B.5.4 `organization_memberships`

Fields: `id`, `organization_id`, `user_id`, `membership_status`, `created_at`, `updated_at`.

Constraint: unique active membership for `(organization_id, user_id)` according to implementation approach.

### B.5.5 `seller_documents` (future release; not required for the learning MVP)

PAN/GSTIN and verification-document collection are deferred. Keep this table out of the initial required migrations unless the release scope changes. When introduced, Fields: `id`, `organization_id`, `application_id`, `document_type`, `s3_object_key`, `content_type`, `file_size`, `upload_status`, `created_at`.

Do not store public S3 URLs as permanent authorization. Store object key and issue short-lived pre-signed URLs after authorization.

---

## B.6 Catalog database

### B.6.1 `categories`

Fields: `id`, `parent_id` (same Catalog DB), `name`, `slug`, `description`, `status`, `requires_approval boolean not null default false`, `sort_order`, `created_at`, `updated_at`.

`requires_approval` controls whether seller publishing is direct or routed to admin moderation. Default is false. Only explicitly configured categories require approval. Indexes: unique slug; parent/status lookup. Define maximum nesting or tree traversal strategy.

### B.6.2 `products`

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK |
| `seller_id` | uuid | Tenant/Merchant reference |
| `store_id` | uuid | Tenant/Merchant reference |
| `sku` | varchar(100) | Seller-scoped unique SKU |
| `name` | varchar(250) | Required |
| `description` | text | Sanitized/rendered safely |
| `category_id` | uuid | Catalog-owned category FK |
| `brand` | varchar(120) | Optional |
| `status` | varchar(30) | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `REJECTED`, `ARCHIVED`; determined by category publication policy |
| `moderation_reason` | text | Optional, not public by default |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Constraints/indexes: unique `(seller_id, sku)`; indexes for `(status, created_at desc)`, `(category_id, status)`, `(seller_id, status)`; text search indexes based on measured needs.

### B.6.3 `product_variants`

Fields: `id`, `product_id`, `variant_sku`, `display_name`, `attributes_json`, `price_amount`, `currency`, `status`, `created_at`, `updated_at`.

Use `numeric(19,4)` for `price_amount`. Unique `(product_id, variant_sku)` and, if business policy requires, unique `(seller_id, variant_sku)` via a denormalized seller key or service validation.

If all products are simple products in MVP, create one default purchasable variant rather than mixing product-level and variant-level inventory semantics.

### B.6.4 `product_media`

Fields: `id`, `product_id`, `s3_object_key`, `media_type`, `content_type`, `sort_order`, `alt_text`, `created_at`.

### B.6.5 Additional catalog tables

- Category moderation must be represented by `categories.requires_approval` (or a separately versioned category policy table if policies become more complex). At publish time, Catalog reads its own category policy: false => publish directly; true => `PENDING_REVIEW` until an admin decision.
- `product_attributes(id, product_id, attribute_key, attribute_value)`
- `product_publication_history(id, product_id, previous_status, new_status, actor_id, reason, created_at)`
- `product_search_projection` only if a dedicated search/read model is required.

Catalog Service may store product price for customer discovery, but final checkout price must be authoritatively revalidated and snapshotted. Inventory quantity is not stored as an authoritative product field.

---

## B.7 Inventory database

### B.7.1 `stock_balances`

| Column | Type | Rules / notes |
|---|---|---|
| `id` | uuid | PK |
| `seller_id` | uuid | Seller ownership reference |
| `store_id` | uuid | Store ownership reference |
| `product_variant_id` | uuid | Catalog reference |
| `on_hand_quantity` | integer or numeric | Non-negative |
| `reserved_quantity` | integer or numeric | Non-negative |
| `allocated_quantity` | integer or numeric | Non-negative; define transition rules |
| `version` | bigint | Optimistic locking |
| `updated_at` | timestamptz | Required |

Constraint: unique inventory key, typically `(store_id, product_variant_id)`.

Available quantity is computed from agreed stock states, initially `on_hand - reserved - allocated`. The business must decide when on-hand is decremented versus allocation committed; do not double-subtract the same units.

### B.7.2 `stock_reservations`

Fields: `id`, `reservation_key`, `order_id`, `order_item_id`, `seller_id`, `store_id`, `product_variant_id`, `quantity`, `status`, `expires_at`, `reserved_at`, `released_at`, `created_at`, `updated_at`.

Constraints: unique `reservation_key`; unique order/item reservation where the business allows one reservation per order item. Index `(status, expires_at)` for expiry workers and `(order_id)` for workflow lookup.

### B.7.3 `stock_movements`

Fields: `id`, `stock_balance_id`, `movement_type`, `quantity_delta`, `reason_code`, `reference_type`, `reference_id`, `actor_id`, `correlation_id`, `created_at`.

Do not update a balance without writing an auditable movement within the same local transaction for business stock changes.

### B.7.4 Reservation algorithm baseline

Use a single atomic conditional update or locked row transaction. Conceptual SQL pattern:

```sql
UPDATE stock_balances
SET reserved_quantity = reserved_quantity + :qty,
    version = version + 1,
    updated_at = now()
WHERE store_id = :store_id
  AND product_variant_id = :variant_id
  AND (on_hand_quantity - reserved_quantity - allocated_quantity) >= :qty;
```

Check affected row count. If zero rows were updated, stock is unavailable or the item key did not exist. Insert reservation and movement in the same local transaction. The production implementation must handle the balance update and reservation insert atomically and must account for duplicate reservation commands.

---

## B.8 Cart database

### B.8.1 `carts`

Fields: `id`, `customer_id`, `status`, `currency`, `created_at`, `updated_at`, `expires_at`.

Unique active cart per customer/currency according to product policy.

### B.8.2 `cart_items`

Fields: `id`, `cart_id`, `product_id`, `product_variant_id`, `seller_id`, `quantity`, `added_at`, `updated_at`.

Constraint: unique `(cart_id, product_variant_id)` if one row per variant. Quantity must be positive and within business limits.

Do not treat saved `unit_price` as final price authority. Cart may store display snapshot fields for UX but checkout must refresh authoritative pricing.

---

## B.9 Order database

### B.9.1 `orders` — parent customer order

Fields:

- `id`
- `order_number` (unique, human-friendly, non-sequential or suitably protected)
- `customer_id`
- `currency`
- `subtotal_amount`
- `discount_amount`
- `shipping_amount`
- `tax_amount`
- `total_amount`
- `order_status`
- `payment_status_snapshot` (informational projection only; Payment Service owns authoritative payment state)
- `shipping_address_snapshot` (JSONB or normalized immutable snapshot)
- `idempotency_record_id`
- `created_at`, `updated_at`

Index: `(customer_id, created_at desc)`, unique `order_number`, `(order_status, created_at)` for operational queues.

### B.9.2 `seller_orders`

Fields: `id`, `parent_order_id`, `seller_id`, `store_id`, `seller_order_number`, `fulfillment_status`, `subtotal_amount`, `discount_allocation_amount`, `shipping_allocation_amount`, `tax_allocation_amount`, `created_at`, `updated_at`.

Constraint: unique `(parent_order_id, seller_id or store_id)` depending on whether one seller can have multiple stores in one checkout.

### B.9.3 `order_items`

Fields: `id`, `parent_order_id`, `seller_order_id`, `product_id`, `product_variant_id`, `seller_id`, `product_name_snapshot`, `sku_snapshot`, `variant_snapshot`, `quantity`, `unit_price_amount`, `line_subtotal_amount`, `discount_amount`, `tax_amount`, `line_total_amount`, `currency`, `created_at`.

Item snapshot fields preserve what customer bought even if the product is later renamed or archived.

### B.9.4 `order_status_history`

Fields: `id`, `order_id`, `seller_order_id` nullable, `previous_status`, `new_status`, `reason_code`, `notes_safe`, `actor_type`, `actor_id`, `correlation_id`, `created_at`.

### B.9.5 `saga_instances` and `saga_steps`

`saga_instances`: `id`, `business_key`, `saga_type`, `aggregate_id`, `state`, `current_step`, `deadline_at`, `last_error_code`, `started_at`, `updated_at`, `completed_at`.

`saga_steps`: `id`, `saga_id`, `step_key`, `status`, `attempt_count`, `command_id`, `result_reference`, `last_error_code`, `started_at`, `completed_at`, `updated_at`.

Persist enough state to recover after restart. Do not depend on in-memory workflow state.

### B.9.6 `idempotency_records`

Fields: `id`, `scope`, `idempotency_key_hash`, `request_hash`, `status`, `resource_id`, `response_code`, `response_snapshot` (only if safe/needed), `created_at`, `expires_at`.

Constraints: unique `(scope, idempotency_key_hash)`. Define key scope (customer + endpoint/operation), retention and handling of in-progress requests. Avoid storing sensitive response content unnecessarily.

### B.9.7 `outbox_events`

Fields: `id`, `aggregate_type`, `aggregate_id`, `event_type`, `event_version`, `payload`, `headers`, `created_at`, `published_at`, `publish_attempts`, `last_error`.

Indexes: `(published_at, created_at)` for pending relay selection; `(aggregate_id, created_at)` for diagnostics. Consider row claiming with `FOR UPDATE SKIP LOCKED` in a polling relay. Define cleanup/retention after successful publication.

---

## B.10 Payment database

### B.10.1 `payment_intents`

Fields: `id`, `order_id`, `customer_id`, `amount`, `currency`, `status`, `provider_code`, `provider_reference`, `idempotency_key_hash`, `created_at`, `updated_at`.

### B.10.2 `payment_attempts`

Fields: `id`, `payment_intent_id`, `attempt_number`, `provider_request_reference`, `provider_response_code`, `status`, `started_at`, `completed_at`, `safe_error_code`.

### B.10.3 `payment_transactions`

Fields: `id`, `payment_intent_id`, `transaction_type` (AUTH/CAPTURE/VOID/REFUND), `provider_transaction_id`, `amount`, `currency`, `status`, `provider_occurred_at`, `received_at`, `created_at`.

### B.10.4 `provider_webhook_events`

Fields: `id`, `provider_code`, `provider_event_id`, `event_type`, `signature_valid`, `processing_status`, `received_at`, `processed_at`, `payload_redacted_or_encrypted`, `safe_error_code`.

Constraint: unique `(provider_code, provider_event_id)`. Retain only the payload data needed for audit/replay and follow provider/legal retention rules.

### B.10.5 `refunds`

Fields: `id`, `payment_intent_id`, `order_id`, `amount`, `currency`, `reason_code`, `status`, `provider_refund_id`, `idempotency_key_hash`, `requested_at`, `completed_at`.

Refund amount must not exceed the refundable balance calculated from verified captured transactions and prior successful refunds.

### B.10.6 Payment outbox and consumer inbox

Payment Service requires an outbox for its own domain events. For incoming messages that trigger side effects, maintain processed-event/deduplication records in the same transaction as the side effect where possible.

---

## B.11 Fulfillment database

### B.11.1 `fulfillment_groups`

Fields: `id`, `seller_order_id`, `seller_id`, `status`, `created_at`, `updated_at`.

### B.11.2 `shipments`

Fields: `id`, `fulfillment_group_id`, `carrier_code`, `provider_shipment_id`, `tracking_number`, `status`, `estimated_delivery_at`, `shipped_at`, `delivered_at`, `created_at`, `updated_at`.

Unique provider references where provided. Index by `tracking_number` only if customers/support search by it.

### B.11.3 `shipment_items`

Fields: `id`, `shipment_id`, `order_item_id`, `quantity`.

### B.11.4 `tracking_events`

MVP source is seller-entered manual updates; store actor, status, note-safe text and occurrence time. Carrier integration metadata can be added later. Fields: `id`, `shipment_id`, `provider_event_id`, `provider_status`, `normalized_status`, `description_safe`, `occurred_at`, `received_at`, `location_safe`, `created_at`.

Unique `(carrier_code, provider_event_id)` when provider event IDs are stable. Event order must be determined from provider event time and transition rules, not arrival time alone.

### B.11.5 `delivery_proofs`

Fields: `id`, `shipment_id`, `s3_object_key`, `proof_type`, `uploaded_by`, `created_at`.

---

## B.12 Notification database

Tables:

- `notifications(id, recipient_user_id, channel, notification_type, subject, body_reference_or_safe_payload, status, created_at, read_at)`
- `notification_templates(id, template_key, channel, locale, version, content_reference, status, updated_at)`
- `notification_preferences(id, user_id, notification_type, channel, enabled, updated_at)`
- `notification_deliveries(id, notification_id, provider_code, provider_message_id, status, attempt_count, next_attempt_at, sent_at, safe_error_code)`

Do not persist credentials or unnecessarily duplicate sensitive order data into notification bodies. Prefer references and render safe content at delivery time. Notification retries must be bounded and visible.

---

## B.13 Analytics database

Use read models/projections, not direct writes to transactional service databases.

Suggested tables/projections:

- `daily_order_metrics(date, currency, order_count, gross_amount, discount_amount, refund_amount)`
- `seller_daily_metrics(date, seller_id, order_count, item_count, gross_amount)`
- `product_sales_metrics(date, product_id, seller_id, units_sold, gross_amount)`
- `export_jobs(id, requested_by, report_type, parameters, status, s3_object_key, created_at, completed_at, safe_error_code)`

Define the meaning of every financial metric. Eventual consistency is expected and dashboards should show an `asOf` timestamp or freshness indicator.

---

## B.14 Indexing and query design checklist

For each API/query, record:

1. Expected filter fields.
2. Sort order.
3. Page size and cursor strategy.
4. Expected cardinality.
5. Required index.
6. Whether query is transactional or reporting.
7. Query plan evidence (`EXPLAIN ANALYZE`) after realistic seed data exists.

Initial likely indexes:

- Users: unique normalized email.
- Seller applications: status + submitted time.
- Products: seller + status, category + status, unique seller SKU.
- Stock: unique store + variant.
- Reservations: status + expiry, order ID.
- Carts: customer + active status.
- Orders: customer + created time, order number, status + created time.
- Seller orders: seller + created time, parent order ID.
- Outbox: unpublished + creation time.
- Payment: order ID, provider reference, webhook provider + event ID unique.
- Shipments: seller order/fulfillment group, tracking number where needed.

Do not add indexes blindly. Check whether an existing composite index already supports the query and measure write overhead.

## B.15 Flyway migration plan

Each service owns its migration directory, for example:

```text
services/order-service/src/main/resources/db/migration/
  V1__create_orders.sql
  V2__create_seller_orders.sql
  V3__create_order_items.sql
  V4__create_outbox_and_idempotency.sql
```

Rules:

- Never edit a migration that has been applied to a shared environment; add a new migration.
- Migrations must be deterministic and reviewed.
- Run migrations as a deployment step/job before new application version receives traffic.
- Test migrations from an empty database and from the previous released schema.
- Use expand-and-contract changes for rolling deployment compatibility.
- Include seed/reference data in repeatable migrations or explicit environment-safe seed scripts as appropriate.
- Keep JDBC migration dependency separate from R2DBC runtime repository code.

## B.16 Data retention, deletion and privacy

Before launch, define a retention matrix for identity data, seller documents, order records, payment references, audit logs, notifications and provider payloads. Deleting a user account must not blindly delete legally/operationally required transaction records. Prefer pseudonymization or removal of non-required personal fields where legally permitted. Access to documents and PII must be logged and restricted.

## B.17 Database verification checklist

- [ ] Every table has a clear owning service.
- [ ] No service writes to another service's tables.
- [ ] Money uses decimal types and currency codes.
- [ ] Timestamps use UTC-aware types.
- [ ] Constraints enforce uniqueness and valid ranges.
- [ ] Inventory concurrency is covered by integration tests.
- [ ] Idempotency records have a defined scope and expiry.
- [ ] Outbox is in the same transaction as business writes.
- [ ] Event deduplication is persisted.
- [ ] Important queries have reviewed plans/indexes.
- [ ] Flyway can migrate empty and upgraded databases.
- [ ] Backup/restore procedures are tested.

## B.18 Frontend data ownership boundary

The customer, seller and admin Next.js applications are API clients; they do not own marketplace business data. They MUST access business records through the versioned API Gateway contracts defined in Appendix C. Browser memory, React state, local storage, session storage, client-side caches and Next.js data caches are presentation/runtime concerns only and MUST NOT become authoritative stores for price, inventory, seller permissions, payment status, order state or audit history.

No frontend application may connect directly to a service database, share database credentials, or use cross-service SQL. Any persisted frontend preference or cache must be scoped, privacy-reviewed and safe to rebuild from the owning service. This frontend topology change does not require a PostgreSQL schema change, new table, cross-service foreign key or change to the service database ownership map in this appendix.

**End of Appendix B.**
