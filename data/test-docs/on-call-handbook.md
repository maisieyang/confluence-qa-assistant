# On-Call Handbook

## Overview

Each engineering team maintains a weekly on-call rotation. The on-call engineer is responsible for responding to production alerts, triaging issues, and coordinating incident response.

## On-Call Schedule

- **Rotation**: Weekly, handoff every Monday at 10:00 AM SGT
- **Schedule tool**: PagerDuty (https://company.pagerduty.com)
- **Override requests**: Swap shifts with a teammate via PagerDuty, notify your team lead

## Responsibilities

### During On-Call Hours (24/7)
1. **Acknowledge alerts** within 5 minutes
2. **Triage** the issue and determine severity (P0–P3)
3. **Communicate** status in `#incidents` Slack channel
4. **Resolve or escalate** within the response time SLA

### Response Time SLA

| Severity | Acknowledge | First Response | Resolution Target |
|----------|------------|----------------|-------------------|
| P0 | 5 min | 15 min | 1 hour |
| P1 | 5 min | 30 min | 4 hours |
| P2 | 30 min | 4 hours | Next business day |
| P3 | Next business day | Next sprint | Best effort |

## Alert Sources

| Source | Channel | What It Monitors |
|--------|---------|------------------|
| PagerDuty | Phone call + SMS | P0/P1 alerts |
| Grafana | `#alerts-critical` Slack | Service health metrics |
| Sentry | `#alerts-errors` Slack | Application exceptions |
| AWS CloudWatch | `#alerts-infra` Slack | Infrastructure health |

## Incident Management Process

### Step 1: Acknowledge
- Acknowledge the PagerDuty alert
- Post in `#incidents`: "Investigating [alert name]. Severity: [P0/P1/P2/P3]"

### Step 2: Investigate
- Check Grafana dashboards for the affected service
- Review recent deployments in ArgoCD
- Check application logs in Kibana
- Look for correlated alerts from other services

### Step 3: Mitigate
- If caused by a recent deployment → rollback via ArgoCD
- If infrastructure issue → check AWS console, scale resources if needed
- If external dependency → verify status pages, implement circuit breaker

### Step 4: Communicate
- Update `#incidents` every 15 minutes for P0/P1
- For customer-facing issues, notify Customer Success team
- Draft a status page update if impact is widespread

### Step 5: Post-Mortem
- Required for all P0 and P1 incidents
- Write post-mortem within 3 business days
- Template: https://confluence.internal.company.com/post-mortem-template
- Post-mortem meeting: discuss root cause, action items, prevention

## Compensation

- On-call engineers receive **SGD 500/week** on-call allowance
- Additional **SGD 100** per incident responded outside business hours
- Compensatory time off: 1 day for every 3 after-hours incidents in a week

## Tips for New On-Call Engineers

1. **Familiarize yourself** with the runbooks before your first shift
2. **Test your phone** — make sure PagerDuty can reach you
3. **Have your laptop ready** — keep it charged and accessible
4. **Don't panic** — follow the runbooks and escalate if unsure
5. **Ask for help** — post in your team channel, someone will respond
