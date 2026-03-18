# Kubernetes Operations Guide

## 集群概览

公司目前运行三套 Kubernetes 集群，分别服务于不同环境：

| 集群名称 | 环境 | 版本 | 节点数 | 区域 | 用途 |
|---------|------|------|--------|------|------|
| k8s-prod-sg | Production | 1.28 | 48 | ap-southeast-1 | 生产工作负载 |
| k8s-staging-sg | Staging | 1.28 | 12 | ap-southeast-1 | 预发布验证 |
| k8s-dev-sg | Development | 1.29 | 8 | ap-southeast-1 | 开发与功能测试 |

所有集群托管在 AWS EKS 上，使用 Karpenter 进行节点自动伸缩。生产集群采用多可用区部署（3 AZ），确保高可用。

### 节点池配置

生产集群使用三种节点池：

- **general-pool**: `m6i.2xlarge` (8 vCPU / 32 GB)，运行大部分 stateless 服务，当前 32 节点
- **memory-pool**: `r6i.2xlarge` (8 vCPU / 64 GB)，运行 Redis、Elasticsearch 等内存密集型服务，当前 8 节点
- **gpu-pool**: `g5.xlarge` (4 vCPU / 16 GB / 1 A10G GPU)，运行 ML inference 服务，当前 8 节点，按需扩缩

## 命名空间管理

### 命名空间规范

每个团队拥有独立的命名空间，命名格式为 `team-{team_name}`：

| 命名空间 | 团队 | 资源配额 (CPU/Memory) | Pod 限制 |
|----------|------|----------------------|----------|
| team-payment | Payment Team | 32 cores / 64 Gi | 200 |
| team-user | User Team | 24 cores / 48 Gi | 150 |
| team-analytics | Analytics Team | 48 cores / 128 Gi | 300 |
| team-ml | ML Team | 16 cores / 32 Gi + 8 GPU | 100 |
| team-platform | Platform Team | 64 cores / 128 Gi | 400 |
| shared-infra | SRE | 无限制 | 无限制 |

### 创建新命名空间

新团队需要通过 Terraform PR 创建命名空间，模板位于 `infra/terraform/k8s-namespaces/`：

```hcl
module "team_newteam" {
  source         = "../modules/k8s-namespace"
  name           = "team-newteam"
  team_label     = "newteam"
  cpu_limit      = "16"
  memory_limit   = "32Gi"
  pod_limit      = 100
  network_policy = "standard"
}
```

合并 PR 后，CI/CD 自动通过 Terraform Apply 创建命名空间和关联的 ResourceQuota、LimitRange、NetworkPolicy。

## 部署管理

### GitOps 工作流

所有部署通过 ArgoCD 管理，采用 GitOps 模式：

1. 开发者在 `k8s-manifests` 仓库中修改 Helm values 或 Kustomize overlay
2. 创建 PR 并通过 code review
3. PR 合并后，ArgoCD 自动检测变更并同步到目标集群
4. 同步完成后，ArgoCD 执行 health check 确认部署成功

ArgoCD Dashboard: https://argocd.internal.company.com

### Helm Chart 标准

所有服务必须使用公司标准 Helm Chart `company-service-chart` (v3.2.0+)，该 Chart 内置了以下最佳实践：

- **Pod Disruption Budget**: 保证滚动更新时至少 50% 的 Pod 可用
- **Topology Spread Constraints**: 跨 AZ 分散 Pod，避免单点故障
- **Resource Requests/Limits**: 必须设置，否则准入控制器会拒绝部署
- **Health Probes**: 必须配置 liveness 和 readiness probe
- **Service Account**: 每个服务独立的 SA，遵循最小权限原则
- **Security Context**: 默认以非 root 用户运行，禁止特权模式

标准 values.yaml 示例：

