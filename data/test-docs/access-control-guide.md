# Access Control & Permission Management Guide

## 概述

公司采用基于角色的访问控制 (RBAC) 模型管理所有系统和资源的访问权限。权限管理遵循最小权限原则 (Principle of Least Privilege)，确保每位员工只能访问工作所需的最少资源。

## 身份认证体系

### SSO (Single Sign-On)

所有内部系统通过 Okta SSO 进行统一身份认证：

| 配置 | 详情 |
|------|------|
| IdP | Okta (https://company.okta.com) |
| 协议 | SAML 2.0 / OIDC |
| MFA | 必须开启（Okta Verify 或 YubiKey） |
| 会话时长 | 8 小时（工作日）/ 不自动续期 |
| 密码策略 | 12+ 字符，含大小写+数字+特殊字符，90 天轮换 |

### MFA 要求

| 场景 | MFA 方式 | 频率 |
|------|---------|------|
| 日常登录 | Okta Verify Push | 每日首次 |
| 敏感操作 | Okta Verify + PIN | 每次 |
| VPN 接入 | Okta Verify Push | 每次连接 |
| 生产环境访问 | YubiKey (FIDO2) | 每次 |
| 代码仓库 SSH | SSH Key + Okta | 每日首次 |

### 账号生命周期

| 事件 | 自动化动作 | 时效 |
|------|-----------|------|
| 入职 | 创建 Okta 账号 → 分配基础角色 → 同步 AD/LDAP | 入职当天 |
| 转岗 | 更新角色和组 → 撤销旧权限 → 分配新权限 | 3 个工作日内 |
| 离职 | 禁用 Okta 账号 → 撤销所有访问 → 归档数据 | 离职当天 |
| 长期休假 | 暂停账号（保留配置）→ 返岗后重新激活 | 休假起止日 |

## 角色体系

### 基础角色

每位员工入职时自动分配基础角色：

| 角色 | 权限范围 | 自动分配 |
|------|---------|---------|
| employee | 公司通用系统（邮件、日历、IM、HR 系统） | 是 |
| engineering | 开发工具链（GitHub、Jira、CI/CD 查看） | 工程部门自动 |
| data-viewer | BI 报表查看（Metabase 只读） | 数据相关岗位 |
| on-call | 生产监控查看（Grafana、Kibana 只读） | 进入 on-call 轮值 |

### 工程角色

| 角色 | GitHub | Kubernetes | Database | Kafka | 监控 |
|------|--------|------------|----------|-------|------|
| eng-junior | PR 作者，需 2 人 review | 命名空间 view | 只读副本 | consumer 只读 | Grafana 查看 |
| eng-senior | PR 作者+reviewer，需 1 人 review | 命名空间 edit | 只读副本 + 慢查询 kill | consumer + producer | Grafana 查看+编辑 |
| eng-lead | repo admin | 命名空间 admin | 读写 + DDL | 全部 | Grafana admin |
| sre | org admin | cluster admin | superuser | 全部 + 运维 | 全部 admin |

### 数据角色

| 角色 | Metabase | ClickHouse | S3 Data Lake | Jupyter | Airflow |
|------|----------|------------|-------------|---------|---------|
| data-analyst | 查看+创建看板 | 只读 (L1-L2 数据) | 无 | 无 | 无 |
| data-engineer | 查看 | 读写 (L1-L3 数据) | 读写 | 读写 | 编辑 DAG |
| data-scientist | 查看+创建看板 | 只读 (L1-L3 数据) | 只读 | 读写+GPU | 查看 |
| data-admin | 全部 | superuser | 全部 | 全部 | admin |

## 权限申请流程

### 标准权限申请

1. 登录 HR 系统 (https://hr.internal.company.com) → 权限管理
2. 选择需要的权限/角色
3. 填写申请原因和使用期限
4. 提交后自动路由到审批人

审批矩阵：

| 权限类型 | 审批人 | SLA |
|---------|--------|-----|
| 基础权限（GitHub、Jira） | 直属上级 | 1 个工作日 |
| 数据库只读权限 | 直属上级 + DBA | 2 个工作日 |
| 数据库读写权限 | 直属上级 + DBA + 安全团队 | 3 个工作日 |
| 生产环境 SSH | 直属上级 + SRE Lead + 安全团队 | 3 个工作日 |
| L4 敏感数据访问 | 直属上级 + 数据 Owner + VP | 5 个工作日 |
| Admin 角色 | 直属上级 + 部门负责人 + CTO | 5 个工作日 |

### 紧急权限申请

紧急情况（如生产 incident 需要临时权限）：

1. 在 Slack `#emergency-access` 频道发起请求
2. SRE on-call 可授予临时权限（最长 4 小时）
3. 事后补办正式申请
4. 所有紧急授权记录审计日志

### 临时权限

所有非日常权限默认为临时权限：

| 权限类型 | 默认有效期 | 最长延期 |
|---------|-----------|---------|
| 生产数据库读写 | 24 小时 | 7 天 |
| 生产环境 SSH | 4 小时 | 24 小时 |
| L4 数据访问 | 24 小时 | 3 天 |
| 其他临时权限 | 7 天 | 30 天 |

到期后权限自动撤销，如需继续使用需重新申请。

## 各系统权限管理

### GitHub Enterprise

仓库权限模型：
- **Private** (默认): 仅仓库成员可见
- **Internal**: 公司全员可见，但只有仓库成员可写
- **Public**: 禁止使用（除非经 CTO 审批的开源项目）

分支保护规则（所有服务仓库必须配置）：

```yaml
# main 分支保护
protection_rules:
  main:
    required_reviews: 2          # 至少 2 人 review
    dismiss_stale_reviews: true  # 新提交后已有 review 失效
    require_code_owners: true    # CODEOWNERS 文件指定的 owner 必须 review
    required_status_checks:      # CI 必须通过
      - "lint"
      - "test"
      - "security-scan"
    restrict_pushes: true        # 禁止直接 push，必须通过 PR
    enforce_admins: true         # 管理员也受保护
```

### AWS IAM

遵循多账号策略：

| AWS 账号 | 用途 | 访问方式 |
|---------|------|---------|
| management | 账单和组织管理 | 限 CFO + CTO |
| production | 生产工作负载 | Okta SSO → IAM Role |
| staging | 预发布环境 | Okta SSO → IAM Role |
| development | 开发环境 | Okta SSO → IAM Role |
| security | 安全日志和审计 | 限安全团队 |
| data | 数据平台 | Okta SSO → IAM Role |

IAM Role 命名规范: `{account}-{team}-{permission_level}`
- `production-payment-readonly`
- `production-sre-admin`
- `data-analytics-readwrite`

### Kubernetes RBAC

每个团队命名空间的 RBAC 配置由 Terraform 管理：

```yaml
# team-payment namespace RBAC
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: payment-team-edit
  namespace: team-payment
subjects:
  - kind: Group
    name: okta:team-payment-engineers
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: edit
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: payment-team-view
  namespace: team-payment
subjects:
  - kind: Group
    name: okta:team-payment-members
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io
```

## 权限审计

### 定期审计

| 审计类型 | 频率 | 责任人 | 范围 |
|---------|------|--------|------|
| 季度权限审查 | 每季度 | 各团队 Lead | 本团队成员权限 |
| 半年度特权审计 | 每半年 | 安全团队 | Admin 和特权角色 |
| 年度全面审计 | 每年 | 外部审计 + 安全团队 | 全公司所有权限 |
| 离职审计 | 实时 | HR + IT | 离职员工权限回收 |

### 审计日志

所有权限操作记录审计日志，包括：
- 权限申请和审批记录
- 登录和认证事件
- 生产环境操作记录
- 数据访问记录
- 权限变更记录

审计日志存储在独立的 security AWS 账号中，保留 3 年，不可被非安全团队修改或删除。

### 异常检测

自动化异常检测规则：

| 规则 | 触发条件 | 响应 |
|------|---------|------|
| 异常登录 | 非常用 IP/设备/时间登录 | 要求额外 MFA |
| 暴力破解 | 5 分钟内 10 次失败登录 | 锁定账号 30 分钟 |
| 权限提升 | 非审批流程的权限变更 | 立即告警安全团队 |
| 敏感数据批量导出 | 单次查询返回 > 10000 条 L3/L4 数据 | 告警数据 Owner |
| 非工作时间操作 | 凌晨 0-6 点的生产环境操作 | 记录并次日审查 |

## 常见问题

### 如何查看我当前有哪些权限？

1. 登录 Okta Dashboard → 查看已分配的应用和角色
2. HR 系统 → 权限管理 → 我的权限

### 权限申请被拒绝了怎么办？

1. 查看拒绝原因（通常在审批备注中）
2. 常见拒绝原因：
   - 申请理由不充分 → 补充详细说明
   - 权限超出工作需要 → 申请更小范围的权限
   - 缺少必要的审批人 → 添加审批人后重新提交
3. 如有争议，可升级到部门负责人

### 离职后权限如何处理？

- 离职当天：Okta 账号禁用，所有 SSO 关联系统自动断开
- 离职后 7 天：GitHub 仓库权限移除，个人仓库 fork 转移
- 离职后 30 天：邮箱账号归档，数据保留但不可访问
- 离职后 90 天：个人数据彻底删除（法律要求保留的除外）
