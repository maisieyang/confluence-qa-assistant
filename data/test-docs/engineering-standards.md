# Engineering Standards & Best Practices

## Code Review Policy

All code changes must go through a Pull Request review process:

1. **Minimum 2 approvals** required before merging
2. **CI must pass** — all tests, linting, and type checks
3. **No self-merging** — the author cannot approve their own PR
4. **Review SLA** — PRs should be reviewed within 1 business day
5. **Stale PRs** — PRs inactive for more than 5 business days should be closed or rebased

## Git Workflow

We follow **trunk-based development**:
- `main` is the primary branch, always deployable
- Feature branches are short-lived (< 3 days)
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Squash merge to keep history clean

## Testing Standards

### Coverage Requirements
- **Unit tests**: Minimum 80% line coverage
- **Integration tests**: All API endpoints must have integration tests
- **E2E tests**: Critical user flows must have Cypress/Playwright tests

### Test Naming Convention
```
describe('PaymentService')
  it('should create a payment with valid input')
  it('should reject payment with negative amount')
  it('should handle payment provider timeout gracefully')
```

## API Design Standards

All APIs must follow RESTful conventions:
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Return appropriate status codes (200, 201, 400, 401, 404, 500)
- Version APIs in the URL path: `/v1/`, `/v2/`
- Use snake_case for JSON field names
- Include pagination for list endpoints (`page`, `page_size`)
- Always return errors in a consistent format:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Amount must be a positive integer",
    "details": [...]
  }
}
```

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P0 | Service down, all users affected | 15 minutes | Payment processing completely down |
| P1 | Major feature broken, many users affected | 30 minutes | Dashboard not loading for 50% of users |
| P2 | Minor feature broken, workaround exists | 4 hours | Export feature failing for CSV format |
| P3 | Cosmetic issue, no functional impact | Next sprint | Button color incorrect on settings page |

### On-Call Rotation
- Each team maintains a weekly on-call rotation
- On-call schedule is managed in PagerDuty
- On-call engineer must acknowledge alerts within 5 minutes
- Escalation path: On-call → Team Lead → Engineering Manager → CTO
