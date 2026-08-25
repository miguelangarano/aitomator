# Security

AItomator workflows and nodes are trusted local TypeScript code. Running a workflow is equivalent to running any local program: it can read files and environment variables, start processes, and access the network. AItomator is not a sandbox.

Run the daemon as a dedicated, unprivileged user; use scoped credentials; bind HTTP to loopback unless remote access is intentional; use bearer authentication for sensitive routes; and review third-party workflows before enabling them. Secrets read by nodes are not automatically persisted, but node inputs, outputs, trigger payloads, errors, and logs are persisted—do not return or log secrets.

Report vulnerabilities privately to the repository maintainers. Include the affected version, reproduction steps, impact, and any proposed mitigation. Do not open a public issue until a fix is available.
