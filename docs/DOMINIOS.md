# Dominios propios con Caddy

La app ya hace todo lo suyo: alta y verificación (TXT `_tubio.<host>` con el token de la cuenta = propiedad; CNAME a `custom.tubio.link` = tráfico), ruteo por
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


## Decisión 2026-10-22: Cloudflare for SaaS (no Caddy)
tubio.link ya vive en Cloudflare, así que los dominios de clientes van por **Cloudflare for SaaS** ($0 hasta 100
hosts, luego 0.10 USD/mes c/u): sin IP extra ni Caddy.
- Fallback origin `custom.tubio.link` (A 74.208.210.20, proxied). El cliente hace CNAME a `custom.tubio.link`.
- Al verificar (TXT) la app da de alta el host (`custom_hostnames`, SSL DV por HTTP); al borrar, lo da de baja.
  Variables `TUBIO_CF_TOKEN` (token sólo de la zona tubio.link: SSL y certificados, DNS, Origin Rules, Config Rules) y
  `TUBIO_CF_ZONE`. El panel muestra si el certificado ya está activo.
- **Origin Rule**: todo host que no sea `tubio.link`/`*.tubio.link` va al **puerto 2053** de aws1; **Config Rule**: SSL
  «Full» para esos hosts. En aws1 `/etc/nginx/conf.d/zz900-tubio-saas.conf` escucha 2053 con certificado autofirmado
  (`/etc/nginx/tubio-saas/`), sólo IPs de Cloudflare (`cf-allow.conf`, regenerar si Cloudflare cambia su lista), y pasa
  a 127.0.0.1:3095 conservando el Host. Así no se toca el 443 que comparten los 113 sitios Plesk. Firewall de IONOS: TCP
  2053 abierto.
