# NEXCART — MASTER BUSINESS REQUIREMENTS DOCUMENT

**Product:** NexCart — Multi-Seller E-commerce Marketplace  
**Document type:** Master BRD and Product Requirements Specification  
**Version:** 1.2
**Status:** Phase 0 decisions approved; launch-specific items remain gated
**Audience:** Product owner, beginner developer, frontend/backend engineers, QA, DevOps and future maintainers  
**Primary companion documents:** Appendices A–D in this package  

---

## 0. How to use this document

This document is intended to be followed by someone building the product from the beginning. Read it in order once before coding. During development, use the requirement IDs and the companion documents as working references.

- **This Master BRD answers:** What problem are we solving? Who uses the product? What must the product do? What rules must it follow? How will we know it works?
- **Appendix A answers:** Which service owns each responsibility, and how do services communicate?
- **Appendix B answers:** Which service owns which data, and what entities and fields are needed?
- **Appendix C answers:** What API and event contracts do clients and services use?
- **Appendix D answers:** In what order should a beginner implement the work, and what must pass before moving forward?

### 0.1 Requirement language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** express requirement strength. A MUST requirement is mandatory for the release to which it is assigned. A SHOULD requirement is strongly recommended but can be deferred with a documented reason.

### 0.2 Priority definitions

| Priority | Meaning | Release expectation |
|---|---|---|
| P0 — Must | Required for a usable, secure MVP | Must pass before MVP acceptance |
| P1 — Should | Required for a credible production-ready marketplace | Must pass before general production launch unless formally deferred |
| P2 — Could | Valuable enhancement | May be delivered after the first production release |
| P3 — Future | Not planned for the initial roadmap | Future product consideration |

### 0.3 Status definitions

| Status | Meaning |
|---|---|
| Proposed | Included in this baseline but needs product-owner confirmation |
| Approved | Accepted by the product owner / stakeholders |
| In Progress | Implementation has started |
| Implemented | Code has been completed but may not have passed all tests |
| Verified | Acceptance criteria and required tests have passed |
| Deferred | Intentionally moved to a later release with a reason |

### 0.4 Approved Phase 0 decisions (baseline v1.2)

The following decisions were confirmed by the product owner and are no longer open Phase 0 questions. They may change only through the change-control process in Section 12.3.

| Area | Approved decision | Scope / timing |
|---|---|---|
| Initial market | India | Initial marketplace market |
| Initial currency | INR | Only INR checkout in the MVP; every monetary record still stores an explicit ISO currency code |
| Future markets | Multi-country and multi-currency support | Future release; no FX conversion in MVP |
| Customer email | Mandatory verification | Unverified accounts cannot access authenticated shopping/checkout features |
| Seller onboarding | Basic business and contact details; marketplace admin review/approval | PAN, GSTIN and document/KYC collection deferred to a later release, subject to legal/provider requirements |
| Product publishing | Sellers may publish directly by default | Categories marked `requires_approval = true` enter admin moderation before publication |
| Cart | One cart may contain multiple sellers | One parent order at checkout, split into seller orders/fulfillment groups |
| Payment | One payment for the parent order | MVP payment is platform-level; seller settlement is not implemented in MVP |
| Payment provider | Stripe is the selected provider target | Build a provider adapter and local fake provider; Stripe sandbox is conditional on account/test access |
| Shipping | Manual seller-entered tracking/status initially | Carrier integrations are future work |
| Cancellation/returns | Use the recommended baseline policy in Section 5.5–5.6 | Configurable by product/category; legal/consumer-policy review required before public trading |
| Seller settlement | Entire settlement/payout feature deferred | No real marketplace launch until merchant-of-record, fund flow and seller payout treatment are approved |
| Catalogue | Mixed/general marketplace | Category policy drives moderation and later tax/product attributes |
| Initial deployment | Local learning environment only | AWS production deployment remains a later roadmap phase, not an initial release requirement |
| Repository | One Git monorepo | Frontend workspace and independently deployable Spring Boot microservices coexist in one repository |
| Frontend topology | Three independent Next.js applications managed by pnpm workspaces and Turborepo | `frontend/apps/web`, `frontend/apps/seller`, `frontend/apps/admin`; shared frontend libraries under `frontend/shared/` |
| Frontend deployment | Independent application builds and deployments | Each portal has its own build, environment configuration, CI checks and deployment target; all consume versioned API Gateway contracts |
| Backend build | Maven | Maven Wrapper and parent/aggregator conventions |
| Initial service scaffolding | Foundational skeletons only | Gateway, Identity, Tenant and Catalog first; other services scaffolded just before their implementation phase |
| Local infrastructure | PostgreSQL first | Redis and Kafka are added only when their roadmap phases start |
| Database isolation | One local PostgreSQL server, separate database and DB role per service | Production can move services to separate managed instances when justified |
| Service communication | REST + Kafka + selected gRPC | REST first; Kafka introduced for event workflows; gRPC only for selected synchronous calls |

**Provider qualification:** Stripe remains the chosen learning/sandbox integration target, not a confirmed production payment and marketplace-settlement approval. As checked on 25 November 2026, Stripe states that new Indian accounts are invite-only. Stripe's India marketplace documentation also describes restrictions on Connect capabilities, including limitations on separate charges and transfers. See Section 10.1 and the official references there. The implementation must not assume that a single parent-order charge automatically provides a compliant seller payout mechanism.

---

# 1. Document control

## 1.1 Purpose

The purpose of this BRD is to define the business, functional, operational and quality requirements for NexCart. It also establishes a shared reference for implementation planning and acceptance.

## 1.2 Product summary

NexCart is a multi-seller e-commerce marketplace. Customers discover and purchase products from different sellers through one customer experience. Sellers register their businesses, operate stores, publish products, maintain stock and fulfill their own order items. Marketplace administrators oversee seller onboarding, product moderation, customer support, orders, disputes and platform operations.

The platform will be built with a Next.js frontend and Java/Spring Boot backend. The backend will use reactive APIs where they provide a clear benefit, domain-oriented services, PostgreSQL, Redis, Kafka, WebSockets, selected gRPC communication and AWS infrastructure.

## 1.3 Business problem

A marketplace has several interconnected business processes. A single customer order can contain products from multiple sellers. Each seller owns different stock and fulfillment work. Payment may succeed or fail independently of inventory operations. Networks and external providers may be unavailable. Messages may be delivered more than once. Customers expect accurate order status even when internal services are recovering.

NexCart must address these problems through:

- Clear ownership of seller, product, stock, order, payment and fulfillment data.
- Controlled multi-seller checkout and order splitting.
- Concurrency-safe inventory reservation.
- Idempotent payment and order operations.
- Reliable asynchronous workflows and recoverable failures.
- Fine-grained seller, customer and administrator access controls.
- Useful real-time updates without treating WebSocket delivery as the source of truth.
- Monitoring, audit trails, testing and documented operational procedures.

## 1.4 Product vision

Provide a trustworthy marketplace where customers can buy from multiple sellers in a single experience and each seller can operate independently, while the marketplace owner retains visibility and governance.

## 1.5 Product goals

