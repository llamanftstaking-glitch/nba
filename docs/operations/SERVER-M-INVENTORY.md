# Server M inventory

**Status: BLOCKED — not performed.** The build session ran in an isolated cloud container with no SSH key,
VPN or attached machine for Server M, so nothing on the server was inspected or changed.

Observed from outside (2026-11-24):
* `nba.gizergroup.com` resolves to **74.208.191.181** (earlier in the day it resolved to 66.223.49.89 via the
  wildcard record, where an openresty proxy answered 404).
* An HTTPS request to the new address did not complete from the sandbox (no service answering for this host yet,
  or the sandbox proxy could not reach it). NOT VERIFIED further.

To complete on the server (read-only commands):
```bash
uname -a; lsb_release -a; nproc; free -h; df -h; nvidia-smi 2>/dev/null
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'; docker network ls; docker volume ls
ss -ltnp                                     # ports in use (confirm 3410 is free)
systemctl list-units --type=service --state=running | grep -Ei 'nginx|caddy|openresty|traefik|postgres|redis'
ls /etc/nginx/sites-enabled /etc/caddy 2>/dev/null
```
Record the results here, then proceed with DEPLOYMENT.md.
