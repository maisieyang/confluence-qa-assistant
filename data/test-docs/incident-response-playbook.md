# Incident Response Playbook

## 概述

本手册定义了公司在面对生产环境安全事件和严重故障时的标准响应流程。所有 on-call 工程师和 SRE 团队成员必须熟悉本手册内容。

## 事件分级

### 严重等级定义

| 等级 | 定义 | 影响范围 | 响应时间 | 示例 |
|------|------|---------|---------|------|
| SEV-1 (Critical) | 系统完全不可用或数据泄露 | 所有用户 | 5 分钟内响应 | 全站宕机、支付系统瘫痪、数据库主节点故障、数据泄露 |
| SEV-2 (Major) | 核心功能严重降级 | 大部分用户 | 15 分钟内响应 | 支付成功率下降 50%、API 延迟 > 10s、部分区域不可用 |
| SEV-3 (Minor) | 非核心功能异常 | 部分用户 | 1 小时内响应 | 报表延迟、邮件通知失败、管理后台部分功能不可用 |
| SEV-4 (Low) | 轻微异常 | 少量用户 | 下一工作日 | UI 显示异常、非关键日志错误、性能轻微下降 |

### 升级条件

| 从 | 升级到 | 触发条件 |
|----|--------|---------|
| SEV-3 | SEV-2 | 影响范围扩大到 > 30% 用户，或持续 > 2 小时未缓解 |
| SEV-2 | SEV-1 | 核心功能完全不可用，或数据一致性受影响 |
| 任意 | SEV-1 | 确认存在数据泄露或安全入侵 |

## SEV-1 响应流程

### 第一阶段：确认与通报 (0-5 分钟)

1. **确认告警**：收到 PagerDuty 告警后，5 分钟内确认
2. **初步评估**：快速判断影响范围和严重程度
3. **启动 War Room**：在 Slack 创建 incident channel `#inc-YYYYMMDD-简短描述`
4. **通报**：在 `#incidents` 频道发布：

```
🚨 SEV-1 Incident Declared
Impact: [描述影响]
Status: Investigating
Incident Commander: @[your_name]
War Room: #inc-20240315-payment-outage
```

5. **召集响应团队**：通过 PagerDuty 升级通知以下角色：
   - Incident Commander (IC)：协调整体响应
   - Technical Lead (TL)：负责技术调查和修复
   - Communications Lead (CL)：负责内外部沟通
   - 相关服务 Owner

### 第二阶段：调查与诊断 (5-30 分钟)

Incident Commander 职责：
1. 确保 War Room 中所有角色到位
2. 每 10 分钟要求 Technical Lead 更新调查进展
3. 记录时间线和关键决策
4. 决定是否需要更多资源

Technical Lead 职责：
1. 检查监控看板，定位异常指标
2. 检查最近的部署和配置变更
3. 查看错误日志和链路追踪
4. 排查基础设施状态（节点、网络、数据库）