| Goal ID | Goal | Measurement / evidence |
|---|---|---|
| BG-001 | Enable multi-seller commerce | At least two approved sellers can publish products and receive separate fulfillment work |
| BG-002 | Make checkout reliable | Duplicate checkout submissions do not create duplicate orders |
| BG-003 | Protect inventory correctness | Concurrent reservations cannot sell more units than available stock |
| BG-004 | Make order processing recoverable | Payment, inventory and fulfillment failures produce documented compensating or recovery actions |
| BG-005 | Protect seller and customer data | Automated negative tests prove cross-seller and cross-customer access is denied |
| BG-006 | Improve visibility | Operators can inspect order status, event failures, traces and service health |
| BG-007 | Support independent scaling | Services can be deployed and scaled independently where workload requires it |

## 1.6 Success metrics

These are proposed initial targets, not guarantees. Measure them in a representative staging environment and revise them when realistic traffic and infrastructure costs are understood.

| Metric | Initial target | Measurement method |
|---|---|---|
| Product list API latency | p95 ≤ 500 ms under agreed test load | Load test and application metrics |
| Normal API error rate | < 1% excluding expected business rejections | Metrics / logs |
| Checkout duplicate protection | 100% of tested duplicate-key scenarios return the original result or a safe conflict | Automated integration tests |
| Inventory correctness | No overselling in concurrency test scenarios | Testcontainers integration tests |
| Event consumer recovery | Consumer resumes after restart without losing committed business work | Kafka integration tests |
| Tenant isolation | 100% of defined cross-tenant negative tests denied | Authorization integration tests |
| Critical journey coverage | Registration, seller approval, product publishing, checkout and order tracking covered by E2E tests | Playwright test report |
| Production recovery | Restore procedure demonstrated against agreed RTO/RPO | Recovery exercise |

---

# 2. Product definition and scope

## 2.1 Product model and terminology

NexCart is one marketplace operated by a platform owner. Multiple seller organizations sell through that marketplace.

For this product, a **tenant** means a seller organization and its protected business data. A seller organization may operate one or more stores in a later release. A marketplace administrator has platform-level privileges, but those privileges must be explicit and audited. A customer can purchase products from multiple seller organizations and does not become a seller tenant merely by registering.

This definition is important: tenant isolation is primarily a seller-data boundary. It does not mean every customer gets a separate database or that every request can choose an arbitrary tenant ID.

## 2.2 In-scope capabilities

### Customer experience

- Registration, mandatory email verification, login, logout, profile and address management.
- Browse, search, filter and sort published products.
- View product details, images, variants, seller and availability information.
- Add, update and remove cart items.
- Checkout with delivery address and order review.
- Pay through an integrated payment-provider sandbox initially.
- View parent order and seller-specific fulfillment progress.
- Cancel eligible orders and request eligible returns.
- Receive in-app and real-time order updates.
- Submit a review for an eligible purchased product when review functionality is released.

### Seller experience

- Apply to become a seller using basic business and contact details.
- View application status and respond to review feedback.
- PAN, GSTIN and document/KYC collection are deferred beyond the initial learning MVP, but may be required before a real marketplace launch.
- Set up and manage a store after approval.
- Invite or manage seller staff according to permissions.
- Create and maintain products, product variants and media.
- Publish products directly when their category does not require moderation; submit products for admin approval only in categories configured to require it.
- Add and adjust inventory with a reason recorded.
- View seller-specific orders and process fulfillment.
- Add carrier name, tracking reference and manual shipment status updates. Carrier integrations are deferred.
- View sales and operational summaries.

### Marketplace administration

- Review seller applications and documents.
- Approve, reject or suspend sellers with reasons.
- Moderate product submissions.
- Search and inspect marketplace orders.
- Review payment and refund status without exposing sensitive payment credentials.
- Investigate disputes and support cases.
- Manage users and administrative roles.
- View audit records, operational metrics and reports.

## 2.3 Out of scope for the first release

The following items must not block the initial marketplace build unless the product owner changes scope:

- Native iOS and Android apps.
- International expansion, FX conversion and multi-currency checkout (data structures must retain currency codes for future support).
- Seller settlement, commission accounting, connected-account onboarding and automated seller payouts.
- Advanced commission, withholding and tax automation.
- AI product recommendations and dynamic pricing.
- Auction or bidding functionality.
- Subscription commerce.
- Warehouse-management hardware integrations.
- Multiple shipping-carrier integrations beyond the first adapter.
- Full-text search infrastructure such as a dedicated search cluster; PostgreSQL search is sufficient initially.
- A complete ERP or accounting system.

## 2.4 Release boundaries

| Release | Included scope |
|---|---|
| Local learning MVP | Identity with mandatory email verification, basic seller onboarding and manual approval, mixed catalogue with category-based moderation, stock, multi-seller cart, one parent order/payment, Stripe adapter/fake provider, manual tracking, basic admin essentials. Local-only deployment. |
| Production v1 (future target) | Reliable outbox/Saga, DLQ/retry, WebSockets, stronger authorization, observability, security hardening, backups and AWS deployment after business/provider/legal gates are approved |
| Post-v1 | Promotions, reviews, richer analytics, seller staff permissions, more carriers, seller settlement/payouts, multi-currency, advanced search and enhanced seller verification |

## 2.5 Approved decisions and remaining assumptions

| ID | Decision / assumption | Current baseline | Status / timing |
|---|---|---|---|
| ASM-001 | Initial market | India | Approved for learning MVP |
| ASM-002 | Initial currency | INR only | Approved; future currency-ready data model |
| ASM-003 | Payment provider | Stripe adapter target; fake provider for deterministic local tests | Approved for learning; production access/capability gate remains |
| ASM-004 | Card data | NexCart does not store raw card number or CVV | Mandatory security rule |
| ASM-005 | Seller onboarding | Basic business/contact details plus manual marketplace-admin approval | Approved for MVP; enhanced KYC later |
| ASM-006 | Product moderation | Direct publish by default; admin approval for selected configured categories | Approved for MVP |
| ASM-007 | Shipping | Seller-entered manual tracking initially | Approved for MVP |
| ASM-008 | Reservation expiry | 15 minutes, configurable | Initial engineering default; validate against payment flow |
| ASM-009 | Customer identity | Email/password with mandatory email verification | Approved for MVP |
| ASM-010 | Seller settlement | Entire settlement feature deferred beyond MVP | Must be designed before any real marketplace funds flow |
| ASM-011 | Currency expansion | Multiple countries/currencies in future | No FX or non-INR checkout in MVP |
| ASM-012 | Initial deployment | Local developer environment only | Approved; AWS deployment remains future roadmap |
| ASM-013 | Database isolation | Separate logical PostgreSQL database and DB role per service on one local server | Approved architecture recommendation |
| ASM-014 | Tax/invoice behavior | Persist currency and tax snapshot fields; do not invent tax rates | Qualified tax/legal review before public trading |
| ASM-015 | Returns | Recommended configurable baseline in Sections 5.5–5.6 | Product baseline; verify legal/category obligations before public trading |

## 2.6 Constraints

- The project is being developed as a learning project by a beginner; complexity must be introduced progressively.
- The selected stack includes reactive programming, messaging and distributed systems. These technologies create operational overhead and must be justified by use cases.
- A payment gateway, carrier and AWS account may require separate onboarding and costs.
- A production marketplace may have legal, tax, privacy, consumer-protection and payment obligations that cannot be resolved by engineering design alone.
- The initial delivery target is local learning only. AWS is a later roadmap milestone and must not be provisioned during the initial phases.
- Cloud resource costs must be monitored; managed Kafka and always-on environments can be expensive.

