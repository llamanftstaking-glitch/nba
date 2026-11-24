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

## Observed during deployment (2026-11-24, via the owner's SSH session)
* Ubuntu host, Docker with compose plugin; SSH as `root` with key authentication only.
* Reverse proxy: Caddy in a container named `mon-caddy` (ports 80/443), Caddyfile on the host at `/opt/mon/Caddyfile`,
  apps reached by container name over the Docker network `mon_web`. No host-level nginx/Caddy service.
* Other containers present (untouched): btc-edge*, oracle-*, lvlup*, gizer-oil, ojos-de-falcon, creando, oddslens*,
  killjoy, jrfbelt-api, uptime-kuma, dozzle.
* GIZER NBA: `/opt/gizer-nba`, compose project `gizer-nba`, web also attached to `mon_web` through
  `docker-compose.override.yml`; site block between `gizer-nba-begin/end` markers; Caddyfile backup
  `/opt/mon/Caddyfile.bak-gizer-nba-20261124211344`.
* Not inspected: CPU, RAM, disk, GPU.
