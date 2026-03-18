# API Gateway Design & Operations

## 架构概述

公司使用 Kong Gateway (Enterprise) 作为统一的 API 网关层，所有外部和内部 API 请求都经过网关路由、鉴权和限流。网关部署在 Kubernetes 上，采用多副本高可用架构。

### 部署架构

```
Internet → CloudFront → AWS ALB → Kong Gateway (6 pods) → Backend Services
                                       ↓
Internal Services → NLB (internal) → Kong Gateway → Backend Services
```

### 基础配置

| 参数 | 值 |
|------|-----|
| Kong 版本 | 3.5 Enterprise |
| 部署方式 | Kubernetes (Helm Chart) |
| 副本数 | 6 (跨 3 个 AZ) |
| 数据库 | PostgreSQL 15 (RDS) |
| 缓存 | Redis 7 (ElastiCache) |
| Admin API | https://kong-admin.internal.company.com |
| Manager UI | https://kong-manager.internal.company.com |

## 路由管理

### 路由命名规范

所有路由遵循统一命名规范：`{version}-{service}-{resource}`

示例：
- `v1-payment-transactions`: 支付交易 API
- `v1-user-profiles`: 用户资料 API
- `v2-order-management`: 订单管理 API (V2)

### 核心路由表

| 路由 | 上游服务 | 路径 | 方法 | 认证 | 限流 |
|------|---------|------|------|------|------|
| v1-payment-transactions | payment-service:8080 | /api/v1/payments/** | GET, POST | JWT + API Key | 100 req/s |
| v1-payment-webhooks | payment-service:8080 | /api/v1/webhooks/payment | POST | HMAC | 500 req/s |
| v1-user-profiles | user-service:8080 | /api/v1/users/** | GET, PUT, PATCH | JWT | 200 req/s |
| v1-user-auth | auth-service:8080 | /api/v1/auth/** | POST | None (public) | 50 req/s |
| v1-order-management | order-service:8080 | /api/v1/orders/** | ALL | JWT | 150 req/s |
| v1-analytics-events | analytics-service:8080 | /api/v1/events | POST | API Key | 1000 req/s |
| v1-file-upload | file-service:8080 | /api/v1/files/** | GET, POST | JWT | 20 req/s |
| internal-health | all services | /internal/health | GET | mTLS | No limit |

### 路由配置示例

通过 Kong decK (declarative configuration) 管理路由：

```yaml
_format_version: "3.0"
services:
  - name: payment-service
    url: http://payment-service.team-payment.svc.cluster.local:8080
    connect_timeout: 5000
    read_timeout: 30000
    write_timeout: 30000
    retries: 3
    routes:
      - name: v1-payment-transactions
        paths:
          - /api/v1/payments
        methods:
          - GET
          - POST
        strip_path: false
        plugins:
          - name: jwt
            config:
              claims_to_verify:
                - exp
                - iss
          - name: rate-limiting
            config:
              minute: 6000
              policy: redis
              redis_host: redis-kong.shared-infra.svc.cluster.local
          - name: request-transformer
            config:
              add:
                headers:
                  - "X-Request-ID:$(uuid)"
                  - "X-Forwarded-Service:payment"
```

## 认证与授权

### 认证方式

Kong 支持多种认证方式，根据 API 类型选择：

**1. JWT 认证（用户端 API）**

用于移动端和 Web 端用户请求：
- 用户登录后获取 JWT Token（由 auth-service 签发）
- Token 有效期 1 小时，Refresh Token 有效期 7 天
- Kong 验证 JWT 签名和过期时间
- 验证通过后将用户信息注入 `X-Consumer-Id` 和 `X-Consumer-Custom-Id` Header

**2. API Key 认证（第三方集成）**

用于外部合作伙伴 API 调用：
- 通过 Kong Manager 创建 API Key
- 每个 Partner 分配独立的 Key 和限流额度
- Key 通过 `X-API-Key` Header 传递
- 支持 Key 轮转（同时激活新旧 Key，过渡期 7 天）

**3. HMAC 认证（Webhook 回调）**

用于支付网关、第三方服务的 Webhook 回调：
- 请求方使用 shared secret 计算请求体的 HMAC-SHA256 签名
- Kong 验证签名有效性
- 防止 Webhook 重放攻击（带 timestamp 校验，5 分钟窗口）

**4. mTLS 认证（内部服务间通信）**

用于微服务间的安全通信：
- 每个服务持有独立的 TLS 客户端证书
- Kong 验证客户端证书的 CA 签名
- 证书由 cert-manager 自动签发和轮转

### 授权策略

Kong 在认证通过后，通过 OPA (Open Policy Agent) 插件执行细粒度授权：

```rego
package kong.authz

default allow = false

# 普通用户只能访问自己的数据
allow {
    input.consumer.role == "user"
    input.request.method == "GET"
    input.request.path == concat("/", ["api", "v1", "users", input.consumer.id])
}

# 管理员可以访问所有用户数据
allow {
    input.consumer.role == "admin"
    startswith(input.request.path, "/api/v1/users")
}

# 支付操作需要额外的 2FA 验证
allow {
    input.request.method == "POST"
    startswith(input.request.path, "/api/v1/payments")
    input.consumer.mfa_verified == true
}
```

## 限流策略

### 全局限流

| 层级 | 策略 | 配置 |
|------|------|------|
| IP 级别 | 防 DDoS | 1000 req/min per IP |
| Consumer 级别 | 防滥用 | 取决于 Consumer 级别 |
| Route 级别 | 保护后端 | 每个 Route 独立配置 |

### Consumer 级别限流

| Consumer 级别 | Rate Limit | Burst | 并发连接 |
|--------------|------------|-------|---------|
| Free Tier | 60 req/min | 10 | 5 |
| Standard | 600 req/min | 50 | 20 |
| Premium | 6000 req/min | 200 | 100 |
| Internal | 60000 req/min | 1000 | 500 |

### 限流响应

当请求被限流时，Kong 返回 `429 Too Many Requests`，并附带以下 Header：

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit-Minute: 600
X-RateLimit-Remaining-Minute: 0
Retry-After: 12
```

客户端应根据 `Retry-After` Header 实现指数退避重试。

## 插件配置

### 常用插件列表

| 插件 | 用途 | 作用范围 |
|------|------|---------|
| jwt | JWT 认证 | Route 级别 |
| key-auth | API Key 认证 | Route 级别 |
| rate-limiting | 请求限流 | Route/Consumer 级别 |
| request-transformer | 请求头注入/修改 | Route 级别 |
| response-transformer | 响应头修改 | Global |
| cors | 跨域配置 | Global |
| ip-restriction | IP 黑白名单 | Route 级别 |
| bot-detection | 机器人检测 | Global |
| prometheus | 监控指标暴露 | Global |
| zipkin | 分布式追踪 | Global |
| request-size-limiting | 请求体大小限制 | Route 级别 |
| proxy-cache | 响应缓存 | Route 级别 |

### CORS 全局配置

```yaml
plugins:
  - name: cors
    config:
      origins:
        - "https://app.company.com"
        - "https://admin.company.com"
        - "https://partner-portal.company.com"
      methods:
        - GET
        - POST
        - PUT
        - PATCH
        - DELETE
        - OPTIONS
      headers:
        - Accept
        - Authorization
        - Content-Type
        - X-API-Key
        - X-Request-ID
      credentials: true
      max_age: 3600
```

## 监控与可观测性

### 核心指标

Kong 通过 Prometheus 插件暴露以下指标：

| 指标 | 描述 | 告警阈值 |
|------|------|---------|
| `kong_http_requests_total` | 请求总数 | - |
| `kong_request_latency_ms` | 请求延迟 | P99 > 3000ms → P1 |
| `kong_upstream_latency_ms` | 上游服务延迟 | P99 > 2000ms → P1 |
| `kong_http_status` | HTTP 状态码分布 | 5xx > 5% → P0 |
| `kong_bandwidth_bytes` | 带宽使用 | > 1Gbps → P2 |
| `kong_connections_active` | 活跃连接数 | > 10000 → P1 |

### Grafana 看板

- **Kong Overview** (`/d/kong-overview`): QPS、延迟、错误率总览
- **Kong Routes** (`/d/kong-routes`): 各路由级别的详细指标
- **Kong Consumers** (`/d/kong-consumers`): 各 Consumer 的使用情况
- **Kong Upstream Health** (`/d/kong-upstream`): 上游服务健康状态

### 日志

Kong 访问日志发送到 EFK 栈：

```json
{
  "request": {
    "uri": "/api/v1/payments",
    "method": "POST",
    "size": 256,
    "headers": {"X-Request-ID": "abc-123"}
  },
  "response": {
    "status": 200,
    "size": 128,
    "latency": 45
  },
  "route": "v1-payment-transactions",
  "service": "payment-service",
  "consumer": {"id": "user-456", "custom_id": "partner-xyz"},
  "started_at": 1710000000000
}
```

## 常见运维操作

### 添加新路由

1. 在 `kong-config` 仓库中添加路由定义
2. 创建 PR，由 Platform Team review
3. PR 合并后，CI 自动通过 `deck sync` 同步到 Kong
4. 验证路由生效：`curl -I https://api.company.com/new-route`

### 创建新 Consumer

```bash
# 创建 Consumer
curl -X POST http://kong-admin:8001/consumers \
  -d "username=partner-acme" \
  -d "custom_id=acme-corp"

# 为 Consumer 分配 API Key
curl -X POST http://kong-admin:8001/consumers/partner-acme/key-auth \
  -d "key=acme-api-key-2024"

# 设置 Consumer 级别限流
curl -X POST http://kong-admin:8001/consumers/partner-acme/plugins \
  -d "name=rate-limiting" \
  -d "config.minute=600" \
  -d "config.policy=redis"
```

### 紧急限流

当检测到异常流量时，可以通过以下方式紧急限流：

```bash
# 按 IP 封禁
curl -X POST http://kong-admin:8001/routes/v1-payment-transactions/plugins \
  -d "name=ip-restriction" \
  -d "config.deny=203.0.113.0/24"

# 降低全局限流
curl -X PATCH http://kong-admin:8001/plugins/{rate-limiting-plugin-id} \
  -d "config.minute=100"
```

### 故障排查

```bash
# 检查 Kong 状态
curl http://kong-admin:8001/status

# 检查路由是否生效
curl http://kong-admin:8001/routes

# 检查上游服务健康
curl http://kong-admin:8001/upstreams/payment-service/health

# 查看 Kong 错误日志
kubectl logs -l app=kong -n shared-infra --tail=100

# 测试路由（绕过外部 DNS）
curl -H "Host: api.company.com" http://kong-proxy:8000/api/v1/payments
```