---

# 3. Stakeholders, users and permissions

## 3.1 Stakeholders

| Stakeholder | Responsibility | Primary decisions |
|---|---|---|
| Product owner / marketplace owner | Owns business model, priorities and policies | Scope, commercial rules, release approval |
| Marketplace administrator | Operates marketplace | Seller/product decisions, disputes, operational controls |
| Seller owner | Operates a seller organization | Products, stock, staff and fulfillment |
| Seller staff | Performs delegated seller work | Depends on assigned permissions |
| Customer | Purchases products | Cart, checkout, account, returns and reviews |
| Support agent | Assists users | Limited order and case access |
| Engineering team | Builds and maintains product | Technical implementation and quality |
| QA | Validates requirements | Test coverage and release evidence |
| DevOps / operator | Runs environments and deployments | Infrastructure, monitoring and recovery |

## 3.2 Roles

Initial roles:

- `CUSTOMER`
- `SELLER_OWNER`
- `SELLER_ADMIN`
- `PRODUCT_MANAGER`
- `INVENTORY_MANAGER`
- `ORDER_MANAGER`
- `SUPPORT_AGENT`
- `PLATFORM_ADMIN`
- `PLATFORM_SUPPORT`

A user may have more than one role only where the business policy allows it. Seller roles are scoped to a specific seller organization/store. Platform roles are separate and must not be inferred from a seller role.

## 3.3 Permission principles

1. Deny by default.
2. Validate access on the backend for every protected operation.
3. Do not trust `tenantId`, `sellerId`, `userId` or role values supplied by the browser without server-side verification.
4. Seller staff can access only resources belonging to their organization and only actions permitted by their role.
5. Customers can access only their profile, cart, orders, addresses and eligible reviews.
6. Support users receive limited, auditable access; they do not automatically receive unrestricted payment or credential access.
7. Platform-admin actions require explicit permission and audit logging.
8. Authorization must be applied to WebSocket subscriptions and file-upload/download access, not only REST APIs.

## 3.4 Initial role matrix

| Capability | Customer | Seller Owner/Admin | Seller Staff | Support | Platform Admin |
|---|---:|---:|---:|---:|---:|
| Browse published products | Yes | Yes | Yes | Yes | Yes |
| Manage customer profile | Own only | Own only | Own only | No | Limited support action |
| Create seller products | No | Yes | If granted | No | Moderation only |
| Adjust seller inventory | No | Yes | If granted | No | Audited override only |
| View seller orders | No | Own seller only | If granted | Assigned case only | Yes, audited |
| Place an order | Yes | Only as a customer account | Only as a customer account | No | No by default |
| Approve sellers | No | No | No | No | Yes |
| Moderate products | No | No | No | No | Yes |
| Process refunds | Request only | Request/approve according to policy | No by default | Limited case workflow | Authorized role |
| View audit logs | Own activity summary | Own organization scope | No by default | Assigned case scope | Authorized admin |

This matrix is a starting point. Before launch, convert it into explicit permission keys and automated authorization tests.

---

# 4. Product modules and functional requirements

The following requirements are the product-level source of truth. Detailed implementation and endpoint mapping are in Appendices A–C.

## 4.1 Identity and account management — `MOD-ID`

| ID | Requirement | Priority |
|---|---|---|
| ID-001 | A visitor MUST be able to register with the required identity fields. | P0 |
| ID-002 | The system MUST verify the user's email address before enabling authenticated shopping and checkout. | P0 |
| ID-003 | A user MUST be able to log in and log out. | P0 |
| ID-004 | The system MUST issue short-lived access tokens and rotating refresh tokens. | P0 |
| ID-005 | The system MUST revoke refresh sessions on logout and account suspension. | P0 |
| ID-006 | The system MUST detect refresh-token reuse and revoke the affected token family/session. | P1 |
| ID-007 | Users SHOULD be able to request a password reset through a verified channel. | P1 |
| ID-008 | The system MUST hash passwords using a modern password-hashing algorithm and never store plaintext passwords. | P0 |
| ID-009 | Authentication attempts MUST be rate-limited and security-relevant failures audited. | P1 |
| ID-010 | Users MUST be able to retrieve and update permitted profile information. | P0 |

**Business rules:** Registration creates a `PENDING_VERIFICATION` account and sends a time-limited, single-use email verification challenge. Login may be allowed only to a restricted verification-pending session; unverified users MUST NOT access seller, cart, checkout or order operations. Account identifiers must be unique under a defined normalization policy. Error messages must not expose whether a sensitive account exists where that would enable account enumeration. Token secrets must be protected and rotated operationally. A JWT is not a substitute for authorization checks.

## 4.2 Seller onboarding and organization management — `MOD-MER`

| ID | Requirement | Priority |
|---|---|---|
| MER-001 | An authenticated user MUST be able to submit a seller application. | P0 |
| MER-002 | The application MUST capture required organization and contact information. | P0 |
| MER-003 | The seller application MUST capture basic business and contact details in the MVP. PAN, GSTIN and verification-document upload are deferred to a later release. | P0 |
| MER-004 | A marketplace administrator MUST be able to approve or reject an application with a reason. | P0 |
| MER-005 | Only approved/active sellers MUST be able to publish products and process seller orders. | P0 |
| MER-006 | A seller owner SHOULD be able to invite staff and assign scoped roles. | P1 |
| MER-007 | The system MUST support seller suspension and reactivation with an audit record. | P1 |
| MER-008 | A seller MUST be able to view its own application, organization and store information. | P0 |

**MVP seller fields:** legal/display business name, business type, contact name, email, phone, and business address. Do not require PAN, GSTIN or document uploads in the learning MVP. Add these fields later through versioned migrations and policy review.

**Seller application states:** `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED` or `REJECTED`. A rejected application may be resubmitted after correction according to policy. An approved seller may be `ACTIVE` or `SUSPENDED`. Suspension must block new selling actions but must not delete historical orders or financial records.

## 4.3 Store and catalogue management — `MOD-CAT`

| ID | Requirement | Priority |
|---|---|---|
| CAT-001 | An approved seller MUST be able to create and maintain store information. | P0 |
| CAT-002 | A seller MUST be able to create a product with name, description, category, SKU, price and status. | P0 |
| CAT-003 | A product MAY have variants such as size, color or other defined attributes. | P1 |
| CAT-004 | A product MAY have multiple images/media assets. | P0 |
| CAT-005 | A seller MUST be able to save a product as a draft. | P0 |
| CAT-006 | The system MUST apply category-level moderation policy: direct seller publishing by default, with admin approval required only for categories flagged for review. | P0 |
| CAT-007 | Only approved and published products MUST appear in public search/browse results. | P0 |
| CAT-008 | Customers MUST be able to search, filter, sort and paginate published products. | P0 |
| CAT-009 | Product detail responses MUST identify the seller and available variants. | P0 |
| CAT-010 | Product price changes MUST NOT silently change an already accepted order's price snapshot. | P0 |
| CAT-011 | Product deletion MUST be controlled; products referenced by historical orders must remain referentially understandable. | P0 |

