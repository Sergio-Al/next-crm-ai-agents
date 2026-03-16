# Refactoring Plan

## Goal
Define and track the backend and mobile refactoring strategy with incremental, low-risk changes.

## Current State
- Backend is TypeScript-based with Next.js API routes, Redis, BullMQ, and worker services.
- Mobile app is React Native (Expo) with streaming chat and custom OpenUI rendering.

## Target Direction
- Introduce event-driven microservices architecture.
- Migrate backend to a dedicated service layer (NestJS-first approach).
- Add an event broker for decoupled asynchronous communication.
- Reassess mobile stack strategy (React Native vs Flutter vs KMP) after backend stabilization.

## Refactoring Tracks

### 1. Backend Platform
- Extract API responsibilities from Next.js route handlers into service modules.
- Introduce clear domain boundaries (Conversations, CRM, Sessions, Notifications).
- Build migration adapters to keep existing endpoints functional during transition.

### 2. Event-Driven Architecture
- Define event catalog and versioning conventions.
- Introduce broker-backed command/event flows.
- Apply outbox + idempotency patterns for reliable delivery.

### 3. Data and Reliability
- Standardize retry, timeout, and circuit-breaker policies.
- Add structured logging, tracing, and metrics across services.
- Add dead-letter and replay procedures for failed events.

### 4. Mobile Strategy
- Keep React Native during backend migration.
- Validate performance bottlenecks and team velocity impact.
- Re-evaluate Flutter/KMP with measurable criteria.

## Milestones
- M1: Event catalog and bounded contexts defined.
- M2: First vertical slice migrated (e.g., Sessions flow).
- M3: Core API routes moved to service layer.
- M4: Broker-based async flows in production.
- M5: Mobile platform decision checkpoint.

## Risks
- Scope creep from simultaneous backend and mobile rewrites.
- Event schema drift between producers and consumers.
- Operational complexity from distributed services.

## Open Questions
- Which broker should be primary (NATS, Kafka, RabbitMQ)?
- What SLOs define success for migration phases?
- Which domains should be migrated first based on business impact?

## Decision Log
- _Pending_
