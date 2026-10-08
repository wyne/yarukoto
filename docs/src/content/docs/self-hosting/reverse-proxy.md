---
title: HTTPS and reverse proxies
description: Caddy, Traefik and nginx examples for putting Yarukoto behind HTTPS.
---

The container serves plain HTTP, which is fine on a trusted network. **Every request carries a
bearer token, so put it behind HTTPS before exposing it to the internet.** The Android app needs
HTTPS even at home: it won't connect to a plain `http://` address at all. Nothing about the app
needs special proxy handling: no WebSockets, no long-lived streams (`/mcp` answers in plain JSON),
and it works at the root of its own hostname. A subpath (`example.com/todo`) is not supported.

Set `TRUST_PROXY` so logs record the real client address.

**Caddy**

```caddyfile
todo.example.com {
	reverse_proxy yarukoto:8080
}
```

**Traefik** (labels on the `yarukoto` service)

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.yarukoto.rule=Host(`todo.example.com`)
      - traefik.http.routers.yarukoto.entrypoints=websecure
      - traefik.http.routers.yarukoto.tls.certresolver=letsencrypt
      - traefik.http.services.yarukoto.loadbalancer.server.port=8080
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name todo.example.com;
    # ssl_certificate / ssl_certificate_key as usual

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx Proxy Manager and DSM's reverse proxy need only the hostname and `http://<host>:8080`.