**Product states:** `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `REJECTED`, `ARCHIVED`. On publish, Catalog checks the category policy. If `requires_approval = false`, an eligible active seller can publish directly. If `requires_approval = true`, the product enters `PENDING_REVIEW` and is visible publicly only after admin approval. Publication always requires an active seller, valid price, valid category and all mandatory product fields. Product media must be validated and stored outside the relational database as object storage references.

## 4.4 Inventory — `MOD-INV`

| ID | Requirement | Priority |
|---|---|---|
| INV-001 | Sellers MUST be able to add stock for products/variants they own. | P0 |
| INV-002 | Sellers MUST be able to adjust stock with a reason and actor recorded. | P0 |
| INV-003 | The system MUST calculate available quantity from authoritative inventory records. | P0 |
| INV-004 | The system MUST reserve stock as part of checkout before an order can be confirmed. | P0 |
| INV-005 | The system MUST release reservations when checkout definitively fails, expires or is cancelled according to workflow policy. | P0 |
| INV-006 | Concurrent requests MUST NOT reserve more stock than is available. | P0 |
| INV-007 | The system MUST maintain stock movement and reservation history. | P1 |
| INV-008 | The system SHOULD generate low-stock alerts based on seller-configured thresholds. | P1 |
| INV-009 | Inventory changes MUST be idempotent where triggered by retried commands/events. | P0 |

**Business rules:** PostgreSQL is the source of truth for stock. Redis may cache availability for display but cannot authorize a sale. The reservation expiry baseline is 15 minutes and must be configurable. The exact stock formula and allocation states are defined in Appendix B. A reservation must be associated with an order and must have a unique business identity.

## 4.5 Cart — `MOD-CART`

| ID | Requirement | Priority |
|---|---|---|
| CART-001 | A customer MUST be able to add a published product/variant to a cart. | P0 |
| CART-002 | A customer MUST be able to change quantity and remove items. | P0 |
| CART-003 | A cart MUST support items from multiple sellers. | P0 |
| CART-004 | The system MUST validate that products remain purchasable when cart is read and at checkout. | P0 |
| CART-005 | The system SHOULD preserve an authenticated customer's cart across sessions. | P0 |
| CART-006 | Cart totals MUST be presented as estimates until checkout revalidates pricing, promotions and shipping. | P0 |
| CART-007 | The system SHOULD merge guest-cart items into the authenticated cart using documented conflict rules. | P2 |

Cart quantity is a requested quantity, not a stock reservation. Adding to cart does not guarantee stock will be available later.

## 4.6 Checkout and order management — `MOD-ORD`

| ID | Requirement | Priority |
|---|---|---|
| ORD-001 | An authenticated customer MUST be able to submit checkout for a valid cart. | P0 |
| ORD-002 | Checkout MUST revalidate product status, price, quantity, seller status and delivery eligibility. | P0 |
| ORD-003 | Checkout MUST calculate an immutable price snapshot for the order. | P0 |
| ORD-004 | A cart with products from multiple sellers MUST create one customer-facing parent order and seller-specific fulfillment groups. | P0 |
| ORD-005 | The system MUST require an idempotency key for order-creation requests. | P0 |
| ORD-006 | Duplicate requests using the same key and same request MUST not create a second order. | P0 |
| ORD-007 | Reuse of the same key with a materially different request MUST return a conflict. | P0 |
| ORD-008 | The customer MUST be able to view order details and status history. | P0 |
| ORD-009 | Sellers MUST see only their own fulfillment groups and relevant order items. | P0 |
| ORD-010 | A customer MUST be able to request cancellation while the order is in an eligible state. | P1 |
| ORD-011 | The order workflow MUST persist its progress so it can recover after a service restart. | P0 |
| ORD-012 | The system MUST publish order events through a reliable outbox mechanism. | P0 |

**Order model:** One customer order may contain multiple seller orders/fulfillment groups. The MVP uses exactly one parent-order payment attempt for the customer checkout. The parent order is split into seller orders/fulfillment groups for operations, but payment is not split by seller in the MVP. Order-item and seller-order financial allocations must still be stored so later partial refunds and settlement can be designed. One parent payment does not itself settle or allocate funds to sellers.

## 4.7 Payment — `MOD-PAY`

| ID | Requirement | Priority |
|---|---|---|
| PAY-001 | The system MUST create a payment attempt linked to an order. | P0 |
| PAY-002 | Payment initiation MUST be idempotent. | P0 |
| PAY-003 | The system MUST verify provider webhook signatures before accepting callback data. | P0 |
| PAY-004 | The system MUST handle duplicate, delayed and out-of-order provider callbacks safely. | P0 |
| PAY-005 | The system MUST keep payment state separate from order state. | P0 |
| PAY-006 | Payment status MUST be reconciled against the provider for uncertain outcomes. | P1 |
| PAY-007 | Refunds MUST reference the original payment and have their own state and audit history. | P1 |
| PAY-008 | The system MUST NOT store raw card number, CVV or other prohibited payment credentials. | P0 |
| PAY-009 | Provider credentials MUST be stored in a secrets manager, not source control. | P0 |

**Payment states:** `CREATED`, `PENDING_PROVIDER`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `VOID_PENDING`, `VOIDED`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `UNKNOWN_RECONCILIATION_REQUIRED`.

Stripe is the selected provider adapter target. The local MVP must include a fake provider for deterministic tests and a Stripe sandbox adapter when account/test access is available. The exact authorization/capture/void capabilities must be verified against the eligible Stripe account and integration model. India account eligibility and Stripe Connect marketplace capability are production go/no-go items. If separate authorization/capture is unavailable for the selected integration, the Saga must use an explicitly documented alternative. A payment timeout is not proof of payment failure; query/reconcile the provider before releasing stock when the result is uncertain.

## 4.8 Fulfillment and shipping — `MOD-FUL`

| ID | Requirement | Priority |
|---|---|---|
| FUL-001 | The system MUST create fulfillment work for confirmed seller orders. | P0 |
| FUL-002 | A seller MUST be able to view and process its own fulfillment work. | P0 |
| FUL-003 | A shipment MUST identify the seller order/items it fulfills. | P0 |
| FUL-004 | The system MUST record tracking identifiers and carrier information when available. | P0 |
| FUL-005 | Shipment updates MUST be recorded as timestamped tracking events. | P0 |
| FUL-006 | Customers MUST be able to view relevant shipment progress. | P0 |
| FUL-007 | The system SHOULD support proof-of-delivery attachments. | P1 |
| FUL-008 | Partial shipment and multiple shipments for a seller order SHOULD be supported in the data model. | P1 |

**Shipment states:** `CREATED`, `READY_FOR_PICKUP`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RETURN_TO_ORIGIN`, `CANCELLED`. For the MVP, sellers manually enter carrier name (optional), tracking reference (optional), status and status timestamp. No carrier API/webhook integration is required. Future carrier integrations may use different statuses; normalize them and retain provider status for audit/troubleshooting.

## 4.9 Notifications and real-time experience — `MOD-NOT`

| ID | Requirement | Priority |
|---|---|---|
| NOT-001 | The system MUST notify customers of order confirmation and material payment failures. | P0 |
| NOT-002 | Sellers MUST be notified of new fulfillment work. | P0 |
| NOT-003 | The system SHOULD support email and in-app notifications. | P1 |
| NOT-004 | The system SHOULD broadcast order and shipment changes to authorized connected clients through WebSockets. | P1 |
| NOT-005 | Notification delivery attempts and outcomes MUST be recorded. | P1 |
| NOT-006 | Failed notification delivery MUST be retried according to a bounded policy. | P1 |
| NOT-007 | Users SHOULD be able to configure non-critical notification preferences. | P2 |

