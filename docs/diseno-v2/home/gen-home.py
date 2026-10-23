#!/usr/bin/env python3
"""Home pública de tubio.link con el kit M1 · Charla. Genera index.html (usa tokens.css + home.css)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iconos import ic

AQUI = os.path.dirname(os.path.abspath(__file__))

# ---------- datos reales (migraciones 0010 y 0019) ----------
PLANES = [
    dict(slug="free", nombre="Gratis", precio="$0", nota="para siempre", cta=("Empezar gratis", "/register"),
         items=["1 página bio", "25 enlaces cortos", "10 códigos QR", "Estadísticas de 30 días", "50 MB para archivos"]),
    dict(slug="pro", nombre="Pro", precio="$99", nota="al mes · o $990 al año", cta=("Probar 14 días", "/register?plan=pro"),
         items=["10 páginas bio", "1 000 enlaces cortos", "200 códigos QR", "Estadísticas de 1 año", "Tu propio dominio", "Sin «hecho con tubio»"]),
    dict(slug="business", nombre="Negocio", precio="$299", nota="al mes · o $2 990 al año", cta=("Probar 14 días", "/register?plan=business"),
         items=["Páginas, enlaces y QR sin límite", "Estadísticas de 3 años", "10 dominios propios", "Equipo de hasta 5 personas", "API y código propio", "10 GB para archivos"]),
]

FUNCIONES = [
    ("btn", "Página bio", "Botones, redes, horario, ubicación, videos y más: 22 bloques que acomodas arrastrando. Lista en minutos desde el celular."),
    ("link", "Enlaces cortos", "tubio.link/tu-promo, con fecha de inicio y fin, tope de clics, contraseña y UTM. También archivos, tarjetas de contacto y eventos."),
    ("qr", "Códigos QR que no caducan", "Con tus colores y tu logo. Si cambias el destino, el QR que ya imprimiste sigue funcionando."),
    ("chart", "Estadísticas sin espiar", "Visitas, países, dispositivos y de dónde llegan, sin guardar direcciones IP ni usar cookies de rastreo."),
]

PASOS = [
    ("Reclama tu dirección", "tubio.link/tunegocio es tuya en un minuto."),
    ("Pon tus botones", "WhatsApp, menú, ubicación, horario, redes. Ves cómo queda mientras editas."),
    ("Compártela", "En tu bio de Instagram y TikTok, en tu estado de WhatsApp o impresa como QR en el mostrador."),
]

FAQ = [
    ("¿De verdad es gratis?", "Sí. El plan Gratis no vence: una página bio, 25 enlaces cortos y 10 QR. Los planes Pro y Negocio agregan más páginas, dominio propio y estadísticas más largas."),
    ("¿Qué es eso de «fundadores»?", "Las primeras 100 cuentas que confirmen su correo reciben un año del plan Negocio sin costo. El contador de arriba dice cuántos lugares quedan."),
    ("¿Los precios incluyen IVA?", "Sí, están en pesos mexicanos con IVA incluido. Pagar el año cuesta lo mismo que 10 meses."),
    ("¿Puedo usar mi propio dominio?", "Sí, desde el plan Pro (1 dominio) y en Negocio (hasta 10). Tu página se ve en tunegocio.com en vez de tubio.link."),
    ("¿Qué guardan de mis visitantes?", "Contamos visitas, clics, país y tipo de dispositivo. No guardamos direcciones IP ni usamos cookies de rastreo, así que no necesitas aviso de cookies."),
    ("¿Por qué software libre?", "El código de tubio es público bajo licencia AGPL. Cualquiera puede revisarlo, y si algún día quieres, puedes instalarlo en tu propio servidor con tus datos."),
]

def phone_bio():
    btns = [("wa", "Pide por WhatsApp"), ("link", "Menú del día"), ("map", "Cómo llegar"), ("cal", "Reserva para grupos")]
    b = "".join(f'<span class="pb-btn">{ic(i, 18)}<span>{t}</span></span>' for i, t in btns)
    return f'''<div class="demo" aria-hidden="true">
      <div class="phone"><div class="pb">
        <span class="pb-av">LC</span><span class="pb-n">Café La Ceiba</span><span class="pb-d">Café de especialidad en Coyoacán</span>
        <span class="pb-btns">{b}</span>
        <span class="pb-card"><span class="pb-h">{ic("clock", 16)} Abierto ahora</span><span class="pb-r">Lun a vie · 8:00 – 20:00</span></span>
        <span class="pb-soc">{ic("ig", 20)}{ic("tt", 20)}{ic("fb", 20)}</span>
      </div></div>
      <div class="toast"><span class="t-av">{ic("chart", 18)}</span><span><b>512 clics</b> en «Pide por WhatsApp»<small>últimos 30 días</small></span></div>
    </div>'''

def phone_panel():
    rows = [("LC", "Café La Ceiba", "tubio.link/laceiba", "1 284"), ("link", "Menú del día", "tubio.link/ceiba-menu", "612"),
            ("qr", "QR de la mesa", "tubio.link/q/mesa", "388"), ("link", "Reservas para grupos", "tubio.link/ceiba-grupos", "97")]
    r = "".join(f'''<span class="pp-row"><span class="pp-av">{t if t.isupper() else ic(t, 18)}</span><span class="pp-b"><b>{n}</b><span>{u}</span></span><span class="pp-c">{c}</span></span>''' for t, n, u, c in rows)
    tabs = "".join(f'<span class="pp-tab{" on" if i == "link" else ""}"><span class="pp-ti">{ic(i, 18)}</span>{n}</span>' for i, n in [("link", "Enlaces"), ("qr", "QR"), ("chart", "Estadísticas"), ("user", "Cuenta")])
    return f'''<div class="phone sm" aria-hidden="true"><div class="pp"><span class="pp-top"><b>tubio</b>{ic("search", 18)}</span>{r}
      <span class="pp-fab">{ic("plus", 22)}</span><span class="pp-tabs">{tabs}</span></div></div>'''

def stats_card():
    dias = [42, 38, 51, 47, 60, 55, 72, 66, 58, 61, 79, 84, 70, 68, 90, 95, 88, 76, 81, 99, 104, 97, 92, 110, 118, 101, 96, 124, 131, 127]
    mx = max(dias); w = 300; h = 96; bw = w / len(dias)
    bars = "".join(f'<rect x="{i*bw+1:.1f}" y="{h-v/mx*h:.1f}" width="{bw-3:.1f}" height="{v/mx*h:.1f}" rx="2"/>' for i, v in enumerate(dias))
    return f'''<figure class="stats" aria-label="Ejemplo de estadísticas">
      <p class="st-l">Visitas a la página · 30 días</p><p class="st-n">2 631</p><p class="st-d">▲ 18 % contra el mes anterior</p>
      <svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Gráfica de visitas diarias con tendencia al alza">{bars}</svg>
      <dl class="st-k"><div><dt>Clics</dt><dd>1 075</dd></div><div><dt>Escaneos QR</dt><dd>388</dd></div><div><dt>IPs guardadas</dt><dd>0</dd></div></dl>
    </figure>'''

def planes():
    out = []
    for p in PLANES:
        dest = ' destacado' if p["slug"] == "business" else ''
        sello = '<span class="sello">Gratis 1 año para fundadores</span>' if p["slug"] == "business" else ''
        li = "".join(f'<li>{ic("check", 18)}<span>{x}</span></li>' for x in p["items"])
        out.append(f'''<article class="plan{dest}"><header><h3>{p["nombre"]}</h3>{sello}</header>
          <p class="precio"><b>{p["precio"]}</b> <span>{p["nota"]}</span></p><ul>{li}</ul>
          <a class="btn {'btn-acento' if dest else 'btn-borde'}" href="{p["cta"][1]}">{p["cta"][0]}</a></article>''')
    return "".join(out)

HTML = f'''<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tubio · Todos tus enlaces en una sola página</title>
<meta name="description" content="Crea tu página bio, acorta enlaces, genera códigos QR y mira quién te visita, sin rastrear a nadie. Software libre hecho en México.">
<meta name="theme-color" content="#F2EEE3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1310" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="https://tubio.link/">
<link rel="icon" href="/_/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="home.css">
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cab">
  <div class="cab-in">
    <a class="marca" href="/" aria-label="tubio, inicio">tubio</a>
    <nav class="cab-nav" aria-label="Principal">
      <a href="#funciones">Funciones</a><a href="#planes">Planes</a><a href="#preguntas">Preguntas</a>
    </nav>
    <a class="cab-l" href="/lang/en?next=/" hreflang="en" lang="en">English</a>
    <a class="btn btn-chico btn-borde" href="/login">Entrar</a>
  </div>
</header>

<main id="contenido">
  <section class="hero">
    <div class="hero-txt">
      <p class="kicker">{ic("globe", 18)} Software libre · hecho en México</p>
      <h1>Todos tus enlaces en una sola página</h1>
      <p class="lead">Crea tu página bio, acorta enlaces, genera códigos QR y mira quién te visita, sin rastrear a nadie. Se usa igual de fácil que tus apps de mensajes.</p>
      <p class="fundadores" data-fundadores><span class="f-n" data-quedan>100</span><span><b>lugares de fundador.</b> Las primeras 100 cuentas tienen un año del plan Negocio gratis.</span></p>
      <form class="reclamar" method="get" action="/register" role="search" aria-label="Reclama tu dirección">
        <label for="alias" class="r-l">Reclama tu dirección</label>
        <div class="r-fila"><span class="r-host" aria-hidden="true">tubio.link/</span>
          <input id="alias" name="alias" required minlength="3" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="tunegocio">
          <button class="btn btn-acento" type="submit">Reclamar</button></div>
        <p class="r-alt">o <a href="/register">crea tu cuenta con correo</a> · <a href="/login/google">entra con Google</a></p>
      </form>
    </div>
    {phone_bio()}
  </section>

  <section class="pasos" aria-labelledby="t-pasos">
    <h2 id="t-pasos">Lista en tres pasos</h2>
    <ol>{"".join(f'<li><span class="p-n">{i}</span><span><b>{t}</b><span>{d}</span></span></li>' for i, (t, d) in enumerate(PASOS, 1))}</ol>
  </section>

  <section class="funciones" id="funciones" aria-labelledby="t-func">
    <div class="f-txt">
      <h2 id="t-func">Todo lo que tu negocio comparte, en un solo lugar</h2>
      <ul class="filas">{"".join(f'<li><span class="f-av">{ic(i, 22)}</span><span class="f-b"><b>{t}</b><span>{d}</span></span></li>' for i, t, d in FUNCIONES)}</ul>
    </div>
    <div class="f-vis">{phone_panel()}</div>
  </section>

  <section class="privacidad" aria-labelledby="t-priv">
    <div><h2 id="t-priv">Sabes cuánta gente te visita. Nadie sabe quiénes son.</h2>
      <p>Tus estadísticas cuentan visitas y clics, no personas. No guardamos direcciones IP ni ponemos cookies de rastreo, así que tus clientes no tienen que aceptar avisos raros para ver tu página.</p></div>
    {stats_card()}
  </section>

  <section class="planes" id="planes" aria-labelledby="t-planes">
    <h2 id="t-planes">Planes</h2>
    <p class="p-sub">Precios en pesos, IVA incluido. Pagar el año cuesta lo mismo que 10 meses.</p>
    <div class="p-lista">{planes()}</div>
  </section>

  <section class="libre" aria-labelledby="t-libre">
    <h2 id="t-libre">Software libre, de verdad</h2>
    <p>El código de tubio es público bajo licencia AGPL. Puedes revisarlo, mejorarlo o instalarlo en tu propio servidor.</p>
    <a class="btn btn-borde" href="/source">Ver el código fuente</a>
  </section>

  <section class="faq" id="preguntas" aria-labelledby="t-faq">
    <h2 id="t-faq">Preguntas frecuentes</h2>
    {"".join(f'<details><summary>{q}{ic("plus", 20, "ic mas")}</summary><p>{a}</p></details>' for q, a in FAQ)}
  </section>

  <section class="cierre">
    <h2>Tu página, lista hoy</h2>
    <a class="btn btn-acento btn-grande" href="/register">Crear mi página gratis</a>
  </section>
</main>

<footer class="pie">
  <div class="pie-in">
    <div class="pie-marca"><span class="marca">tubio</span><p>Link in bio de software libre, hecho en México.</p></div>
    <nav aria-label="Producto"><h3>Producto</h3><a href="/directory">Directorio</a><a href="/blog">Blog</a><a href="/help">Ayuda</a><a href="#planes">Planes</a></nav>
    <nav aria-label="Legal"><h3>Legal</h3><a href="/terms">Términos</a><a href="/privacy">Aviso de privacidad</a><a href="/acceptable-use">Uso aceptable</a><a href="/security">Seguridad</a></nav>
    <nav aria-label="Código"><h3>Código</h3><a href="/source">Código fuente (AGPL)</a><a href="/lang/en?next=/" hreflang="en" lang="en">English</a></nav>
  </div>
</footer>
</body>
</html>
'''

open(os.path.join(AQUI, "index.html"), "w").write(HTML)
print("ok")
