# Helm

A Helm chart is available at [`charts/rensaio`](../../charts/rensaio) for running Rensaiō on Kubernetes. It deploys a single container, a `Service` on port `9833`, and PVCs for `/config` and `/series`.

```bash
helm dependency update ./charts/rensaio
helm install rensaio ./charts/rensaio -n rensaio --create-namespace
```

Configure `PUID`/`PGID`/`UMASK`, image tag, PVC sizes/storage classes, and ingress via [`values.yaml`](../../charts/rensaio/values.yaml). A sample override (existing PVC claims, a dedicated storage class, and ingress with TLS) is at [`examples/helm-values.yaml`](../../examples/helm-values.yaml):

```bash
helm install rensaio ./charts/rensaio -n rensaio --create-namespace \
  -f examples/helm-values.yaml
```

The chart uses `ClusterIP` networking rather than host networking; see [Docker](docker.md#network-mode) for why host networking is recommended elsewhere.