WebSocket messages are notifications, not the authoritative order record. On reconnect, clients must fetch current state from REST APIs.

## 4.10 Returns and refunds — `MOD-RET`

| ID | Requirement | Priority |
|---|---|---|
| RET-001 | Customers MUST be able to request a return for an eligible order item within the configured return window. | P1 |
| RET-002 | A return request MUST record item, quantity, reason and supporting information. | P1 |
| RET-003 | Authorized seller/admin users MUST approve or reject the request with a reason. | P1 |
| RET-004 | Refund processing MUST be idempotent and traceable to the original payment. | P1 |
| RET-005 | Inventory MUST only be restocked after the applicable inspection/return policy allows it. | P1 |
| RET-006 | Customer and seller MUST be able to view return/refund status. | P1 |

## 4.11 Promotions — `MOD-PRO`

Promotions are P2 unless the product owner makes them a launch requirement. The system may support coupon code, active dates, usage limits, minimum basket, seller scope and fixed/percentage discount. Coupon validation must occur on the server during checkout. Discount allocation across sellers/order items must be deterministic and stored in the order price snapshot.

## 4.12 Reviews and ratings — `MOD-REV`

Reviews are P2. Only eligible verified purchasers may review the relevant product/order item. The system must prevent duplicate reviews according to policy, support moderation/reporting and avoid exposing private order details through public review APIs.

## 4.13 Administration and support — `MOD-ADM`

| ID | Requirement | Priority |
|---|---|---|
| ADM-001 | Platform administrators MUST be able to search seller applications and review status. | P0 |
| ADM-002 | Authorized administrators MUST be able to approve/reject/suspend sellers with reasons. | P0 |
| ADM-003 | Authorized administrators MUST be able to moderate products. | P1 |
| ADM-004 | Authorized support users MUST be able to find an order using safe identifiers. | P1 |
| ADM-005 | Sensitive administrative actions MUST create audit records. | P0 |
| ADM-006 | Administrators MUST be able to inspect payment status without viewing prohibited payment secrets. | P0 |
| ADM-007 | Administrative access MUST be permission-scoped and tested. | P0 |

## 4.14 Reporting and analytics — `MOD-ANA`

Initial MVP dashboards may use service APIs and pre-aggregated data where appropriate. Analytics must not issue uncontrolled heavy queries against transactional databases. Later, Kafka events can feed read models or export jobs.

Initial reports:

- Customer order history.
- Seller order summary.
- Seller sales totals.
- Product stock summary.
- Platform order/payment operational summary.

Revenue reporting must distinguish order gross value, discounts, shipping, tax, refunds, provider fees and seller settlement. Do not label gross order value as net revenue.

---

# 5. End-to-end business workflows

## 5.1 Seller onboarding

**Primary actor:** Seller owner  
**Supporting actor:** Marketplace administrator  
**Preconditions:** User is registered and authenticated.

1. Seller selects “Become a seller”.
2. Seller enters the MVP business/contact fields: business name, business type, contact name, email, phone and business address.
3. Seller submits the application; PAN, GSTIN and document uploads are not required in the learning MVP.
4. Application changes to `SUBMITTED` / `UNDER_REVIEW`.
5. Marketplace Admin reviews the submitted business details and approves or rejects with a reason.
6. On approval, the seller organization becomes eligible to create/activate a store.
7. Seller receives the outcome notification.

**Alternate paths:** Missing required fields prevent submission; an administrator may request corrections; the seller resubmits; an approved seller may later be suspended. Historical application decisions remain auditable. Enhanced PAN/GSTIN/document verification is a future scope and may be required before public launch based on legal/provider advice.

**Acceptance:** An unapproved seller cannot publish products or receive new seller fulfillment work.

## 5.2 Product publishing

1. An approved/active seller creates a product draft.
2. Seller supplies required product details, category, price, variants (if applicable) and media.
3. Catalog validates product fields, seller ownership and category policy.
4. Product is saved as `DRAFT`.
5. Seller invokes publish.
6. If the selected category has `requires_approval = false` (the default), Catalog publishes the product directly as `PUBLISHED`.
7. If `requires_approval = true`, Catalog changes the product to `PENDING_REVIEW`; an authorized administrator approves or rejects it with a reason.
8. Public catalogue/search APIs return only `PUBLISHED` products belonging to active sellers.
9. Inventory is maintained by Inventory Service, not by a product `stock` field as the sole authority.

**Acceptance:** Draft/rejected/suspended-seller products are not purchasable.

## 5.3 Multi-seller checkout

**Primary actor:** Customer  
**Preconditions:** Customer is authenticated; cart contains at least one valid item.

1. Customer reviews cart and selects a delivery address.
2. Frontend sends checkout request with an idempotency key.
3. Order Service validates the authenticated customer and request.
4. Order Service obtains authoritative product, price and seller eligibility data using documented APIs/events or a controlled checkout snapshot strategy.
5. Order Service calculates subtotal, discounts, shipping estimate and total according to confirmed business rules.
6. Order Service creates a pending parent order, seller order groups and item price snapshots, and an outbox event in one local database transaction.
7. Order workflow requests stock reservation for each seller/item group.
8. If reservation is definitively rejected, workflow initiates cancellation and releases any successful reservations.
9. If reservations succeed, workflow initiates payment.
10. Payment Service creates a provider payment attempt and returns a safe client hand-off/redirect or payment-session response.
11. Provider outcome is verified by signed webhook and/or server-side status query.
12. On confirmed payment success, Order Service confirms the order and requests fulfillment creation.
13. On confirmed payment failure, workflow releases stock and marks the order failed/cancelled.
14. Customer and sellers receive appropriate notifications.
15. Frontend displays the current order status and can refresh it from the API.

**Important uncertainty rule:** A network timeout while calling the payment provider is an unknown outcome, not automatically a failed payment. Reconcile the provider before performing a compensation that could create an unpaid shipment or release stock while payment is captured.

**Acceptance:** The same checkout request retried with the same idempotency key does not create another parent order or another charge.

## 5.4 Seller fulfillment

1. Seller receives a new fulfillment notification.
2. Seller views only its own seller order and items.
3. Seller accepts/processes the order according to policy.
4. Seller packs items and creates or updates shipment details.
5. Seller records manual carrier/tracking details and permitted shipment status updates; carrier API/webhook integrations are deferred.
6. Fulfillment Service normalizes provider states and stores a timeline.
7. Customer can see each seller shipment independently.
8. When all required seller orders are delivered or otherwise closed, parent order status is derived/updated according to business policy.

## 5.5 Cancellation

1. Customer submits a cancellation request for an eligible order/item.
2. Order Service checks the current order and fulfillment state.
3. If inventory is reserved but not shipped, a release command is issued.
4. If payment is authorized but not captured, request void/authorization reversal where supported.
5. If payment has already been captured, create a refund workflow; do not mark refund complete until provider confirmation.
6. If shipment is already in transit, cancellation may be rejected or routed through a return-to-origin/return process.
7. All state transitions and reasons are recorded.

