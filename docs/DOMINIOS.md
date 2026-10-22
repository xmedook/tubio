# Dominios propios con Caddy

La app ya hace todo lo suyo: alta y verificación (CNAME a `custom.tubio.link` o TXT `_tubio.<host>`), ruteo por
`Host`, enlaces por dominio, página de inicio por dominio y el endpoint `GET /_/caddy/ask?domain=` (200 si el
dominio está verificado, 404 si no; sólo responde a 127.0.0.1 o a las IPs de `TUBIO_CADDY_IPS`).

Falta poner **Caddy** delante para que emita los certificados al vuelo (*on-demand TLS*) de los dominios de clientes.

## Caddyfile

```caddy
{
  on_demand_tls {
    ask http://127.0.0.1:3095/_/caddy/ask
  }
  email robot@koode.mx
}

https:// {
  tls {
    on_demand
  }
  reverse_proxy 127.0.0.1:3095 {
    header_up X-Forwarded-For {remote_host}
  }
}

http:// {
  redir https://{host}{uri} 308
}
```

## Dónde corre (decisión pendiente)

En aws1.nexosrv.one los puertos 80/443 de la IP principal son de nginx/Plesk, así que Caddy necesita su propia IP:

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A. IP adicional en aws1** (recomendada) | Contratar una IPv4 extra en IONOS; Caddy escucha sólo en ella (`bind <ip>`); `custom.tubio.link` → esa IP | Caddy junto a la app (127.0.0.1:3095), sin saltos de red | Costo de la IP; configurarla en el servidor |
| B. Caddy en stack (Coolify) | Traefik pasa por TCP (HostSNI `*`, prioridad mínima) el TLS de hosts desconocidos a un contenedor Caddy que hace proxy a aws1 | Sin IP nueva | Depende de stack y del enlace stack→aws1; `ask` tendría que exponerse a la IP de stack |
| C. Servidor pequeño aparte | VPS mínimo con Caddy → proxy a aws1 | Aislado | Otro servidor que mantener |

Con A, pasos: (1) IP extra en IONOS y asignarla en el servidor; (2) instalar Caddy (paquete oficial) con el
Caddyfile de arriba y `bind <ip-extra>` en ambos bloques; (3) DNS `custom.tubio.link A <ip-extra>`;
(4) probar con un dominio de prueba.
