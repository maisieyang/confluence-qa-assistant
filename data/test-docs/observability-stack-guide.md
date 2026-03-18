# Observability Stack Guide

## 概述

公司的可观测性平台基于三大支柱构建：Metrics（指标）、Logs（日志）、Traces（链路追踪），为所有生产服务提供全方位的运行时可见性。本指南涵盖各组件的使用方法、最佳实践和常见问题排查。

## Metrics（指标）

### Prometheus + Thanos 架构

```
Service Pods → Prometheus (per-cluster) → Thanos Sidecar → Thanos Store → S3
                                              ↓
                                        Thanos Query ← Grafana
```

- **Prometheus**: 每个 Kubernetes 集群部署独立的 Prometheus 实例，保留 15 天本地数据
- **Thanos Sidecar**: 将 Prometheus 数据上传到 S3 进行长期存储
- **Thanos Query**: 跨集群联邦查询入口
- **Thanos Compactor**: 后台压缩和降采样历史数据（1 小时 → 5 分钟 → 1 小时粒度）
- **存储保留期**: 原始粒度 30 天，5 分钟粒度 6 个月，1 小时粒度 2 年

### 自定义指标采集

服务需要暴露 Prometheus 格式的 `/metrics` 端点。使用 Prometheus 客户端库：

**Node.js (prom-client)**:
```typescript
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

const registry = new Registry();

// 请求计数器
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

// 请求延迟直方图
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// 业务指标示例
const activeOrders = new Gauge({
  name: 'active_orders_count',
  help: 'Number of currently active orders',
  registers: [registry],
});

// 在请求处理中使用
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method, path: req.route?.path });
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path, status: res.statusCode });
    end();
  });
  next();
});
```

**Go (prometheus/client_golang)**:
```go
var (
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )
    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration in seconds",
            Buckets: prometheus.DefBuckets,
        },
        []string{"method", "path"},
    )
)
```

### 指标命名规范

遵循 Prometheus 命名约定：

| 类型 | 格式 | 示例 |
|------|------|------|
| Counter | `{namespace}_{name}_total` | `payment_transactions_total` |
| Histogram | `{namespace}_{name}_seconds` | `payment_processing_duration_seconds` |
| Gauge | `{namespace}_{name}` | `payment_pending_count` |
| Summary | `{namespace}_{name}` | `payment_amount_summary` |

Label 命名规范：
- 使用小写字母和下划线
- 避免高基数 label（如 user_id、request_id）— 会导致指标爆炸
- 常用 label: `service`, `method`, `status`, `environment`

### 常用 PromQL 查询

```promql
# 服务 QPS
rate(http_requests_total{service="payment-service"}[5m])

# P99 延迟
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="payment-service"}[5m]))

# 错误率
sum(rate(http_requests_total{service="payment-service", status=~"5.."}[5m]))
/ sum(rate(http_requests_total{service="payment-service"}[5m])) * 100

# CPU 使用率（按 Pod）
rate(container_cpu_usage_seconds_total{namespace="team-payment", pod=~"payment-service.*"}[5m])

# 内存使用率
container_memory_working_set_bytes{namespace="team-payment", pod=~"payment-service.*"}
/ container_spec_memory_limit_bytes * 100
```

## Logs（日志）

### EFK Stack 架构

```
Application Pods → Fluentd (DaemonSet) → Elasticsearch → Kibana
                                              ↑
                     Fluentd (Aggregator) ← Kafka (buffer)
```

- **Fluentd DaemonSet**: 每个节点运行，收集容器 stdout/stderr 日志
- **Kafka Buffer**: 削峰填谷，防止 Elasticsearch 被日志洪峰压垮
- **Fluentd Aggregator**: 从 Kafka 消费日志，进行解析、过滤、enrichment
- **Elasticsearch**: 6 节点集群（3 master + 3 data），日志保留 30 天
- **Kibana**: 日志查询和可视化

### 日志格式标准

所有服务必须使用 JSON 格式输出日志：

```json
{
  "timestamp": "2024-03-15T10:30:45.123Z",
  "level": "info",
  "message": "Payment processed successfully",
  "service": "payment-service",
  "traceId": "abc123def456",
  "spanId": "789ghi",
  "requestId": "req-001",
  "userId": "user-12345",
  "data": {
    "paymentId": "pay-67890",
    "amount": 99.99,
    "currency": "SGD",
    "method": "credit_card"
  }
}
```

必须包含的字段：
- `timestamp`: ISO 8601 格式
- `level`: trace / debug / info / warn / error / fatal
- `message`: 人类可读的描述
- `service`: 服务名称
- `traceId`: 分布式追踪 ID（与 Jaeger 关联）
- `requestId`: 请求唯一标识

### 日志级别规范

| 级别 | 用途 | 生产环境 | 示例 |
|------|------|---------|------|
| trace | 极详细的调试信息 | 关闭 | 函数入参出参 |
| debug | 调试信息 | 默认关闭 | SQL 查询、缓存命中/未命中 |
| info | 正常业务流程 | 开启 | 请求处理完成、用户登录 |
| warn | 异常但可自恢复 | 开启 | 重试、降级、缓存未命中 |
| error | 需要关注的错误 | 开启 | 请求失败、外部服务不可用 |
| fatal | 服务即将崩溃 | 开启 | 致命配置错误、OOM |

生产环境默认日志级别为 `info`，可通过环境变量 `LOG_LEVEL` 动态调整。

### Kibana 常用查询

