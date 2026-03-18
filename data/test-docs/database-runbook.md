# Database Operations Runbook

## Production Databases

| Service | Database | Engine | Host | Port |
|---------|----------|--------|------|------|
| Payment Service | payments_db | PostgreSQL 15 | pg-prod-01.internal | 5432 |
| User Service | users_db | PostgreSQL 15 | pg-prod-02.internal | 5432 |
| Analytics | analytics_db | ClickHouse | ch-prod-01.internal | 8123 |
| Cache | - | Redis 7.2 | redis-prod.internal | 6379 |

## Connecting to Databases

### Prerequisites
- Must be connected to VPN
- Must have database access granted (request via IT Service Desk)
- Use the read replica for queries — never query the primary directly

### Connection Examples

```bash
# PostgreSQL (read replica)
psql -h pg-prod-01-replica.internal -U readonly -d payments_db

# ClickHouse
clickhouse-client --host ch-prod-01.internal --user analyst --password
```

## Common Operations

### Check Database Size
```sql
-- PostgreSQL
SELECT pg_database_size('payments_db') / 1024 / 1024 AS size_mb;

-- ClickHouse
SELECT formatReadableSize(total_bytes) FROM system.tables WHERE database = 'analytics_db';
```

### Check Active Connections
```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
```

### Kill Long-Running Queries
```sql
-- Find queries running longer than 5 minutes
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 minutes';

-- Kill a specific query (requires DBA approval for production)
SELECT pg_cancel_backend(<pid>);
```

## Backup Policy

- **Full backup**: Daily at 3:00 AM SGT
- **WAL archiving**: Continuous (point-in-time recovery)
- **Retention**: 30 days for daily backups, 1 year for monthly snapshots
- **Backup location**: AWS S3 bucket `company-db-backups`
- **Recovery Time Objective (RTO)**: 1 hour
- **Recovery Point Objective (RPO)**: 5 minutes

## Schema Migration

We use **Flyway** for database migrations:

1. Create migration file: `V<version>__<description>.sql`
2. Test on staging: `flyway migrate -url=jdbc:postgresql://pg-staging.internal/payments_db`
3. Get DBA review for production migrations
4. Deploy to production during the maintenance window (Sunday 2:00–4:00 AM SGT)

### Migration Rules
- Never drop columns in production without a 2-release deprecation period
- Always add new columns as nullable
- Index creation must use `CONCURRENTLY` to avoid table locks
- Data migrations should be separate from schema migrations