## 5.6 Return and refund

**Recommended initial policy baseline (configurable; not legal advice):**

- Before the seller begins processing: customer may cancel eligible items directly; release inventory reservation and initiate refund if payment was captured.
- After processing starts but before dispatch: cancellation requires seller/admin workflow approval.
- After dispatch: do not treat the request as an ordinary cancellation; route it through delivery refusal/return-to-origin or the return workflow.
- For eligible delivered items: use a configurable 7-calendar-day request window as an initial product default, subject to category-specific exclusions and applicable law. Defective, damaged or incorrect-item claims must use a separate reason/policy path and must not be rejected solely by a generic change-of-mind window.
- Refund only after the appropriate return/inspection decision, or earlier when required by law/provider policy. Restock only after the return has passed the required inspection.
- For a multi-seller parent order, cancellation/return/refund is item- or seller-order-scoped even though the customer made one parent-order payment.

Before real trading, a qualified advisor must validate the policy against applicable Indian consumer-protection, e-commerce, product-category and payment requirements.

1. Customer requests return for eligible items.
2. System validates return window, quantity and item eligibility.
3. Seller/admin reviews the request.
4. Return instructions and shipment are arranged where required.
5. Returned goods are received and inspected.
6. Refund is requested from Payment Service with an idempotency key.
7. Provider result is verified/reconciled.
8. Inventory is restocked only after approved inspection.
9. Order/return status and notifications are updated.

---

# 6. Business state models

The system must not use one status field to represent unrelated business concepts. At minimum, maintain separate order, payment, inventory reservation and shipment state.

## 6.1 Parent order state (proposed)

`PENDING` → `RESERVING_INVENTORY` → `PAYMENT_PENDING` → `CONFIRMED` → `FULFILLING` → `PARTIALLY_FULFILLED` / `FULFILLED` → `COMPLETED`

Alternative terminal or exception states: `CANCELLED`, `FAILED`, `ACTION_REQUIRED`.

This is a conceptual model. Define precise permitted transitions and whether `COMPLETED` means all shipments delivered and return window closed before implementation.

## 6.2 Payment state

Use the states in Section 4.7. Payment state is owned by Payment Service. Order Service consumes payment outcome events; it must not edit payment tables.

## 6.3 Inventory reservation state

`REQUESTED` → `RESERVED` → `COMMITTED` or `RELEASED` / `EXPIRED` / `REJECTED`.

The exact meaning of `COMMITTED` must be defined: it may mean stock is permanently allocated/consumed at the agreed fulfillment point. Ensure the same unit is not both reserved and available.

## 6.4 Shipment state

Use the states in Section 4.8. Provider-specific events must be normalized without losing the original provider status and event timestamp.

---

# 7. Business rules catalogue

| Rule ID | Rule |
|---|---|
| BR-001 | A seller must be approved and active before publishing purchasable products. |
| BR-002 | A seller can manage only products, stock, seller orders and staff within its own organization. |
| BR-003 | Customers can access only their own protected account and order information. |
| BR-004 | A product must be published and purchasable before checkout. |
| BR-005 | Cart contents do not reserve inventory. |
| BR-006 | Checkout must revalidate price, seller, product, variant and availability. |
| BR-007 | The order stores a price snapshot; later product price changes do not rewrite it. |
| BR-008 | One parent order may contain multiple seller orders/fulfillment groups. |
| BR-009 | Inventory availability is determined by Inventory Service and authoritative database state. |
| BR-010 | Reservations must be unique/idempotent per order/item or reservation command identity. |
| BR-011 | A payment provider callback must be authenticated and deduplicated. |
| BR-012 | Payment timeout/unknown state must be reconciled before unsafe compensation. |
| BR-013 | An order cannot be marked paid solely because the browser says payment succeeded. |
| BR-014 | A refund is complete only after a verified provider result or approved provider reconciliation. |
| BR-015 | A shipment can be created only when the relevant seller order reaches the required state. |
| BR-016 | WebSocket messages are ephemeral hints; REST/domain storage remains authoritative. |
| BR-017 | Cross-service data is accessed by API/events/read models, not direct database writes. |
| BR-018 | Event consumers must tolerate at-least-once delivery. |
| BR-019 | All state-changing operations must be authorized server-side. |
| BR-020 | Sensitive administrative and inventory adjustments must be audited. |
| BR-021 | Monetary values use decimal arithmetic and an explicit currency code; floating-point arithmetic is prohibited for money. |
| BR-022 | All persisted timestamps are stored consistently in UTC; user-facing display uses the user's configured locale/time zone. |
| BR-023 | Product/order/payment history needed for audit must not be erased by ordinary soft-delete operations. |
| BR-024 | External provider credentials and signing keys must not be stored in source code or frontend bundles. |

---

# 8. Frontend product requirements

## 8.1 Application approach

NexCart uses **three independently deployable Next.js applications** in one frontend workspace:

- `frontend/apps/web` — customer storefront and customer account experiences.
- `frontend/apps/seller` — seller onboarding, store operations, catalogue, inventory, order and fulfillment experiences.
- `frontend/apps/admin` — marketplace administration, moderation, support and operational experiences.

The applications share reusable frontend libraries from `frontend/shared/` (for example UI components, API client, TypeScript types, utilities and lint/TypeScript configurations). Application-specific business flows, layouts, navigation and authorization-aware presentation remain inside the relevant app. A shared library must not become a dumping ground for portal-specific code.

Use **pnpm workspaces** for JavaScript/TypeScript dependency and lockfile management and **Turborepo** for task orchestration, dependency-aware execution and local/optional remote caching. Keep one root `package.json`, one `pnpm-workspace.yaml`, one `pnpm-lock.yaml` and one `turbo.json`. Do not create nested Git repositories, per-app lockfiles or a second package-manager workspace inside an app.

Each app MUST have its own build output, runtime configuration, environment variables, CI checks and deployment pipeline. A change to one app should not require deploying the other two unless a shared package or common contract change affects them. All apps consume versioned API contracts through the API Gateway; no app connects directly to another service's database or internal repository.

The frontend is an untrusted client. It must never be the authority for price, permission, stock, payment status or order-state transitions. Backend services MUST enforce authentication, tenant/resource authorization and business invariants regardless of frontend route guards or hidden controls.

## 8.2 Customer screens

| Screen ID | Screen | Required behavior |
|---|---|---|
| UI-C-001 | Home | Display published products/categories and curated content |
| UI-C-002 | Register/Login | Validate fields and show safe error states; route unverified accounts to verification |
| UI-C-003 | Email verification | Confirm email using a single-use, expiring verification challenge and allow safe resend |
| UI-C-004 | Product listing | Search, filter, sort and cursor pagination |
| UI-C-004 | Product detail | Show images, price, variants, seller and availability |
| UI-C-005 | Cart | Add/update/remove items and show estimated total |
| UI-C-006 | Checkout | Select address, revalidate cart, show final amount and submit idempotently |
| UI-C-007 | Payment return/result | Show pending/success/failure based on server-confirmed status |
| UI-C-008 | Order list | Show customer-owned orders and statuses |
| UI-C-009 | Order detail | Show seller groups, items, price snapshot and history |
| UI-C-010 | Tracking | Show each shipment timeline and latest status |
| UI-C-011 | Profile/address | Manage allowed personal details and addresses |
| UI-C-012 | Return request | Request return for eligible items and view status |

