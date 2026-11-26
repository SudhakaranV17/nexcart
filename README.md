# NexCart

NexCart is a multi-seller e-commerce marketplace
built using Next.js and Java Spring Boot microservices.

## Architecture

- Frontend: Next.js App Router + TypeScript
- Backend: Spring Boot WebFlux
- Build: Maven Wrapper
- Package manager: pnpm
- Database: PostgreSQL
- Messaging: Kafka (introduced in Phase 9)
- Cache: Redis (introduced in Phase 12)
- Repository: Git monorepo

## Prerequisites

- Git
- Node.js 24 LTS
- pnpm 10.x (repository-pinned)
- Java 21 LTS
- Docker Desktop
- Docker Compose

## Repository Structure

- apps/web: Next.js application
- backend/services: Independent backend services
- backend/shared-libraries: Shared technical libraries
- contracts: API, event and gRPC contracts
- infra: Local and future cloud infrastructure
- scripts: Development automation
- docs: Requirements and architecture documentation

## Documentation

- Master BRD: docs/brd/NexCart_Master_BRD.md
- Appendix A: docs/architecture/Appendix_A_Service_Architecture.md
- Appendix B: docs/architecture/Appendix_B_Data_Design.md
- Appendix C: docs/architecture/Appendix_C_API_and_Event_Contracts.md
- Appendix D: docs/architecture/Appendix_D_Phase_Implementation_Plan.md

## Development

Development setup instructions will be maintained here
as each application and infrastructure component is introduced.

## Git Workflow

- main: stable branch
- feature/\*: new features
- fix/\*: bug fixes
- docs/\*: documentation
- chore/\*: maintenance

All changes should be submitted through pull requests.

## Security

- Never commit real secrets.
- Use local environment files.
- Commit safe .env.example files only.
