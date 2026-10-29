# Docker

Images are published for `amd64` and `arm64` as [`maxpiva/rensaio`](https://hub.docker.com/r/maxpiva/rensaio).

## Volumes

| Container path | Description                      |
|----------------|----------------------------------|
| `/config`      | Stores application configuration |
| `/series`      | Stores series                    |

## Ports

| Port | Service    | Required | Notes         |
|------|------------|----------|---------------|
| 9833 | Rensaiō UI | ✅       | Web interface |

## Permissions

| Variable | Value | Description                    |
|----------|-------|--------------------------------|
| `PUID`   | 99    | Host user ID                   |
| `PGID`   | 100   | Host group ID                  |
| `UMASK`  | 022   | File permission mask (default) |

> The container takes ownership of `/config` on every start. It does not touch `/series`: make sure the specified PUID and PGID can write to it.

## Network mode

It is recommended to use **host networking** for optimal performance when downloading a lot and querying multiple providers in parallel. This applies to the one-liner below and the [Unraid template](unraid.md); the Compose and [Helm](helm.md) examples use bridged/`ClusterIP` networking instead since host networking isn't practical (or needed) in those environments.

## One-liner

```bash
docker run -d \
  --name Rensaio \
  --network host \
  -e PUID=99 \
  -e PGID=100 \
  -e UMASK=022 \
  -v /path/to/your/config:/config \
  -v /path/to/your/series:/series \
  maxpiva/rensaio:latest
```

Replace `/path/to/your/config` and `/path/to/your/series` with real paths on your host. With host networking the UI listens on port 9833 directly, so no `-p` mapping is needed.

## Docker Compose

Runnable file: [`examples/docker-compose.yml`](../../examples/docker-compose.yml)

```yaml
services:
  rensaio:
    container_name: rensaio
    image: 'maxpiva/rensaio:latest'
    volumes:
        - '/path/to/your/series:/series'
        - '/path/to/your/config:/config'
    environment:
        - UMASK=022
        - PGID=100
        - PUID=99
    ports:
        - '9833:9833'
```

## Next steps

Open `http://<host-ip>:9833` and follow the setup wizard. Coming from Kaizoku? See [Upgrading](upgrading.md).