## 8.3 Seller screens

| Screen ID | Screen | Required behavior |
|---|---|---|
| UI-S-001 | Seller application | Enter basic business and contact details; document upload is future scope |
| UI-S-002 | Seller dashboard | Show seller-scoped operational summary |
| UI-S-003 | Store profile | Manage permitted store details |
| UI-S-004 | Product list | Search/filter seller-owned products |
| UI-S-005 | Product editor | Create/update drafts, variants and media |
| UI-S-006 | Inventory | Show stock, reservations and movements |
| UI-S-007 | Orders | Show only seller-specific order groups |
| UI-S-008 | Fulfillment | Process orders and shipment status |
| UI-S-009 | Staff | Invite staff and assign permitted roles when P1 is enabled |
| UI-S-010 | Reports | Show seller-scoped metrics |

## 8.4 Admin screens

| Screen ID | Screen | Required behavior |
|---|---|---|
| UI-A-001 | Admin dashboard | Show platform operational indicators |
| UI-A-002 | Seller applications | Review documents and approve/reject with reason |
| UI-A-003 | Seller management | Suspend/reactivate with audit trail |
| UI-A-004 | Product moderation | Review pending products |
| UI-A-005 | Order search | Find and inspect orders with appropriate redaction |
| UI-A-006 | Payment/refund monitor | View safe transaction states and reconciliation flags |
| UI-A-007 | Support/disputes | Manage assigned cases |
| UI-A-008 | Audit log | Search privileged actions |
| UI-A-009 | Platform reports | View aggregated platform metrics |

## 8.5 UI behavior requirements

Every data-backed screen must handle loading, empty, success, error, unauthorized and stale-data states. Forms must display field-level validation. Destructive operations require confirmation and appropriate reason capture. Pagination must not load an unbounded dataset. Keyboard navigation and accessible labels are required. A WebSocket disconnect must not make the page appear to have current data; show reconnect state and refresh authoritative data.

---

# 9. Non-functional requirements

## 9.1 Performance and capacity

Initial engineering targets, to be validated:

| ID | Requirement | Proposed target |
|---|---|---|
| NFR-P-001 | Product listing read latency | p95 ≤ 500 ms under agreed staging load |
| NFR-P-002 | Typical internal API latency | p95 ≤ 300 ms excluding external provider operations |
| NFR-P-003 | Checkout API response | Return accepted/pending outcome promptly; long workflows must not hold an HTTP connection open while waiting on all external systems |
| NFR-P-004 | Pagination | No unbounded list endpoint; default page size ≤ 20, max ≤ 100 unless documented |
| NFR-P-005 | Database connection usage | Each service has an explicit bounded pool and monitored utilization |
| NFR-P-006 | Event processing | Consumer lag and processing delay are measured; target is defined after a baseline load test |

## 9.2 Availability and recovery

Proposed initial production targets:

- Critical customer-facing availability: 99.9% monthly after production infrastructure is stable.
- RTO: 4 hours.
- RPO: 15 minutes for agreed critical data.

These targets require backup, restore, replication and operational exercises. Do not claim them until demonstrated.

## 9.3 Security and privacy

- Use HTTPS externally and authenticated service communication internally.
- Apply least privilege to AWS IAM, database users and application permissions.
- Hash passwords using a suitable adaptive algorithm.
- Protect token signing keys and provider credentials.
- Validate upload file size/type and scan uploads where appropriate.
- Enforce tenant and resource ownership at backend boundaries.
- Protect against injection, XSS, CSRF where applicable, SSRF, broken access control and insecure direct object references.
- Do not log authentication secrets, payment secrets or unnecessary personal data.
- Define a privacy notice, retention policy, deletion/export process and incident response before public launch.
- Obtain qualified advice for applicable Indian privacy, consumer, tax and payment obligations.

## 9.4 Reliability and consistency

- Use local ACID transactions inside each service.
- Use Transactional Outbox for state change plus event publication intent.
- Expect at-least-once event delivery; make consumers idempotent.
- Use Saga for cross-service workflows that need compensation/recovery.
- Do not claim global exactly-once processing.
- Use deadlines/timeouts for remote calls.
- Retry only transient and safe operations with bounded exponential backoff and jitter.
- Send exhausted/poison messages to a DLQ and provide an audited replay procedure.

## 9.5 Maintainability

- Use explicit service ownership, package boundaries and naming conventions.
- Document architecture decisions.
- Use code formatting, linting, static analysis and automated tests.
- Keep API/event contracts versioned.
- Keep local development reproducible through scripts and Docker Compose.
- Update documentation when behavior or interfaces change.

## 9.6 Accessibility and compatibility

- Responsive design for desktop, tablet and mobile browser widths.
- Keyboard-accessible forms and navigation.
- Semantic HTML and accessible labels.
- Current supported browsers defined in release policy.
- Avoid relying only on color to communicate status.

---

# 10. Integrations

## 10.1 Payment provider

Stripe is the selected provider target. Implement a provider-neutral `PaymentProviderPort` and a deterministic `FakePaymentProvider` first so local development and tests do not depend on internet access or a real account. Implement the Stripe adapter for Stripe test mode when the account has access.

**India production gate (checked 25 November 2026):** Stripe states that new Indian accounts are invite-only. Stripe's India marketplace guidance also notes limitations for Stripe Connect, including that separate charges and transfers are currently not supported for Indian platforms and that manual payouts are limited to certain use cases. Stripe's India support article says local payment methods such as UPI, netbanking, BNPL and EMI are not supported for Indian businesses, while Stripe's public UPI product page advertises UPI for India. These official pages appear inconsistent or describe different account/product availability; do not assume UPI availability until Stripe confirms it for the specific eligible India account and integration. Therefore:

1. Do not assume the project can create a new Stripe India account immediately.
2. Do not assume Stripe Connect supports the intended multi-seller platform funds flow.
3. Before production, get written confirmation from Stripe for account eligibility, domestic INR payment methods, parent-order charge handling, connected-account onboarding and later seller payouts.
4. Until confirmed, Stripe remains a learning/sandbox adapter target only. No real customer payments or seller fund custody/payouts are in scope.

