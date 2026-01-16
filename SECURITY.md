# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in DulceJelly, please report it by opening an issue on GitHub or contacting the maintainers directly.

**Please note:**

- This is a best-effort, open-source project with no formal security SLA
- Response times may vary based on maintainer availability
- We do not offer a bug bounty program

## Scope

Security issues within scope:

- Authentication bypass vulnerabilities
- Exposed secrets or credentials in code
- Container security misconfigurations
- Infrastructure-as-code security flaws

Out of scope:

- Issues in upstream dependencies (report to respective projects)
- Misconfiguration by end users
- Social engineering attacks
- Physical access attacks

## User Responsibility

**Important:** Users are solely responsible for:

- Securing their deployment environment
- Properly configuring authentication and access controls
- Keeping dependencies and Docker images updated
- Following security best practices outlined in documentation
- Ensuring their infrastructure complies with their organization's security policies

## No Warranty

This project is provided "as is" without warranty of any kind (see LICENSE file). The maintainers are not responsible for:

- Security vulnerabilities introduced by user misconfiguration
- Breaches resulting from failure to follow documented security practices
- Vulnerabilities in third-party dependencies or services
- Damages resulting from security incidents

## Security Best Practices

When deploying DulceJelly:

1. **Use strong authentication** - Configure Caddy basic auth and/or Cloudflare Access
2. **Keep services updated** - Regularly pull latest Docker images
3. **Restrict network access** - Use firewall rules and Cloudflare security features
4. **Secure credentials** - Use Pulumi secrets, never commit `.env` files
5. **Monitor logs** - Review service logs for suspicious activity
6. **Use HTTPS** - Always enable TLS for public-facing services
7. **Limit blast radius** - Run services as non-root with minimal permissions (PUID/PGID)

## Disclosure Policy

- Security issues will be disclosed after a fix is available
- No disclosure timeline guarantees
- Best-effort notification to known users
- Public disclosure via GitHub Security Advisories (if applicable)

## Contact

For security concerns, please:

1. Open a GitHub issue (for non-critical issues)
2. Contact maintainers directly (for critical vulnerabilities)

**Response time:** Best effort, no SLA
