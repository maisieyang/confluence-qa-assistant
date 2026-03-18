# Microservices Architecture Guide

## Overview

The company follows a microservices architecture. Each service is independently deployable, owns its data, and communicates via well-defined APIs or event streams.

## Service Catalog

| Service | Language | Team | Description |
|---------|----------|------|-------------|
| api-gateway | Go | Platform | Kong-based API gateway, rate limiting, auth |
| user-service | Go | Identity | User management, authentication, authorization |
| payment-service | Go | Payments | Transaction processing, settlement |
| notification-service | Python | Platform | Email, SMS, push notifications |
| analytics-service | Python | Data | Event collection, reporting APIs |
| file-service | Go | Platform | File upload, storage, CDN integration |

## Inter-Service Communication

### Synchronous (REST/gRPC)
- Use for request-response patterns where the caller needs an immediate result
- All services must implement health check endpoints: `GET /health`
- Timeout: 5 seconds for inter-service calls
- Retry policy: 3 retries with exponential backoff

### Asynchronous (Kafka)
- Use for event-driven patterns where the caller doesn't need an immediate result
- Topic naming convention: `<service>.<entity>.<event>` (e.g., `payment.transaction.completed`)
- All events must include: `event_id`, `timestamp`, `source_service`, `payload`
- Consumer groups follow the naming pattern: `<consuming-service>-<purpose>`

## Service Template

All new services should be created using the internal service template:

```bash
cookiecutter https://github.internal.company.com/templates/go-service
```

The template includes:
- Health check endpoint
- Prometheus metrics endpoint
- Structured logging (JSON format)
- Docker and Helm chart configuration
- CI/CD pipeline (GitHub Actions)
- Basic unit test setup

## Service Mesh

We use **Istio** as our service mesh:
- **mTLS**: All inter-service communication is encrypted
- **Traffic management**: Canary deployments, circuit breaking
- **Observability**: Distributed tracing via Jaeger

## API Gateway

The API Gateway (Kong) handles all external traffic:
- **Rate limiting**: Default 1000 req/min per API key
- **Authentication**: OAuth 2.0 + JWT validation
- **Routing**: Path-based routing to backend services
- **CORS**: Configured per-service

Admin dashboard: https://kong-admin.internal.company.com
