# Service Deployment Guide

## Overview

All production services are deployed on **Kubernetes (K8s)** clusters hosted on AWS EKS. We use **ArgoCD** for GitOps-based continuous deployment and **Helm** charts for service configuration.

## Deployment Process

### Step 1: Prepare Your Changes

1. Create a feature branch from `main`
2. Make your code changes and write tests
3. Open a Pull Request and get at least 2 approvals
4. Merge to `main` — this triggers the CI pipeline

### Step 2: CI Pipeline

The CI pipeline (GitHub Actions) automatically:
1. Runs unit tests and integration tests
2. Builds a Docker image tagged with the commit SHA
3. Pushes the image to ECR (Elastic Container Registry)
4. Updates the Helm chart values in the `infra-configs` repository

### Step 3: ArgoCD Deployment

ArgoCD detects the change in `infra-configs` and automatically syncs:
- **Staging**: Deploys immediately after CI completes
- **Production**: Requires manual approval in ArgoCD dashboard at https://argocd.internal.company.com

### Step 4: Verification

After deployment, verify your changes:
1. Check the ArgoCD dashboard for sync status
2. Monitor Grafana dashboards at https://grafana.internal.company.com/d/service-health
3. Check application logs in Kibana at https://kibana.internal.company.com
4. Run smoke tests: `make smoke-test ENV=staging`

## Rollback Procedure

If issues are detected after deployment:

1. **Quick rollback**: In ArgoCD, click "Sync" and select the previous revision
2. **Helm rollback**: `helm rollback <release-name> <revision> -n <namespace>`
3. **Emergency**: Contact the on-call SRE via `#sre-oncall` Slack channel

## Environment Configuration

| Environment | Cluster | Region | URL |
|-------------|---------|--------|-----|
| Development | dev-cluster | ap-southeast-1 | https://dev.company.com |
| Staging | staging-cluster | ap-southeast-1 | https://staging.company.com |
| Production | prod-cluster | ap-southeast-1 | https://app.company.com |

## Monitoring and Alerts

All services are monitored via Prometheus + Grafana. Alert rules are defined in the `monitoring-configs` repository. Critical alerts are routed to PagerDuty and the `#alerts-critical` Slack channel.

### Key Metrics to Watch
- **P99 latency**: Should be under 500ms for API endpoints
- **Error rate**: Should be below 0.1%
- **CPU/Memory usage**: Alert triggers at 80% utilization
