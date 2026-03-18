# CI/CD Pipeline Guide

## 概述

公司使用 GitHub Actions 作为 CI 平台，ArgoCD 作为 CD 平台，形成完整的 GitOps 持续交付流程。所有服务代码托管在 GitHub Enterprise (https://github.company.com)。

### 架构总览

```
Developer → GitHub PR → CI (GitHub Actions) → Container Image → ECR
                                                                  ↓
Production ← ArgoCD Sync ← k8s-manifests PR ← Image Tag Update
```

## CI 流水线

### 标准 CI 流程

每个服务的 CI 流水线由 `.github/workflows/ci.yml` 定义，标准步骤如下：

1. **Lint & Format Check** (~30s)
   - ESLint / golangci-lint / ruff
   - Prettier / gofmt / black
   - 不通过则阻止合并

2. **Unit Tests** (~2-5min)
   - 运行单元测试，要求覆盖率 ≥ 80%
   - 生成覆盖率报告上传到 Codecov
   - 覆盖率下降 > 2% 则阻止合并

3. **Integration Tests** (~5-10min)
   - 使用 Docker Compose 启动依赖服务（PostgreSQL、Redis、Kafka）
   - 运行集成测试套件
   - 测试完成后自动清理容器

4. **Security Scan** (~2min)
   - Trivy 容器镜像扫描
   - Snyk 依赖漏洞扫描
   - Secret scanning (gitleaks)
   - High/Critical 漏洞阻止合并

5. **Build & Push** (~3-5min)
   - 仅在 main 分支触发
   - Docker 多阶段构建
   - 推送到 ECR，tag 格式: `{branch}-{short_sha}-{timestamp}`
   - 同时打 `latest` tag

### CI 配置示例

```yaml
name: CI Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  ECR_REGISTRY: 123456789.dkr.ecr.ap-southeast-1.amazonaws.com
  ECR_REPOSITORY: payment-service

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit -- --coverage
      - run: pnpm test:integration
      - uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.ref == 'refs/heads/main'
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-ecr
          aws-region: ap-southeast-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and Push
        run: |
          TAG="main-${GITHUB_SHA::7}-$(date +%Y%m%d%H%M%S)"
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$TAG
```

### 自定义 CI 步骤

团队可以在标准流程基础上添加自定义步骤：

- **E2E Tests**: Analytics 团队使用 Playwright 运行端到端测试
- **Performance Tests**: Payment 团队在 PR 中运行 k6 负载测试，检测性能回归
- **Database Migration Check**: 使用 `atlas schema diff` 验证迁移脚本的正确性
- **API Compatibility Check**: 使用 `openapi-diff` 检测 API breaking changes

## CD 流水线

### ArgoCD GitOps 工作流

CD 阶段通过 ArgoCD 实现，核心仓库为 `k8s-manifests`：

```
k8s-manifests/
├── apps/                    # ArgoCD Application 定义
│   ├── payment-service.yaml
│   ├── user-service.yaml
│   └── ...
├── base/                    # Kustomize base
│   ├── payment-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   └── ...
└── overlays/                # 环境特定配置
    ├── dev/
    ├── staging/
    └── production/
```

### 部署流程

1. CI 构建完成后，GitHub Actions 自动更新 `k8s-manifests` 中的镜像 tag
2. 创建 PR 到 `k8s-manifests` 仓库
3. **Dev 环境**: PR 合并后自动部署（auto-sync）
4. **Staging 环境**: PR 合并后自动部署，但需要通过 smoke tests
5. **Production 环境**: 手动审批（通过 ArgoCD UI 或 Slack bot `/deploy approve`）

### 环境晋升策略

```
Dev → Staging → Production
 ↑       ↑          ↑
auto    auto     manual approval
sync    sync     + canary rollout
```

- **Dev → Staging**: 自动晋升，每次 main 分支构建后
- **Staging → Production**: 需要以下条件全部满足：
  1. Staging smoke tests 全部通过
  2. 至少 2 位 senior engineer 审批 PR
  3. 不在 deployment freeze 期间
  4. 当前没有进行中的 P0/P1 incident

### 回滚策略

**自动回滚**（通过 Argo Rollouts）：
- 部署后 5 分钟内 5xx 错误率 > 1%
- 部署后 5 分钟内 P99 延迟增加 > 50%
- 新 Pod 连续 CrashLoopBackOff

**手动回滚**：
```bash
# 通过 ArgoCD CLI
argocd app rollback payment-service

# 通过 kubectl
kubectl rollout undo deployment/payment-service -n team-payment

# 通过 Slack bot
/deploy rollback payment-service production
```

## 环境管理

### 环境配置差异

| 配置项 | Dev | Staging | Production |
|--------|-----|---------|------------|
| Replicas | 1 | 2 | 3-20 (HPA) |
| CPU Request | 100m | 250m | 500m |
| Memory Request | 128Mi | 256Mi | 512Mi |
| Log Level | debug | info | warn |
| Feature Flags | 全开 | 与 prod 一致 | 按计划开放 |
| External APIs | Mock | Sandbox | Production |
| Database | Shared dev DB | 独立 staging DB | Production DB (RDS Multi-AZ) |
| SSL/TLS | Self-signed | ACM | ACM |

### Feature Flags

使用 LaunchDarkly 管理 Feature Flags：

- **开发阶段**: 在 Dev 环境默认开启新功能
- **测试阶段**: 在 Staging 环境选择性开启
- **发布阶段**: 在 Production 环境按百分比灰度开放
- **清理**: 功能全量发布 2 周后，清理 Flag 代码

控制台: https://app.launchdarkly.com/company-project

## 数据库迁移

### 迁移工具

- **PostgreSQL**: 使用 Atlas (https://atlasgo.io) 进行 schema 管理
- **ClickHouse**: 使用 goose 进行迁移管理

### 迁移流程

1. 开发者在服务仓库的 `migrations/` 目录创建迁移文件
2. CI 自动运行 `atlas schema diff` 验证迁移安全性
3. 危险操作（DROP TABLE、DROP COLUMN）会被标记并需要 DBA 审批
4. 迁移在部署前通过 Kubernetes Job 执行
5. 支持自动回滚（Atlas 自动生成 down migration）

### 迁移最佳实践

- **永远向前兼容**: 新代码必须兼容旧 schema，旧代码必须兼容新 schema
- **小步迭代**: 将大的 schema 变更拆分为多个小迁移
- **避免锁表**: 对大表使用 `ALTER TABLE ... ADD COLUMN ... DEFAULT` 而非修改已有列
- **数据回填**: 使用异步 Job 进行数据回填，不要在迁移脚本中处理大量数据
- **监控迁移**: 迁移执行时间 > 30s 会触发告警

## 故障排查

### CI 失败排查

| 失败类型 | 常见原因 | 解决方案 |
|----------|---------|---------|
| Lint 失败 | 代码格式不符合规范 | 运行 `pnpm format` 自动修复 |
| Test 失败 | 测试不稳定 (flaky) | 检查是否有时序依赖，使用 retry |
| Build 失败 | Docker 缓存失效 | 检查 Dockerfile，确认基础镜像可用 |
| Security 失败 | 新引入的漏洞依赖 | 升级依赖或申请豁免 (Snyk ignore) |
| Push 失败 | ECR 权限问题 | 检查 IAM Role 和 OIDC 配置 |

### CD 失败排查

| 失败类型 | 常见原因 | 解决方案 |
|----------|---------|---------|
| Sync 失败 | YAML 格式错误 | `kubectl apply --dry-run` 验证 |
| Health check 失败 | 应用启动慢 | 增加 `initialDelaySeconds` |
| Resource 不足 | 集群容量满 | 检查 Karpenter 日志，是否需要扩容 |
| Image Pull 失败 | ECR 权限或镜像不存在 | 检查 ServiceAccount 和镜像 tag |
| Migration 失败 | Schema 冲突 | 回滚迁移，检查并发迁移锁 |

### 常用调试命令

```bash
# 查看 ArgoCD 应用状态
argocd app get payment-service

# 查看同步历史
argocd app history payment-service

# 查看 CI 运行状态
gh run list --repo company/payment-service --limit 5

# 查看最近的部署事件
kubectl get events -n team-payment --sort-by='.lastTimestamp' | head -20
```
