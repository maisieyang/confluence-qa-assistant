# Project Beta — Architecture Overview

## Project Summary

Project Beta is the company's internal data analytics platform. It provides real-time dashboards, custom reports, and data pipelines for business intelligence across all departments.

**Team**: Data Engineering (6 engineers, led by James Wong)
**Status**: In production since Q4 2024
**Tech Stack**: Python, Apache Spark, Airflow, ClickHouse, React, Kubernetes

## Architecture

### High-Level Design

```
[Data Sources] → [Airflow DAGs] → [Spark Processing]
                                        ↓
                                  [ClickHouse]
                                        ↓
                              [React Dashboard (Next.js)]
```

### Components

1. **Data Ingestion Layer** — Airflow DAGs that pull data from various sources: MySQL databases, Kafka topics, third-party APIs (Google Analytics, Stripe). Runs on a 15-minute schedule for real-time data, daily for batch data.

2. **Processing Layer** — Apache Spark jobs for data transformation, aggregation, and feature engineering. Runs on EMR (Elastic MapReduce) clusters.

3. **Storage Layer** — ClickHouse as the primary OLAP database. Optimized for analytical queries with columnar storage. Data retention: 2 years.

4. **Presentation Layer** — React-based dashboard built with Next.js. Deployed as a static site on CloudFront. Authentication via company SSO (Okta).

### Database Design

- **OLAP database**: ClickHouse cluster (3 shards, 2 replicas each)
- **Metadata store**: PostgreSQL for Airflow metadata and user configurations
- **Cache**: Redis for dashboard query caching (TTL: 5 minutes)

### Performance

- Dashboard P95 load time: 2.3 seconds
- Daily data processing volume: ~500 GB
- Total data stored: ~15 TB
- Concurrent dashboard users: up to 200

## Key Dashboards

1. **Revenue Dashboard** — Real-time revenue tracking by region, product, and channel
2. **Operations Dashboard** — Transaction success rates, error analysis, SLA monitoring
3. **Marketing Dashboard** — Campaign performance, user acquisition costs, conversion funnels

## Access

Dashboard URL: https://analytics.internal.company.com
Access requests: Submit via IT Service Desk, requires manager approval.
