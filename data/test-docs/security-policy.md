# Information Security Policy

## Access Control

### Principle of Least Privilege
All access is granted on a need-to-know basis. Employees should only have access to systems and data required for their role.

### Access Levels

| Level | Description | Approval Required |
|-------|-------------|-------------------|
| L1 — Read | View data and dashboards | Manager |
| L2 — Write | Create and modify data | Manager + Data Owner |
| L3 — Admin | Manage users and configurations | Manager + Security Team |
| L4 — Root | Full system access | VP Engineering + CISO |

### Access Review
- Quarterly access reviews for all production systems
- Immediate access revocation upon employee departure
- Temporary access (e.g., for incident response) expires after 24 hours

## Authentication

### Single Sign-On (SSO)
All internal applications must use **Okta SSO**. Direct username/password authentication is not permitted for production systems.

- SSO portal: https://company.okta.com
- Multi-Factor Authentication (MFA) is mandatory for all employees
- Supported MFA methods: Okta Verify (preferred), YubiKey, TOTP

### Service-to-Service Authentication
- Internal services use mTLS certificates managed by Istio
- External API consumers use OAuth 2.0 client credentials flow
- API keys must be rotated every 90 days

## Data Classification

| Classification | Description | Examples | Handling |
|---------------|-------------|----------|----------|
| **Public** | Can be shared externally | Marketing materials, blog posts | No restrictions |
| **Internal** | For employees only | Internal docs, meeting notes | Don't share externally |
| **Confidential** | Sensitive business data | Financial reports, roadmaps | Encrypted, access-controlled |
| **Restricted** | Highly sensitive | Customer PII, credentials | Encrypted at rest and in transit, audit logged |

## Incident Reporting

If you suspect a security incident:
1. **Do not** try to investigate on your own
2. Immediately report to `#security-incidents` Slack channel
3. Contact the Security Team at security@company.com
4. Preserve any evidence (screenshots, logs, URLs)

Security hotline (24/7): +65 6123 4567

## Password Policy

- Minimum 12 characters
- Must include uppercase, lowercase, number, and special character
- No password reuse (last 10 passwords)
- Password change required every 90 days
- Use the company-approved password manager: **1Password** (provided to all employees)