```yaml
replicaCount: 3
image:
  repository: 123456789.dkr.ecr.ap-southeast-1.amazonaws.com/payment-service
  tag: "v2.5.1"
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1024Mi
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilization: 70
  targetMemoryUtilization: 80
probes:
  liveness:
    path: /health/live
    initialDelay: 15
  readiness:
    path: /health/ready
    initialDelay: 5
ingress:
  enabled: true
  host: payment-api.internal.company.com
  tls: true
```

### 金丝雀发布

对于核心服务（Payment、User、Order），推荐使用 Argo Rollouts 进行金丝雀发布：

1. **阶段一 (5%)**: 将 5% 流量路由到新版本，持续观察 10 分钟
2. **阶段二 (25%)**: 如果错误率 < 0.1%，扩大到 25%，观察 15 分钟
3. **阶段三 (50%)**: 扩大到 50%，观察 15 分钟
4. **阶段四 (100%)**: 全量发布

自动回滚条件：
- 5xx 错误率 > 1%
- P99 延迟 > 2000ms
- Pod 重启次数 > 3

## 监控与告警

### 监控栈

| 组件 | 工具 | 用途 | 访问地址 |
|------|------|------|---------|
| Metrics | Prometheus + Thanos | 指标采集与长期存储 | https://prometheus.internal.company.com |
| Dashboard | Grafana | 可视化看板 | https://grafana.internal.company.com |
| Logging | EFK (Elasticsearch + Fluentd + Kibana) | 日志采集与查询 | https://kibana.internal.company.com |
| Tracing | Jaeger | 分布式链路追踪 | https://jaeger.internal.company.com |
| Alerting | PagerDuty + Grafana Alerting | 告警路由与通知 | https://company.pagerduty.com |

### 核心指标看板

Grafana 中的关键看板：

- **Cluster Overview** (`/d/cluster-overview`): 集群资源使用率、节点状态、Pod 分布
- **Service Health** (`/d/service-health`): 各服务的 QPS、延迟、错误率、饱和度
- **Node Resources** (`/d/node-resources`): 节点级别 CPU/Memory/Disk/Network 使用
- **Pod Restart Tracker** (`/d/pod-restarts`): 追踪异常重启的 Pod

### 告警规则

生产环境的核心告警规则：

| 告警名称 | 条件 | 严重级别 | 通知方式 |
|----------|------|---------|---------|
| HighPodRestarts | Pod 重启次数 > 5 (15min) | P2 | Slack |
| NodeNotReady | 节点 NotReady > 3 分钟 | P1 | PagerDuty |
| HighErrorRate | 5xx 错误率 > 5% (5min) | P0 | PagerDuty + Phone |
| HighLatency | P99 > 3s (5min) | P1 | PagerDuty |
| DiskPressure | 磁盘使用 > 85% | P2 | Slack |
| MemoryPressure | 节点内存使用 > 90% | P1 | PagerDuty |
| CertExpiring | TLS 证书 < 14 天过期 | P2 | Slack + Email |

## 常用运维操作

### 查看 Pod 状态

```bash
# 查看某个命名空间的所有 Pod
kubectl get pods -n team-payment

# 查看 Pod 详细信息（排查 Pending/CrashLoopBackOff）
kubectl describe pod <pod-name> -n team-payment

# 查看 Pod 日志
kubectl logs <pod-name> -n team-payment --tail=100

# 查看前一个容器的日志（CrashLoopBackOff 时有用）
kubectl logs <pod-name> -n team-payment --previous

# 进入 Pod 调试
kubectl exec -it <pod-name> -n team-payment -- /bin/sh
```

### 扩缩容

```bash
# 手动扩容
kubectl scale deployment payment-service -n team-payment --replicas=10

# 查看 HPA 状态
kubectl get hpa -n team-payment

# 临时关闭 HPA（维护窗口使用）
kubectl annotate hpa payment-service -n team-payment autoscaling.alpha.kubernetes.io/paused="true"
```

### 回滚部署

