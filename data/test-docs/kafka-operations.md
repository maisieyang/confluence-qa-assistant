# Kafka Operations Guide

## Cluster Information

| Environment | Brokers | Version | Zookeeper |
|-------------|---------|---------|-----------|
| Production | kafka-prod-{01,02,03}.internal:9092 | 3.6.0 | zk-prod-{01,02,03}.internal:2181 |
| Staging | kafka-staging-01.internal:9092 | 3.6.0 | zk-staging-01.internal:2181 |

## Topic Management

### Creating a New Topic

```bash
kafka-topics.sh --create \
  --bootstrap-server kafka-prod-01.internal:9092 \
  --topic payment.transaction.completed \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=2592000000  # 30 days
```

### Topic Naming Convention
Format: `<service>.<entity>.<event>`

Examples:
- `payment.transaction.completed`
- `user.account.created`
- `notification.email.sent`

## Consumer Group Management

### Check Consumer Lag

```bash
kafka-consumer-groups.sh \
  --bootstrap-server kafka-prod-01.internal:9092 \
  --group settlement-service-processor \
  --describe
```

**Alert threshold**: Consumer lag > 10,000 messages triggers a P2 alert.

### Reset Consumer Offset

```bash
# Reset to latest (skip all pending messages)
kafka-consumer-groups.sh \
  --bootstrap-server kafka-prod-01.internal:9092 \
  --group settlement-service-processor \
  --topic payment.transaction.completed \
  --reset-offsets --to-latest --execute

# Reset to specific timestamp
kafka-consumer-groups.sh \
  --bootstrap-server kafka-prod-01.internal:9092 \
  --group settlement-service-processor \
  --topic payment.transaction.completed \
  --reset-offsets --to-datetime 2025-01-15T00:00:00.000 --execute
```

**Warning**: Resetting offsets on production requires DBA/SRE approval.

## Common Issues

### Consumer Group Rebalance

**Symptoms**: Messages stop being consumed, consumer lag increases rapidly.

**Common causes**:
1. Consumer instance crashed or became unresponsive
2. `session.timeout.ms` too low (default 45s, recommend 60s)
3. `max.poll.interval.ms` exceeded (long processing time)

**Resolution**:
1. Check consumer logs for errors
2. Verify all consumer instances are healthy: `kubectl get pods -l app=settlement-service`
3. If a consumer is stuck, restart the pod: `kubectl delete pod <pod-name>`
4. If rebalance keeps happening, increase `session.timeout.ms` and `max.poll.interval.ms`

### Message Ordering

Kafka guarantees message ordering **within a partition only**. If you need ordered processing:
- Use the same partition key for related messages (e.g., `merchant_id`)
- Set `max.in.flight.requests.per.connection=1` for strict ordering

## Monitoring

- **Kafka Manager**: https://kafka-manager.internal.company.com
- **Grafana Dashboard**: https://grafana.internal.company.com/d/kafka-overview
- **Alert Rules**: Defined in `monitoring-configs` repository
