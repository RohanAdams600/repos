# Monitoring

| File | Purpose |
|---|---|
| `prometheus.yml` | Scrape jobs: `/api/internal/metrics` (bearer `INTERNAL_API_SECRET`) and `/api/health` through a blackbox exporter. |
| `alerts.yml` | Alert rules. `severity: page` wakes someone; `severity: warning` goes to the team channel. |
| `alerts.test.yml` | `promtool` unit tests for the rules (thresholds, hold times, fresh-deploy edge cases). |
| `grafana-dashboard.json` | "KineticScout operations" dashboard. Import it and choose the Prometheus data source. |

Check locally with `promtool check rules alerts.yml && promtool test rules alerts.test.yml`. CI runs
the same checks. The gauges are defined in `src/lib/ops/metrics.ts`, and what each paging alert
means is in `docs/DEPLOY.md`.