Official references:
- [Stripe: Accounts are invite-only in India](https://support.stripe.com/questions/moving-to-invite-only-in-india)
- [Stripe: India support for marketplaces / Connect limitations](https://support.stripe.com/questions/stripe-india-support-for-marketplaces)
- [Stripe: Supported methods, currencies and businesses in India](https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-india)
- [Stripe: Public UPI payment-method page](https://stripe.com/in/payment-method/upi)
- [Stripe: India onboarding and video KYC](https://support.stripe.com/questions/video-kyc-for-india-onboarding)

Required adapter capabilities: payment session/intent creation, status query, signed webhook verification, refund operation and reconciliation. Confirm provider support for authorization/capture/void before finalizing Saga steps.

## 10.2 Shipping provider

MVP shipping is manual seller-entered tracking only. Seller users with fulfillment permission can enter an optional carrier name, tracking reference, shipment status and timestamp. There are no carrier API integrations or carrier webhooks in the MVP. Keep a future carrier-adapter boundary so later integrations can normalize external statuses into NexCart shipment states and deduplicate provider callbacks.

## 10.3 Email/SMS provider

Use a notification adapter. Provider credentials must come from Secrets Manager. Notification failure must not roll back a paid order; it should be retried and observable.

## 10.4 AWS services

- **S3:** Product media, verification documents, delivery proof and generated exports; private buckets and pre-signed URLs.
- **RDS PostgreSQL:** Managed transactional storage, private networking and backups.
- **ElastiCache Redis (or approved Redis-compatible service):** Cache, rate-limiting and Pub/Sub infrastructure.
- **ECS/Fargate:** Run containerized services.
- **ALB:** Public HTTP entry point to gateway/frontend as designed.
- **Secrets Manager:** Runtime secrets.
- **SQS:** Isolated background jobs or external integration queues where a queue is more suitable than Kafka.
- **SNS:** Fan-out to selected AWS subscribers/operational notifications.
- **Kafka:** Core internal domain-event backbone; use a managed Kafka option (for example, Amazon MSK) only when cost and operations are understood.

Do not publish the same event independently to Kafka, SNS and SQS without a clear delivery/ownership requirement.

---

# 11. Observability and operations

## 11.1 Logging

All backend services must emit structured JSON logs with timestamp, severity, service, environment, correlation ID and trace ID. Add tenant/user references only where necessary and safe. Never log secrets or raw payment credentials.

## 11.2 Metrics

Monitor request count, latency, error rate, database pool use, Kafka consumer lag, event failure count, DLQ depth, Redis health, WebSocket connections, payment failure/unknown states, order workflow duration and shipment update delay.

## 11.3 Tracing

Use OpenTelemetry context propagation across HTTP, gRPC and Kafka. Record trace IDs in logs. Avoid high-cardinality or personal data as metric labels.

## 11.4 Health endpoints

Expose liveness and readiness separately. Liveness checks whether the process is alive. Readiness checks whether the service can safely receive traffic. Do not make a transient optional dependency failure restart every service unnecessarily.

## 11.5 Operational runbooks

Before production, create runbooks for:

- API/service outage.
- Database connectivity/connection pool exhaustion.
- Redis outage.
- Kafka broker/consumer lag.
- DLQ investigation and replay.
- Payment provider timeout or reconciliation mismatch.
- Stuck order Saga.
- S3 upload failure or unauthorized object access.
- Deployment rollback.
- Database backup restoration.
- Compromised secret rotation.

---

# 12. Acceptance and release governance

## 12.1 MVP acceptance

MVP is accepted when all P0 workflows pass in a shared test environment:

1. Customer registration and login.
2. Seller application and admin approval.
3. Seller store and product creation.
4. Product publication and customer browsing.
5. Inventory adjustment and reservation.
6. Cart and checkout.
7. Idempotent order creation.
8. Sandbox payment success and failure handling.
9. Seller-specific fulfillment view.
10. Customer order history and status.
11. Tenant/customer authorization negative tests.
12. Automated CI checks and documented local setup.

## 12.2 Production v1 acceptance

In addition to MVP acceptance:

- Transactional Outbox and Saga recovery demonstrated.
- Consumer deduplication, retry and DLQ replay tested.
- Payment webhook verification and reconciliation implemented.
- WebSocket authorization/reconnect behavior tested.
- Fine-grained authorization policy and tenant tests passed.
- Observability dashboards and alerts configured.
- Graceful shutdown tested.
- Backup/restore and rollback exercises completed.
- Security and performance tests reviewed.
- AWS production deployment and runbooks completed.
- Legal, tax, seller settlement, privacy and provider decisions approved by relevant owners.

## 12.3 Change control

Any change to a P0/P1 requirement, order/payment/inventory rule, API contract, event schema or service data ownership must be documented. Update this BRD, the relevant appendix, acceptance tests and traceability matrix together.

## 12.4 Open decisions before real public launch

| Decision ID | Remaining production gate | Owner | Why it matters |
|---|---|---|---|
| OD-001 | Confirm Stripe India account eligibility and exact payment-method support for NexCart's business | Product owner + Stripe | Stripe India access is invite-only; domestic methods may be limited |
| OD-002 | Confirm Stripe Connect charge/transfer model for one parent charge across multiple Indian sellers | Product owner + Stripe + finance/legal | Current India marketplace restrictions may not support the intended later payouts |
| OD-003 | Decide merchant of record, custody/holding of funds, seller commission and settlement/payout rules | Business/legal/finance | Must be resolved before real marketplace funds flow |
| OD-004 | Confirm authorization/capture/void capabilities for selected Stripe integration | Engineering + Stripe | Determines payment Saga steps and compensation |
| OD-005 | Approve tax, invoice and marketplace reporting rules | Business/legal/accounting | Legal correctness and financial reporting |
| OD-006 | Define category-specific return/refund and cancellation policy against applicable rules | Business/legal/operations | Consumer rights and refunds |
| OD-007 | Define enhanced seller verification, including PAN/GSTIN/documents if required | Business/legal | Onboarding and fraud/compliance requirements |
| OD-008 | Select shipping carriers/serviceability rules after manual tracking MVP | Operations | Carrier integration design |
| OD-009 | Set production traffic, availability, RTO/RPO and budget targets | Product/DevOps | Cloud sizing and cost control |
| OD-010 | Approve customer data retention/deletion and privacy notices | Business/legal/security | Privacy and audit design |
| OD-011 | Decide multi-country currency, FX, localization and tax behavior | Product/finance/legal | Future international expansion |

---

# 13. Glossary

| Term | Definition |
|---|---|
| Marketplace | The platform through which multiple sellers sell products to customers |
| Seller organization / tenant | A business account whose data and operations are isolated from other sellers |
| Store | A seller-facing commercial presence within the marketplace |
| Parent order | Customer-facing order that may include items from multiple sellers |
| Seller order / fulfillment group | Portion of a parent order that a specific seller fulfills |
| SKU | Seller/product stock-keeping identifier |
| Variant | A purchasable product option such as size or color |
| Reservation | Temporary hold on inventory for an order |
| Idempotency key | Client/business-provided identifier that makes repeated submission safe |
| Outbox | A database record written in the same transaction as business data to reliably publish an event later |
| Saga | A sequence of local transactions across services with recovery/compensation behavior |
| Compensation | A business action that counteracts a prior step; not necessarily a literal rollback |
| DLQ | Dead Letter Queue for messages that exhausted retry or cannot be processed automatically |
| ReBAC | Relationship-based access control |
| RBAC | Role-based access control |
| ABAC | Attribute-based access control |
| RTO | Recovery Time Objective: target time to restore a service |
| RPO | Recovery Point Objective: acceptable data-loss window |
| p95 | 95th percentile latency; 95% of measured requests complete at or below this value |
| Provider webhook | Callback sent by an external provider to report an event/result |

---

# 14. Document map and traceability

| Artifact | Purpose | Authoritative for |
|---|---|---|
| Master BRD | Business and product requirements | Scope, user behavior, rules, quality goals and acceptance |
| Appendix A | Service architecture | Service boundaries, interactions and infrastructure |
| Appendix B | Data design | Entities, ownership, fields, indexes and migrations |
| Appendix C | API and event contracts | REST, gRPC and Kafka interfaces |
| Appendix D | Implementation plan | Task sequence, dependencies, test gates and production rollout |

**End of Master BRD.** The companion documents provide the implementation detail required to turn this product definition into working software.
