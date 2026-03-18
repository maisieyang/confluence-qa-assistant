# Project Alpha — Architecture Overview

## Project Summary

Project Alpha is the company's next-generation payment processing platform. It handles real-time payment transactions, settlement, and reconciliation for merchants across Southeast Asia.

**Team**: Payments Engineering (8 engineers, led by Sarah Chen)
**Status**: In production since Q2 2025
**Tech Stack**: Go, PostgreSQL, Redis, Kafka, Kubernetes

## Architecture

### High-Level Design

```
[Merchant API] → [API Gateway] → [Payment Service (Go)]
                                        ↓
                                  [Kafka Queue]
                                        ↓
                              [Settlement Service (Go)]
                                        ↓
                              [PostgreSQL + Redis]
```

### Components

1. **Payment Service** — Core transaction processing. Written in Go. Handles payment initiation, validation, and routing to payment providers (Stripe, Adyen, local payment gateways).

2. **Settlement Service** — Batch settlement processing. Runs daily at 2:00 AM SGT. Processes all completed transactions and generates settlement reports for merchants.

3. **Reconciliation Engine** — Compares internal records with payment provider statements. Flags discrepancies for manual review.

4. **API Gateway** — Kong-based API gateway. Handles rate limiting (1000 req/s per merchant), authentication (OAuth 2.0), and request routing.

### Database Design

- **Primary database**: PostgreSQL 15 with read replicas
- **Cache layer**: Redis cluster for session data and rate limiting
- **Event streaming**: Kafka with 3 brokers, 30-day retention

### Performance

- Average transaction latency: 120ms
- Peak throughput: 5,000 transactions per second
- Monthly transaction volume: ~50 million
- Uptime SLA: 99.95%

## API Documentation

Base URL: `https://api.company.com/v1/payments`

### Create Payment
```
POST /v1/payments
Content-Type: application/json
Authorization: Bearer <merchant_token>

{
  "amount": 10000,
  "currency": "SGD",
  "merchant_id": "m_123",
  "description": "Order #456"
}
```

### Query Payment Status
```
GET /v1/payments/{payment_id}
Authorization: Bearer <merchant_token>
```