Communications Lead 职责：
1. 每 15 分钟更新 `#incidents` 频道
2. 通知 Customer Success 团队
3. 准备状态页面更新 (https://status.company.com)
4. 如果影响外部客户，草拟客户通知邮件

### 调查清单

按以下顺序排查：

**1. 近期变更**
- 最近 2 小时是否有部署？ → 检查 ArgoCD 部署历史
- 是否有配置变更？ → 检查 ConfigMap/Secret 变更记录
- 是否有基础设施变更？ → 检查 Terraform apply 记录
- 是否有 Feature Flag 变更？ → 检查 LaunchDarkly 变更日志

**2. 基础设施**
- Kubernetes 节点状态是否正常？ → `kubectl get nodes`
- 是否有 Pod 异常重启？ → Grafana Pod Restart Tracker
- 数据库是否健康？ → 检查 RDS Performance Insights
- Redis 是否可用？ → 检查 ElastiCache 指标
- Kafka 是否正常？ → 检查 Kafka Manager 和 consumer lag

**3. 网络**
- DNS 解析是否正常？ → `dig api.company.com`
- SSL 证书是否有效？ → 检查 cert-manager 状态
- CDN 是否正常？ → 检查 CloudFront 指标
- 网关（Kong）是否健康？ → 检查 Kong 状态和错误日志

**4. 外部依赖**
- 第三方支付网关状态 → 检查 Stripe/Adyen status page
- AWS 服务状态 → 检查 AWS Health Dashboard
- CDN 提供商状态 → 检查 CloudFront/CloudFlare status

### 第三阶段：缓解与修复 (30 分钟 - 数小时)

常见缓解策略（按优先级排列）：

**回滚部署**
```bash
# ArgoCD 回滚
argocd app rollback payment-service

# Kubernetes 回滚
kubectl rollout undo deployment/payment-service -n team-payment

# Feature Flag 关闭
# 通过 LaunchDarkly UI 或 API 关闭相关 Flag
```

**扩容资源**
```bash
# 手动扩容 Pod
kubectl scale deployment payment-service -n team-payment --replicas=20

# 触发节点扩容
# Karpenter 会自动处理，但可以手动添加节点组
```

**流量管理**
```bash
# 启用降级模式（返回缓存数据）
kubectl set env deployment/payment-service DEGRADED_MODE=true -n team-payment

# 限制流量
curl -X PATCH http://kong-admin:8001/plugins/{rate-limiting-id} \
  -d "config.minute=100"

# 切换到备用服务
kubectl patch service payment-service -n team-payment \
  -p '{"spec":{"selector":{"version":"stable"}}}'
```

**数据库操作**
```bash
# 故障转移到只读副本
# 通过 RDS console 执行 failover

# 终止长查询
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '5 minutes';"
```

### 第四阶段：确认恢复 (恢复后 30 分钟)

1. 确认所有监控指标恢复正常
2. 确认用户可以正常使用受影响功能
3. 确认没有残留的错误日志
4. 在 `#incidents` 频道宣布事件解决：

```
✅ SEV-1 Incident Resolved
Duration: [X hours Y minutes]
Impact: [总结影响]
Root Cause: [初步根因]
Post-Mortem: Will be scheduled within 3 business days
```

5. 更新状态页面为 "Resolved"

## SEV-2 响应流程

与 SEV-1 类似，但有以下区别：
- 不需要创建独立的 War Room，在 `#incidents` 频道协作即可
- 沟通频率降低到每 30 分钟更新一次
- 不需要 Communications Lead，由 IC 兼任
- 通常不需要状态页面更新（除非客户可感知）

## Post-Mortem 流程

### 时间要求

| 事件等级 | Post-Mortem 完成时限 | 审查会议时限 |
|---------|---------------------|-------------|
| SEV-1 | 3 个工作日 | 5 个工作日 |
| SEV-2 | 5 个工作日 | 10 个工作日 |
| SEV-3 | 可选 | 可选 |

### Post-Mortem 模板

```markdown
# Post-Mortem: [事件标题]

## 概要
- **日期**: YYYY-MM-DD
- **严重等级**: SEV-X
- **持续时间**: X hours Y minutes
- **影响**: [受影响的用户数/请求数/收入]
- **Incident Commander**: @name
- **Post-Mortem Author**: @name

## 时间线
- HH:MM — [事件描述]
- HH:MM — [事件描述]

## 根因分析
[详细描述根本原因，使用 5 Whys 分析法]

## 影响评估
- 受影响用户数: X
- 失败请求数: X
- 收入影响: $X

## 做得好的方面
1. [例：告警及时触发]
2. [例：团队快速响应]

## 需要改进的方面
1. [例：监控覆盖不足]
2. [例：回滚流程太慢]

## Action Items
| 编号 | 行动项 | Owner | 优先级 | 截止日期 |
|------|--------|-------|--------|---------|
| AI-1 | [描述] | @name | P0/P1/P2 | YYYY-MM-DD |
```

### Post-Mortem 文化

- **无指责 (Blameless)**：Post-Mortem 的目的是改进系统，不是追究个人责任
- **聚焦系统**：分析为什么系统允许错误发生，而不是谁犯了错误
- **可执行的 Action Items**：每个改进点必须有明确的 Owner 和截止日期
- **知识共享**：Post-Mortem 文档存储在 Confluence，每月进行跨团队 Review

## 联系方式

### 升级路径

| 角色 | 姓名 | 联系方式 | 何时联系 |
|------|------|---------|---------|
| On-Call Primary | PagerDuty rotation | PagerDuty | 所有告警 |
| On-Call Secondary | PagerDuty rotation | PagerDuty | Primary 无响应 10 分钟 |
| Engineering Manager | Team Lead | Slack/Phone | SEV-1/SEV-2 |
| VP of Engineering | Alex Chen | Slack/Phone | SEV-1 超过 1 小时 |
| CTO | David Wang | Phone only | SEV-1 涉及数据泄露 |

### 外部联系人

| 服务商 | 用途 | 支持渠道 | SLA |
|--------|------|---------|-----|
| AWS | 基础设施 | Support Console (Enterprise) | 15 min (Critical) |
| Stripe | 支付处理 | support@stripe.com + Slack | 1 hour |
| CloudFlare | CDN/DDoS | Enterprise Dashboard | 30 min |
| PagerDuty | 告警路由 | support@pagerduty.com | 4 hours |
