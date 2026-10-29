# Upgrading

## Back up first

Before any upgrade, back up your config directory (`/config` in Docker), including the database. Since the devil never rests.

## From Kaizoku.Net

You can upgrade directly from Kaizoku.Net to Rensaiō. No changes are required on your side: run the new executable or update your Docker image, and everything is upgraded automatically.

## Between Rensaiō versions

Releases are published as the `latest` tag only.

- **Docker / Unraid:** pull the new image and recreate the container.
- **Helm:** the chart defaults to `latest` with `pullPolicy: IfNotPresent`, so a restart will not fetch a newer image. Set the image's `pullPolicy` to `Always` in your values (next to `tag` in [`values.yaml`](../../charts/rensaio/values.yaml)) and run `kubectl rollout restart` on the deployment, or pin the image by digest and bump it.
- **Desktop:** download the new build from the [Releases](https://github.com/maxpiva/Rensaio/releases).

Database migrations run automatically on startup.
