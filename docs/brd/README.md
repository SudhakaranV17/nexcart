# NexCart Documentation Package

This folder contains the approved Phase 0 v1.2 Master BRD and four companion specifications for NexCart, a multi-seller e-commerce marketplace. The architecture uses one Git monorepo. The frontend is three independently deployable Next.js applications managed by pnpm workspaces and Turborepo; shared frontend libraries live under `frontend/shared/`. The backend uses independent Spring Boot microservices managed by Maven. The first backend setup scaffolds only foundational services; all services remain independently deployable.

## Start here

- [Complete BRD with all appendices in one file](NexCart_Complete_BRD_with_Appendices.md)
- [Master BRD](NexCart_Master_BRD.md)

## Companion documents

1. [Appendix A — Service Architecture](Appendix_A_Service_Architecture.md)
2. [Appendix B — Database Design](Appendix_B_Data_Design.md)
3. [Appendix C — API, Event and Integration Contracts](Appendix_C_API_and_Event_Contracts.md)
4. [Appendix D — Detailed Phase-wise Implementation Plan](Appendix_D_Phase_Implementation_Plan.md)

## Recommended reading order

1. Read the Master BRD to understand the product, users, business rules and release scope.
2. Read Appendix A to understand service boundaries and communication.
3. Read Appendix B before creating migrations or repositories.
4. Read Appendix C before implementing endpoints or Kafka consumers/producers.
5. Follow Appendix D from Phase 0 through Phase 17. Do not jump ahead.

## Approved Phase 0 baseline

- Initial market/currency: India / INR; future multi-country/currency support is planned but not part of MVP checkout.
- Customer email verification is mandatory.
- Seller onboarding uses basic business/contact details and manual admin approval; enhanced PAN/GSTIN/document KYC is later scope.
- Sellers publish products directly by default; configured categories require admin approval.
- Multi-seller cart and one parent-order payment are supported.
- Stripe is the selected provider adapter target. Use a fake provider locally if Stripe test-account access is unavailable. Stripe India account/Connect restrictions are production gates; no live customer payments are allowed until provider eligibility and the intended funds flow are confirmed (Master BRD Section 10.1).
- Shipping is manual seller-entered tracking initially.
- Seller settlement/payouts are entirely post-MVP and must be designed before real marketplace payments.
- One local PostgreSQL server hosts a separate database and DB role per service. Redis is introduced in Phase 12; Kafka in Phase 9.
- One Git monorepo. Frontend: `frontend/apps/web`, `frontend/apps/seller`, `frontend/apps/admin`; shared libraries in `frontend/shared/`; pnpm workspaces + Turborepo; one root lockfile and independent app deployments. Backend: Maven; independently deployable Spring Boot microservices. Initial skeletons: Gateway, Identity, Tenant and Catalog.
- Initial deployment is local learning only; AWS is a later milestone.

## Working discipline

Treat the Master BRD as the source of truth for what/why, Appendix A for service ownership, Appendix B for data ownership, Appendix C for communication contracts and Appendix D for build order. When a requirement changes, update the affected documents, tests and traceability mapping together.


## Frontend workspace quick start

Prerequisites: a supported Node.js LTS, Corepack, the repository-pinned pnpm version, Java/Maven Wrapper and Docker. The exact Node/pnpm/Java versions must be pinned and recorded by the repository when the toolchain is initialized.

```bash
# From the repository root
corepack enable
corepack use pnpm@<PINNED_VERSION>
pnpm install

# Run all frontend apps (Turborepo runs their dev tasks)
pnpm dev

# Run one app
pnpm --filter @nexcart/web dev
pnpm --filter @nexcart/seller dev -- --port 3001
pnpm --filter @nexcart/admin dev -- --port 3002

# Frontend quality gates
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm check

# Backend verification (run from repository root)
./mvnw -f backend/pom.xml verify
```

Local defaults: customer app `http://localhost:3000`, seller app `http://localhost:3001`, admin app `http://localhost:3002`, API Gateway `http://localhost:8080`. Use the actual ports and base URLs from local environment configuration if they differ.

Workspace rules: commit one root `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile` in CI; never commit nested lockfiles or `node_modules`; keep server secrets out of `NEXT_PUBLIC_*`; use `workspace:*` for internal frontend library dependencies. See Appendix A and Appendix D for the full setup, scripts, CI gates and Turborepo configuration.