```bash
# 查看部署历史
kubectl rollout history deployment/payment-service -n team-payment

# 回滚到上一版本
kubectl rollout undo deployment/payment-service -n team-payment

# 回滚到指定版本
kubectl rollout undo deployment/payment-service -n team-payment --to-revision=42

# 查看回滚状态
kubectl rollout status deployment/payment-service -n team-payment
```

### 资源排查

```bash
# 查看命名空间资源配额使用情况
kubectl describe resourcequota -n team-payment

# 查看节点资源分配
kubectl top nodes

# 查看 Pod 资源使用
kubectl top pods -n team-payment --sort-by=memory

# 查看事件（排查调度失败等）
kubectl get events -n team-payment --sort-by='.lastTimestamp'
```

## 网络策略

### 默认策略

所有命名空间默认禁止跨命名空间通信（deny-all ingress from other namespaces）。需要跨命名空间访问时，必须显式声明 NetworkPolicy。

### 常见网络策略示例

允许 team-payment 访问 shared-infra 中的 Redis：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-payment-to-redis
  namespace: shared-infra
spec:
  podSelector:
    matchLabels:
      app: redis
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              team: payment
      ports:
        - port: 6379
```

### 外部流量入口

外部流量通过 AWS ALB Ingress Controller 进入，路由规则：

1. 公网流量 → AWS ALB → Ingress → Service → Pod
2. 内部流量 → NLB (internal) → Ingress → Service → Pod
3. gRPC 流量 → NLB (internal, TCP) → Service → Pod

所有公网 Ingress 强制 HTTPS，TLS 证书由 cert-manager 自动管理（Let's Encrypt）。

## 故障排查指南

### Pod 处于 Pending 状态

排查步骤：
1. `kubectl describe pod` 查看 Events，常见原因：
   - **Insufficient resources**: 集群资源不足，检查 Karpenter 是否可以扩容新节点
   - **Unschedulable**: 节点被 cordon 了，检查 `kubectl get nodes` 状态
   - **Volume mount failed**: PVC 绑定失败，检查 StorageClass 和 PV 可用性
   - **Image pull failed**: 镜像拉取失败，检查 ECR 权限和镜像 tag 是否存在

### Pod 处于 CrashLoopBackOff 状态

排查步骤：
1. `kubectl logs <pod> --previous` 查看崩溃前日志
2. 常见原因：
   - **OOMKilled**: 内存超限，增加 `resources.limits.memory`
   - **配置错误**: ConfigMap/Secret 缺失或格式错误
   - **依赖不可用**: 数据库/Redis 连接失败，检查网络策略和服务健康
   - **启动探针失败**: `livenessProbe` 配置过于严格，调整 `initialDelaySeconds`

### 节点 NotReady

排查步骤：
1. `kubectl describe node <node-name>` 查看 Conditions
2. SSH 到节点查看 kubelet 日志：`journalctl -u kubelet -f`
3. 常见原因：
   - **磁盘压力**: Docker 镜像缓存过大，清理 `docker system prune`
   - **内存压力**: 节点 OOM，检查是否有内存泄漏的 Pod
   - **网络问题**: 检查 VPC CNI 插件状态和 ENI 配额

## 安全最佳实践

1. **镜像安全**: 所有镜像必须来自公司 ECR，禁止使用 Docker Hub 公共镜像。CI 中集成 Trivy 扫描，High/Critical 漏洞阻止部署
2. **Secret 管理**: 使用 AWS Secrets Manager + External Secrets Operator 同步 Secret，禁止在 Git 中存储明文 Secret
3. **RBAC**: 遵循最小权限原则，开发者只有 namespace 级别的 view/edit 权限，cluster-admin 仅限 SRE 团队
4. **Pod 安全**: 启用 Pod Security Standards (Restricted profile)，强制非 root 运行、只读根文件系统
5. **审计日志**: EKS 审计日志发送到 CloudWatch Logs，保留 90 天，异常行为触发 GuardDuty 告警