```
# 查看某服务的错误日志
service: "payment-service" AND level: "error"

# 按 traceId 查看请求链路
traceId: "abc123def456"

# 查看特定时间段的支付失败
service: "payment-service" AND message: "Payment failed" AND @timestamp >= "2024-03-15T10:00:00" AND @timestamp <= "2024-03-15T11:00:00"

# 查看慢查询日志
service: "payment-service" AND data.duration_ms > 5000
```

Kibana URL: https://kibana.internal.company.com

### 日志告警

通过 Elasticsearch Watcher 配置日志告警：

| 告警规则 | 条件 | 通知 |
|---------|------|------|
| Error Spike | error 日志 > 100条/分钟 | Slack #alerts-errors |
| Fatal Log | 出现 fatal 级别日志 | PagerDuty |
| Auth Failure Spike | 认证失败 > 50次/分钟 | Slack #security-alerts |
| Slow Query | 数据库查询 > 10s | Slack #alerts-performance |

## Traces（链路追踪）

### Jaeger 架构

```
Application (OpenTelemetry SDK) → OTLP Collector → Jaeger Collector → Elasticsearch → Jaeger Query → Jaeger UI
```

### OpenTelemetry 集成

所有服务必须集成 OpenTelemetry SDK：

**Node.js**:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector.shared-infra.svc.cluster.local:4317',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
    new RedisInstrumentation(),
  ],
  serviceName: 'payment-service',
});

sdk.start();
```

### 自定义 Span

在关键业务逻辑中添加自定义 Span：

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('payment-service');

async function processPayment(paymentId: string, amount: number) {
  return tracer.startActiveSpan('processPayment', async (span) => {
    span.setAttributes({
      'payment.id': paymentId,
      'payment.amount': amount,
      'payment.currency': 'SGD',
    });

    try {
      // 风控检查
      await tracer.startActiveSpan('fraudCheck', async (fraudSpan) => {
        const result = await fraudService.check(paymentId);
        fraudSpan.setAttribute('fraud.score', result.score);
        fraudSpan.end();
      });

      // 调用支付网关
      await tracer.startActiveSpan('gatewayCharge', async (gatewaySpan) => {
        const result = await paymentGateway.charge(amount);
        gatewaySpan.setAttribute('gateway.transactionId', result.id);
        gatewaySpan.end();
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 采样策略

| 环境 | 采样率 | 说明 |
|------|--------|------|
| Development | 100% | 全量采样 |
| Staging | 100% | 全量采样 |
| Production | 1% (base) | 基础采样率 |
| Production (error) | 100% | 错误请求全量采样 |
| Production (slow) | 100% | 延迟 > 1s 的请求全量采样 |

Jaeger UI: https://jaeger.internal.company.com

## Grafana 看板管理

### 看板命名规范

- `{team}-{service}-overview`: 服务总览看板
- `{team}-{service}-detail`: 服务详细看板
- `{function}-{description}`: 功能性看板

### 核心看板列表

| 看板 | 路径 | 用途 | Owner |
|------|------|------|-------|
| Platform Overview | `/d/platform-overview` | 全平台健康状态 | SRE |
| Service Health | `/d/service-health` | 各服务 RED 指标 | SRE |
| Kubernetes Cluster | `/d/k8s-cluster` | K8s 集群资源 | SRE |
| Payment Dashboard | `/d/payment-overview` | 支付服务详情 | Payment Team |
| User Service | `/d/user-overview` | 用户服务详情 | User Team |
| Data Pipeline | `/d/data-pipeline` | 数据管道健康 | Analytics Team |
| ML Models | `/d/ml-models` | ML 模型指标 | ML Team |
| On-Call Overview | `/d/oncall-overview` | 值班看板 | SRE |

### 看板即代码

所有 Grafana 看板通过 Grafonnet (Jsonnet) 定义，存储在 `monitoring-config` Git 仓库中：

```
monitoring-config/
├── dashboards/
│   ├── platform/
│   │   ├── overview.jsonnet
│   │   └── service-health.jsonnet
│   ├── payment/
│   │   └── overview.jsonnet
│   └── ...
├── alerts/
│   ├── infrastructure.yaml
│   ├── payment.yaml
│   └── ...
└── recording-rules/
    ├── sli.yaml
    └── aggregation.yaml
```

变更流程：
1. 在 `monitoring-config` 仓库修改看板定义
2. CI 自动渲染 Jsonnet 为 JSON 并验证
3. PR 合并后，GrafanaTerraform Provider 自动部署到 Grafana

## SLI/SLO 管理

### 核心服务 SLO

| 服务 | SLI | SLO 目标 | 当前值 | Error Budget |
|------|-----|---------|--------|-------------|
| API Gateway | 可用性 (非 5xx 比例) | 99.95% | 99.98% | 剩余 72% |
| Payment Service | 成功率 | 99.9% | 99.92% | 剩余 20% |
| Payment Service | P99 延迟 | < 500ms | 320ms | N/A |
| User Service | 可用性 | 99.95% | 99.99% | 剩余 89% |
| Order Service | 可用性 | 99.95% | 99.97% | 剩余 55% |

### Error Budget 策略

当 Error Budget 消耗超过阈值时：

| Error Budget 剩余 | 行动 |
|-------------------|------|
| > 50% | 正常迭代，允许新功能部署 |
| 25-50% | 谨慎部署，优先修复可靠性问题 |
| 10-25% | 冻结非关键部署，全力修复 |
| < 10% | 全面冻结部署，仅允许可靠性修复 |
