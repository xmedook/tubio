#!/usr/bin/env python3
"""Genera las direcciones visuales de tubio v2 (HTML autocontenido por dirección + índice)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from contrast import cr

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------------ direcciones
D = [
 dict(slug="a-mercado", nombre="Mercado", linea="Cálida y cercana: como el changarro bien puesto de la esquina.",
  porque="Papel crema, terracota y una grotesca con ojo de cerradura. Se siente hecha a mano y cercana para negocios chicos; la tipografía de cuerpo está diseñada para legibilidad (Atkinson Hyperlegible).",
  fonts="family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Atkinson+Hyperlegible+Next:wght@400;500;700",
  fdisplay='"Bricolage Grotesque"', fbody='"Atkinson Hyperlegible Next"', fnum='"Bricolage Grotesque"',
  dispw=700, dispx="font-stretch: 88%;", lic="Bricolage Grotesque (OFL) · Atkinson Hyperlegible Next (OFL)",
  r=(8, 14, 22), btnr="999px", cardr="22px",
  shadow="0 1px 0 rgba(70,40,15,.06), 0 10px 24px -14px rgba(70,40,15,.35)",
  sheetshadow="0 -1px 0 rgba(70,40,15,.08), 0 -18px 40px -20px rgba(70,40,15,.45)",
  light=dict(bg="#F6EFE4", surface="#FFFAF3", s2="#EEE3D3", ink="#2B1D14", ink2="#66503F", line="#DCCAB3",
             accent="#AE3A1E", onaccent="#FFF8F0", soft="#F3DACB", ok="#2F6B3F"),
  dark=dict(bg="#1B140F", surface="#251C15", s2="#33271D", ink="#F4EADC", ink2="#C4AE97", line="#47372A",
            accent="#F08C66", onaccent="#1B140F", soft="#4A2B1E", ok="#8CCB97"),
  bio1=dict(nombre="Papel", bg="#F6EFE4", ink="#2B1D14", ink2="#66503F", btn="#AE3A1E", btnink="#FFF8F0", btnr="999px", alt="#FFFAF3", line="#DCCAB3", font="'Bricolage Grotesque'" ),
  bio2=dict(nombre="Espresso", bg="#2A1A12", ink="#F7E9D7", ink2="#D2B79A", btn="#F2C46B", btnink="#2A1A12", btnr="14px", alt="#3A261B", line="#5A3E2E", font="'Bricolage Grotesque'" ),
 ),
 dict(slug="b-gaceta", nombre="Gaceta", linea="Editorial: se lee como una buena revista, con calma y jerarquía.",
  porque="Serif de display con eje óptico para títulos y una sans sobria para la interfaz. Filetes finos en vez de sombras y radios mínimos. Da seriedad a creadores y marcas que cuidan su imagen.",
  fonts="family=Fraunces:opsz,wght,SOFT@9..144,400..700,0..100&family=Instrument+Sans:wght@400;500;600;700",
  fdisplay='"Fraunces"', fbody='"Instrument Sans"', fnum='"Fraunces"',
  dispw=600, dispx='font-variation-settings: "SOFT" 30, "opsz" 72;', lic="Fraunces (OFL) · Instrument Sans (OFL)",
  r=(2, 4, 8), btnr="4px", cardr="4px",
  shadow="none", sheetshadow="0 -1px 0 var(--line)",
  light=dict(bg="#F3F1EA", surface="#FBFAF5", s2="#E8E5DA", ink="#14161C", ink2="#535865", line="#CBC6B5",
             accent="#1D3FBF", onaccent="#FBFAF5", soft="#DCE2F6", ok="#1F6B45"),
  dark=dict(bg="#111318", surface="#181B22", s2="#222631", ink="#EDEBE4", ink2="#A8ACB7", line="#353B4A",
            accent="#93A9FF", onaccent="#111318", soft="#232D57", ok="#7FD0A2"),
  bio1=dict(nombre="Periódico", bg="#F3F1EA", ink="#14161C", ink2="#535865", btn="#14161C", btnink="#FBFAF5", btnr="2px", alt="#FBFAF5", line="#CBC6B5", font="'Fraunces'" ),
  bio2=dict(nombre="Cobalto", bg="#1D3FBF", ink="#F4F2EC", ink2="#D6DCF5", btn="#F4F2EC", btnink="#14204F", btnr="2px", alt="#2A4CCB", line="#5670D6", font="'Fraunces'" ),
 ),
 dict(slug="c-taller", nombre="Taller", linea="Técnica y limpia: una herramienta precisa que no estorba.",
  porque="Grotesca de periódico escandinavo para la interfaz y mono real para slugs, números y conteos. Verde agave como único acento, gris verdoso de fondo. Muestra que tubio es software libre serio sin verse frío.",
  fonts="family=Schibsted+Grotesk:wght@400..800&family=JetBrains+Mono:wght@400;500;700",
  fdisplay='"Schibsted Grotesk"', fbody='"Schibsted Grotesk"', fnum='"JetBrains Mono"',
  dispw=750, dispx="letter-spacing: -.02em;", lic="Schibsted Grotesk (OFL) · JetBrains Mono (OFL)",
  r=(6, 10, 14), btnr="10px", cardr="14px",
  shadow="0 0 0 1px var(--line), 0 1px 2px rgba(10,30,20,.06)",
  sheetshadow="0 0 0 1px var(--line), 0 -12px 32px -18px rgba(10,30,20,.35)",
  light=dict(bg="#ECEFEA", surface="#F8F9F5", s2="#DFE4DC", ink="#14201A", ink2="#4C5A52", line="#C6CEC4",
             accent="#1C6A46", onaccent="#F4FBF6", soft="#D1E6D9", ok="#1C6A46"),
  dark=dict(bg="#0F1512", surface="#161E1A", s2="#1F2A24", ink="#E5EEE8", ink2="#9DAFA5", line="#2E3C35",
            accent="#62CC95", onaccent="#0F1512", soft="#1C3A2B", ok="#62CC95"),
  bio1=dict(nombre="Claro", bg="#F8F9F5", ink="#14201A", ink2="#4C5A52", btn="#14201A", btnink="#F8F9F5", btnr="10px", alt="#ECEFEA", line="#C6CEC4", font="'Schibsted Grotesk'" ),
  bio2=dict(nombre="Agave", bg="#123D2A", ink="#EAF4EE", ink2="#B8D4C4", btn="#EAF4EE", btnink="#123D2A", btnr="10px", alt="#1A4C35", line="#2E6449", font="'Schibsted Grotesk'" ),
 ),
]

# ------------------------------------------------------------------ iconos propios (trazo 1.75, no Lucide)
I = {
 "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 "qr": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M20 14v6h-6v-2M17 17h0"/>',
 "chart": '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
 "user": '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5"/>',
 "plus": '<path d="M12 5v14M5 12h14"/>',
 "grip": '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
 "dots": '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
 "back": '<path d="M15 5l-7 7 7 7"/>',
 "search": '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
 "eyeoff": '<path d="M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.6 3.3M6.4 7.5C4.6 8.8 3.3 10.6 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1"/>',
 "text": '<path d="M5 6h14M12 6v13M9 19h6"/>',
 "btn": '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/>',
 "img": '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/>',
 "wa": '<path d="M5 19l1.2-3.4A7.5 7.5 0 1 1 9 18.5z"/><path d="M9.5 9.5c.3 1.6 1.9 3.6 4 4.3l1.1-1.1 1.5.8c-.2 1-1 1.6-2 1.6-3 0-5.8-2.8-5.8-5.8 0-1 .6-1.8 1.6-2l.8 1.5z"/>',
 "map": '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
 "clock": '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
 "mail": '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M4 7l8 6 8-6"/>',
 "cal": '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
 "copy": '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
 "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
 "ig": '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".9" fill="currentColor" stroke="none"/>',
 "tt": '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.4 4 5 4.2"/>',
 "fb": '<path d="M14.5 20v-7h2.4l.4-2.8h-2.8V8.5c0-.8.3-1.4 1.4-1.4h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.6 1.3-3.6 3.8v1.9H9.2V13h2.4v7"/>',
 "pencil": '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 "dup": '<rect x="8" y="8" width="11" height="11" rx="2"/><rect x="5" y="5" width="11" height="11" rx="2"/>',
 "trash": '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
 "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
 "globe": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
}
def ic(n, s=22, cls="ic"):
    return f'<svg class="{cls}" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{I[n]}</svg>'

# ------------------------------------------------------------------ piezas de pantalla
def topbar(titulo, izq="logo", der="avatar"):
    l = '<span class="logo">tubio</span>' if izq == "logo" else f'<button class="iconbtn" aria-label="Atrás">{ic("back")}</button>'
    r = '<button class="avatar" aria-label="Cuenta">CL</button>' if der == "avatar" else der
    return f'<header class="top">{l}<h1 class="top-t">{titulo}</h1>{r}</header>'

def tabbar(activa="Enlaces"):
    tabs = [("Enlaces", "link"), ("QR", "qr"), (None, None), ("Estadísticas", "chart"), ("Cuenta", "user")]
    out = []
    for t, i in tabs:
        if t is None:
            out.append(f'<button class="crear" aria-label="Crear">{ic("plus", 24)}<span>Crear</span></button>')
        else:
            a = ' aria-current="page" class="tab on"' if t == activa else ' class="tab"'
            out.append(f'<a href="#"{a}>{ic(i)}<span>{t}</span></a>')
    return f'<nav class="tabbar" aria-label="Secciones">{"".join(out)}</nav>'

def phone(cuerpo, etiqueta, extra="", bg=None):
    st = f' style="background:{bg};color:{bg}"' if bg else ""
    return f'<figure class="shot"><div class="phone {extra}"{st}>{cuerpo}</div><figcaption>{etiqueta}</figcaption></figure>'

def scr_panel():
    items = [
        ("Café La Ceiba", "tubio.link/laceiba", "Página bio", "1 284"),
        ("Menú del día", "tubio.link/ceiba-menu", "Enlace corto", "612"),
        ("Reservas para grupos", "tubio.link/ceiba-grupos", "Enlace corto", "97"),
        ("QR de la mesa", "tubio.link/q/mesa", "QR", "388"),
        ("Taller de barismo", "tubio.link/ceiba-taller", "Enlace corto", "41"),
    ]
    lis = "".join(f'''<li class="item"><a class="item-main" href="#"><span class="item-t">{t}</span><span class="item-u mono">{u}</span>
      <span class="item-m"><span class="pill">{k}</span><span class="mono">{c} clics · 30 días</span></span></a>
      <button class="iconbtn" aria-label="Más opciones para {t}">{ic("dots")}</button></li>''' for t, u, k, c in items)
    return f'''{topbar("Enlaces")}
    <main class="body">
      <label class="field"><span class="sr">Buscar enlaces</span>{ic("search", 20)}<input value="" placeholder="Buscar en tus enlaces" /></label>
      <div class="chips" role="group" aria-label="Filtrar"><button class="chip on" aria-pressed="true">Todos <b>12</b></button><button class="chip" aria-pressed="false">Páginas</button><button class="chip" aria-pressed="false">Cortos</button><button class="chip" aria-pressed="false">QR</button></div>
      <ul class="list">{lis}</ul>
    </main>{tabbar()}'''

def blocks(drag=True):
    bl = [("Botón", "btn", "Pide por WhatsApp", ""), ("Botón", "btn", "Menú del día", "drag" if drag else ""),
          ("Texto", "text", "Abrimos de lunes a sábado, 8 a 20 h.", ""), ("Imagen", "img", "Barra de la sucursal Coyoacán", "oculto"),
          ("Redes", "ig", "Instagram · TikTok · Facebook", "")]
    out = []
    for tipo, i, txt, st in bl:
        cls = "blk" + (" lift" if st == "drag" else "") + (" off" if st == "oculto" else "")
        estado = '<span class="estado">' + ic("eyeoff", 16) + ' Oculto</span>' if st == "oculto" else ""
        out.append(f'''<li class="{cls}"><button class="grip" aria-label="Arrastrar para mover {txt}">{ic("grip")}</button>
          <span class="blk-i">{ic(i, 20)}</span><span class="blk-b"><span class="blk-k">{tipo}{estado}</span><span class="blk-t">{txt}</span></span>
          <button class="iconbtn" aria-label="Opciones del bloque {txt}">{ic("dots")}</button></li>''')
        if st == "drag":
            out.append('<li class="drop" aria-hidden="true"></li>')
    return "".join(out)

def seg(on="Editar"):
    a = lambda x: ' aria-pressed="true" class="on"' if x == on else ' aria-pressed="false"'
    return f'<div class="seg" role="group" aria-label="Modo"><button{a("Editar")}>{ic("pencil",18)} Editar</button><button{a("Vista previa")}>{ic("globe",18)} Vista previa</button></div>'

def scr_editor():
    return f'''{topbar("Café La Ceiba", izq="back", der='<button class="btn-s ghost">Publicar</button>')}
    <main class="body">
      {seg()}
      <p class="hint">{ic("check",16)} Guardado hace un momento · tubio.link/laceiba</p>
      <ul class="blocks">{blocks()}</ul>
      <button class="btn add">{ic("plus",20)} Añadir bloque</button>
    </main>'''

def scr_sheet():
    cats = ["Básicos", "Redes", "Negocio", "Multimedia", "Captura"]
    tipos = [("btn", "Botón", "Un enlace con texto"), ("wa", "WhatsApp", "Abre un chat con mensaje listo"), ("map", "Ubicación", "Mapa y «Cómo llegar»"),
             ("clock", "Horario", "Días y horas de atención"), ("cal", "Reservas", "Liga a tu agenda"), ("mail", "Correo", "Recibe suscriptores")]
    lis = "".join(f'<li><button class="tipo">{ic(i)}<span><b>{t}</b><small>{d}</small></span></button></li>' for i, t, d in tipos)
    ch = "".join(f'<button class="chip{" on" if c=="Negocio" else ""}" aria-pressed="{"true" if c=="Negocio" else "false"}">{c}</button>' for c in cats)
    return f'''{topbar("Café La Ceiba", izq="back", der='<button class="btn-s ghost">Publicar</button>')}
    <main class="body dim" aria-hidden="true">{seg()}<ul class="blocks">{blocks(False)}</ul></main>
    <section class="sheet" role="dialog" aria-label="Añadir bloque"><span class="handle" aria-hidden="true"></span>
      <div class="sheet-h"><h2>Añadir bloque</h2><button class="iconbtn" aria-label="Cerrar">{ic("plus",22,"ic x")}</button></div>
      <label class="field"><span class="sr">Buscar bloque</span>{ic("search",20)}<input placeholder="Buscar: horario, mapa, video…" /></label>
      <div class="chips scroll" role="group" aria-label="Categorías">{ch}</div>
      <ul class="tipos">{lis}</ul>
    </section>'''

def bio(t, embed=False):
    st = (f'--b-bg:{t["bg"]};--b-ink:{t["ink"]};--b-ink2:{t["ink2"]};--b-btn:{t["btn"]};--b-btnink:{t["btnink"]};'
          f'--b-r:{t["btnr"]};--b-alt:{t["alt"]};--b-line:{t["line"]};--b-font:{t["font"]}')
    btns = [("wa", "Pide por WhatsApp"), ("link", "Menú del día"), ("map", "Cómo llegar"), ("cal", "Reserva para grupos")]
    b = "".join(f'<a class="b-btn" href="#">{ic(i,20)}<span>{x}</span></a>' for i, x in btns)
    return f'''<div class="bio" style="{st}">
      <div class="b-head"><div class="b-av" aria-hidden="true">LC</div><h1 class="b-n">Café La Ceiba</h1>
      <p class="b-d">Café de especialidad y pan de masa madre en Coyoacán, CDMX.</p></div>
      <div class="b-btns">{b}</div>
      <div class="b-card"><h2>{ic("clock",18)} Horario</h2><dl><dt>Lun a vie</dt><dd>8:00 – 20:00</dd><dt>Sábado</dt><dd>9:00 – 21:00</dd><dt>Domingo</dt><dd>Cerrado</dd></dl></div>
      <div class="b-soc"><a href="#" aria-label="Instagram">{ic("ig")}</a><a href="#" aria-label="TikTok">{ic("tt")}</a><a href="#" aria-label="Facebook">{ic("fb")}</a></div>
      <p class="b-foot">Hecho con tubio · software libre</p></div>'''

def scr_preview(d):
    return f'''{topbar("Café La Ceiba", izq="back", der='<button class="btn-s ghost">Publicar</button>')}
    <main class="body">{seg("Vista previa")}<div class="pv">{bio(d["bio1"], True)}</div></main>'''

def scr_stats():
    dias = [42,38,51,47,60,55,72,66,58,61,79,84,70,68,90,95,88,76,81,99,104,97,92,110,118,101,96,124,131,127]
    mx = max(dias); w = 334; h = 140; bw = w/len(dias)
    bars = "".join(f'<rect x="{i*bw+1:.1f}" y="{h-v/mx*h:.1f}" width="{bw-3:.1f}" height="{v/mx*h:.1f}" rx="2"/>' for i, v in enumerate(dias))
    top = [("Pide por WhatsApp", 512, 100), ("Menú del día", 301, 59), ("Cómo llegar", 188, 37), ("Reserva para grupos", 74, 14)]
    tl = "".join(f'<li><span class="r-t">{t}</span><span class="r-n mono">{n}</span><span class="r-bar" style="--p:{p}%" aria-hidden="true"></span></li>' for t, n, p in top)
    return f'''{topbar("Estadísticas")}
    <main class="body">
      <div class="st-h"><button class="sel">Café La Ceiba {ic("back",16,"ic rot")}</button></div>
      <div class="chips" role="group" aria-label="Periodo"><button class="chip" aria-pressed="false">7 días</button><button class="chip on" aria-pressed="true">30 días</button><button class="chip" aria-pressed="false">90 días</button></div>
      <section class="kpi-main"><p class="kpi-l">Visitas a la página</p><p class="kpi-n">2 631</p><p class="kpi-d up">▲ 18 % contra los 30 días previos</p></section>
      <dl class="kpis"><div><dt>Clics</dt><dd class="mono">1 075</dd></div><div><dt>Tasa de clic</dt><dd class="mono">40,9 %</dd></div><div><dt>Escaneos QR</dt><dd class="mono">388</dd></div></dl>
      <figure class="chart"><figcaption>Visitas por día</figcaption><svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Visitas diarias, tendencia al alza, de 38 a 131">{bars}</svg>
      <div class="axis mono"><span>24 sep</span><span>8 oct</span><span>23 oct</span></div></figure>
      <section class="ranking"><h2>Enlaces más tocados</h2><ol>{tl}</ol></section>
      <p class="hint">Sin IPs ni cookies de rastreo: contamos visitas, no personas.</p>
    </main>{tabbar("Estadísticas")}'''

def desktop(d):
    nav = "".join(f'<a href="#" class="{"on" if n=="Enlaces" else ""}">{ic(i,20)}<span>{n}</span></a>' for n, i in [("Enlaces","link"),("QR","qr"),("Estadísticas","chart"),("Cuenta","user")])
    return f'''<div class="desk">
      <aside class="side"><span class="logo">tubio</span><button class="btn">{ic("plus",20)} Crear</button><nav>{nav}</nav></aside>
      <section class="desk-main"><header class="desk-h"><div><p class="crumb">Enlaces / Página bio</p><h1>Café La Ceiba</h1></div>
        <div class="desk-a"><p class="hint">{ic("check",16)} Guardado</p><button class="btn-s ghost">{ic("copy",18)} Copiar enlace</button><button class="btn">Publicar</button></div></header>
        <div class="desk-tabs" role="tablist"><button class="on" role="tab" aria-selected="true">Bloques</button><button role="tab" aria-selected="false">Diseño</button><button role="tab" aria-selected="false">Ajustes</button></div>
        <ul class="blocks">{blocks()}</ul><button class="btn add">{ic("plus",20)} Añadir bloque</button></section>
      <aside class="desk-pv"><p class="kpi-l">Vista previa en vivo</p><div class="phone mini">{bio(d["bio1"])}</div></aside>
    </div>'''

# ------------------------------------------------------------------ CSS
BASE = r'''
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font:16px/1.5 var(--f-body);}
h1,h2,h3,p,dl,dd,ol,ul,figure{margin:0}ul,ol{list-style:none;padding:0}button{font:inherit;color:inherit}a{color:inherit;text-decoration:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.mono{font-family:var(--f-num);font-variant-numeric:tabular-nums}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.doc{max-width:1360px;margin:0 auto;padding:48px 32px 96px}
.doc-h{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:32px;align-items:end;border-bottom:1px solid var(--line);padding-bottom:32px}
.doc-h .k{font:600 14px/1 var(--f-body);letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.doc-h h1{font-family:var(--f-display);font-weight:var(--dispw);font-size:72px;line-height:1;margin-top:12px;VAR_DISPX}
.doc-h .lin{font-size:22px;line-height:1.35;margin-top:12px}
.doc-h .por{color:var(--ink2);font-size:16px}
.sec{margin-top:56px}.sec>h2{font-family:var(--f-display);font-weight:var(--dispw);font-size:32px;line-height:1.1;margin-bottom:8px;VAR_DISPX}
.sec>p{color:var(--ink2);max-width:70ch;margin-bottom:24px}
.tok{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.pal{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:20px}
.pal h3{font-size:16px;margin-bottom:12px}
.sw{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:14px}
.sw i{width:44px;height:32px;border-radius:var(--r-sm);border:1px solid rgba(0,0,0,.12)}
.sw code{font-family:var(--f-num);font-size:14px;color:var(--ink2)}
.aa{font:600 14px var(--f-num)}
.scale{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:20px}
.scale div{display:flex;align-items:baseline;gap:16px;border-top:1px solid var(--line);padding:8px 0}
.scale span:first-child{width:120px;flex:none;font:14px var(--f-num);color:var(--ink2)}
.misc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:24px}
.misc>div{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:20px;font-size:14px}
.misc h3{font-size:16px;margin-bottom:12px}
.rd{display:flex;gap:12px;align-items:end}.rd i{display:block;width:56px;height:56px;background:var(--soft);border:1px solid var(--accent)}
.sp{display:flex;gap:6px;align-items:end}.sp i{display:block;background:var(--accent);width:12px}
pre.vars{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:20px;overflow:auto;font:14px/1.55 var(--f-num);color:var(--ink);max-height:420px}
.row{display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start}
.shot{margin:0;display:flex;flex-direction:column;gap:12px}.shot figcaption{font-size:14px;color:var(--ink2);max-width:390px}

/* ---- teléfono 390×844 ---- */
.phone{width:390px;height:844px;position:relative;overflow:hidden;background:var(--bg);color:var(--ink);border-radius:44px;
  box-shadow:0 0 0 10px #1d1d1f,0 0 0 11px #3a3a3c,0 30px 60px -30px rgba(0,0,0,.5);display:flex;flex-direction:column;font-family:var(--f-body)}
.phone::before{content:"9:41";display:block;height:44px;flex:none;padding:14px 32px 0;font:600 15px var(--f-body)}
.top{height:56px;flex:none;display:flex;align-items:center;gap:8px;padding:0 12px 0 16px;border-bottom:1px solid var(--line);background:var(--bg)}
.logo{font-family:var(--f-display);font-weight:var(--dispw);font-size:24px;letter-spacing:-.02em;color:var(--accent);VAR_DISPX}
.top-t{flex:1;font-size:17px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iconbtn{width:44px;height:44px;flex:none;display:grid;place-items:center;border:0;background:none;border-radius:var(--r-sm);color:var(--ink);cursor:pointer}
.iconbtn:hover{background:var(--s2)}
.avatar{width:44px;height:44px;flex:none;border-radius:50%;border:1px solid var(--line);background:var(--soft);color:var(--ink);font-weight:700;font-size:14px}
.body{flex:1;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:16px}
.field{display:flex;align-items:center;gap:8px;height:48px;padding:0 14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);color:var(--ink2)}
.field input{flex:1;height:100%;border:0;background:none;font:16px var(--f-body);color:var(--ink);min-width:0;outline:none}
.field input::placeholder{color:var(--ink2)}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chips.scroll{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-right:-16px;padding-right:16px}
.chip{min-height:44px;padding:0 16px;border-radius:var(--btnr);border:1px solid var(--line);background:var(--surface);font-size:15px;font-weight:500;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.chip b{font-family:var(--f-num);font-weight:500;opacity:.8}
.list{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--cardr);overflow:hidden;box-shadow:var(--shadow)}
.item{display:flex;align-items:center;gap:4px;padding:12px 4px 12px 16px;border-top:1px solid var(--line)}.item:first-child{border-top:0}
.item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;min-height:44px}
.item-t{font-weight:700;font-size:16px}.item-u{font-size:14px;color:var(--accent)}
.item-m{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--ink2);margin-top:4px}
.pill{font-size:14px;padding:1px 8px;border-radius:var(--r-sm);background:var(--s2);color:var(--ink)}
.tabbar{height:84px;flex:none;display:grid;grid-template-columns:repeat(5,1fr);align-items:start;padding:6px 6px 0;border-top:1px solid var(--line);background:var(--surface)}
.tab{min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:14px;color:var(--ink2);position:relative}
.tab.on{color:var(--ink);font-weight:700}.tab.on::before{content:"";position:absolute;top:-6px;left:22%;right:22%;height:3px;border-radius:0 0 3px 3px;background:var(--accent)}
.crear{min-height:56px;margin:0 4px;border:0;border-radius:var(--r-md);background:var(--accent);color:var(--onaccent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;font-size:14px;font-weight:700;cursor:pointer;box-shadow:var(--shadow)}
.btn,.btn-s{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 20px;border:0;border-radius:var(--btnr);background:var(--accent);color:var(--onaccent);font-weight:700;font-size:16px;cursor:pointer}
.btn-s{min-height:44px;padding:0 16px;font-size:15px}.ghost{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}
.add{width:100%;background:var(--soft);color:var(--ink);border:1.5px dashed var(--accent)}
.seg{display:grid;grid-template-columns:1fr 1fr;padding:4px;background:var(--s2);border-radius:calc(var(--r-md) + 2px);gap:4px}
.seg button{min-height:44px;border:0;background:none;border-radius:var(--r-md);font-weight:600;font-size:15px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--ink2)}
.seg .on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow), 0 0 0 1px var(--line)}
.hint{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--ink2)}.hint .ic{color:var(--ok)}
.blocks{display:flex;flex-direction:column;gap:8px}
.blk{display:flex;align-items:center;gap:4px;min-height:64px;padding:6px 4px;background:var(--surface);border:1px solid var(--line);border-radius:var(--cardr);box-shadow:var(--shadow)}
.blk .grip{width:44px;height:44px;flex:none;border:0;background:none;color:var(--ink2);display:grid;place-items:center;cursor:grab;border-radius:var(--r-sm)}
.blk-i{width:36px;height:36px;flex:none;display:grid;place-items:center;border-radius:var(--r-sm);background:var(--soft);color:var(--accent)}
.blk-b{flex:1;min-width:0;display:flex;flex-direction:column;padding-left:8px}
.blk-k{font-size:14px;color:var(--ink2);display:flex;gap:8px;align-items:center}.estado{display:inline-flex;gap:4px;align-items:center;font-weight:600;color:var(--ink)}
.blk-t{font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blk.lift{transform:rotate(-1.2deg) translateY(-4px);box-shadow:0 18px 30px -16px rgba(0,0,0,.45),0 0 0 2px var(--accent);position:relative;z-index:2}
.blk.off .blk-t,.blk.off .blk-i{opacity:.55}
.drop{height:8px;border-radius:4px;background:var(--accent);opacity:.35;margin:-2px 24px}
.dim{filter:saturate(.6);opacity:.35}
.sheet{position:absolute;left:0;right:0;bottom:0;height:610px;background:var(--surface);border-radius:var(--r-lg) var(--r-lg) 0 0;box-shadow:var(--sheetshadow);padding:8px 16px 24px;display:flex;flex-direction:column;gap:12px}
.handle{width:40px;height:5px;border-radius:3px;background:var(--line);align-self:center;margin:4px 0}
.sheet-h{display:flex;justify-content:space-between;align-items:center}.sheet-h h2{font-family:var(--f-display);font-weight:var(--dispw);font-size:24px;VAR_DISPX}
.ic.x{transform:rotate(45deg)}.ic.rot{transform:rotate(-90deg)}
.tipos{display:flex;flex-direction:column}
.tipo{width:100%;min-height:60px;display:flex;align-items:center;gap:14px;padding:8px 4px;border:0;border-top:1px solid var(--line);background:none;text-align:left;cursor:pointer}
.tipo .ic{flex:none;width:40px;height:40px;padding:9px;border-radius:var(--r-sm);background:var(--soft);color:var(--accent)}
.tipo span{display:flex;flex-direction:column}.tipo b{font-size:16px}.tipo small{font-size:14px;color:var(--ink2)}
.pv{flex:1;border:1px solid var(--line);border-radius:var(--cardr);overflow:hidden}
/* ---- página bio ---- */
.bio{height:100%;background:var(--b-bg);color:var(--b-ink);padding:28px 20px 20px;display:flex;flex-direction:column;gap:20px;font-family:var(--f-body)}
.b-head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.b-av{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:var(--b-alt);border:2px solid var(--b-line);font-family:var(--b-font);font-weight:700;font-size:28px}
.b-n{font-family:var(--b-font);font-weight:var(--dispw);font-size:30px;line-height:1.1;VAR_DISPX}
.b-d{color:var(--b-ink2);font-size:16px;max-width:30ch}
.b-btns{display:flex;flex-direction:column;gap:10px}
.b-btn{min-height:56px;display:flex;align-items:center;gap:12px;padding:0 20px;border-radius:var(--b-r);background:var(--b-btn);color:var(--b-btnink);font-weight:700;font-size:17px}
.b-btn span{flex:1;text-align:center;margin-right:32px}
.b-card{background:var(--b-alt);border:1px solid var(--b-line);border-radius:calc(var(--b-r) > 30px ? 18px : var(--b-r));border-radius:min(var(--b-r),18px);padding:16px}
.b-card h2{font-size:16px;display:flex;gap:6px;align-items:center;margin-bottom:8px}
.b-card dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:15px}.b-card dt{color:var(--b-ink2)}.b-card dd{font-family:var(--f-num);font-variant-numeric:tabular-nums}
.b-soc{display:flex;justify-content:center;gap:8px}.b-soc a{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--b-line)}
.b-foot{text-align:center;font-size:14px;color:var(--b-ink2);margin-top:auto}
.phone.bioframe::before{color:var(--ink);mix-blend-mode:difference;filter:invert(1)}
/* ---- estadísticas ---- */
.sel{min-height:44px;border:1px solid var(--line);background:var(--surface);border-radius:var(--btnr);padding:0 14px;font-weight:700;display:inline-flex;gap:6px;align-items:center}
.kpi-main{border-bottom:1px solid var(--line);padding-bottom:12px}
.kpi-l{font-size:14px;color:var(--ink2);font-weight:600}
.kpi-n{font-family:var(--f-num);font-weight:700;font-size:52px;line-height:1.05;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kpi-d{font-size:14px;font-weight:600}.up{color:var(--ok)}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kpis div{border-left:1px solid var(--line);padding-left:10px}.kpis div:first-child{border-left:0;padding-left:0}
.kpis dt{font-size:14px;color:var(--ink2)}.kpis dd{font-size:20px;font-weight:700}
.chart figcaption{font-size:14px;font-weight:600;margin-bottom:8px}.chart svg{display:block;fill:var(--accent)}
.axis{display:flex;justify-content:space-between;font-size:14px;color:var(--ink2);margin-top:4px}
.ranking h2{font-size:16px;margin-bottom:6px}.ranking li{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:6px 0;font-size:15px}
.r-bar{grid-column:1/-1;height:6px;border-radius:3px;background:var(--s2);position:relative;overflow:hidden}.r-bar::after{content:"";position:absolute;inset:0 auto 0 0;width:var(--p);background:var(--accent)}
/* ---- escritorio ---- */
.desk{width:1280px;height:800px;display:grid;grid-template-columns:232px 1fr 400px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;box-shadow:0 30px 60px -40px rgba(0,0,0,.5)}
.side{border-right:1px solid var(--line);padding:24px 16px;display:flex;flex-direction:column;gap:20px;background:var(--surface)}
.side nav{display:flex;flex-direction:column;gap:4px}.side nav a{min-height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:var(--r-sm);color:var(--ink2);font-weight:500}
.side nav a.on{background:var(--soft);color:var(--ink);font-weight:700}
.desk-main{padding:28px 32px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.desk-h{display:flex;justify-content:space-between;align-items:end;gap:16px}.crumb{font-size:14px;color:var(--ink2)}
.desk-h h1{font-family:var(--f-display);font-weight:var(--dispw);font-size:36px;line-height:1.1;VAR_DISPX}
.desk-a{display:flex;gap:10px;align-items:center}
.desk-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}.desk-tabs button{min-height:44px;padding:0 16px;border:0;background:none;font-weight:600;color:var(--ink2);border-bottom:3px solid transparent;cursor:pointer}
.desk-tabs .on{color:var(--ink);border-color:var(--accent)}
.desk-pv{border-left:1px solid var(--line);padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--s2)}
.phone.mini{width:300px;height:640px;border-radius:32px;box-shadow:0 0 0 8px #1d1d1f,0 20px 40px -24px rgba(0,0,0,.5)}
.phone.mini::before{height:28px;padding:6px 24px 0;font-size:13px}
.phone.mini .bio{padding:20px 16px;gap:14px}.phone.mini .b-btn{min-height:48px;font-size:15px}.phone.mini .b-av{width:64px;height:64px;font-size:22px}.phone.mini .b-n{font-size:24px}
.ndon{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:20px;font-size:15px;columns:2;column-gap:32px}
.ndon li{break-inside:avoid;padding:4px 0 4px 22px;position:relative}.ndon li::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:700}
@media (prefers-reduced-motion: no-preference){.btn,.chip,.iconbtn,.tab{transition:background-color .15s,color .15s}}
'''

def vars_css(d, modo):
    c = d[modo]
    r = d["r"]
    return (f"  --bg:{c['bg']}; --surface:{c['surface']}; --s2:{c['s2']}; --ink:{c['ink']}; --ink2:{c['ink2']};\n"
            f"  --line:{c['line']}; --accent:{c['accent']}; --onaccent:{c['onaccent']}; --soft:{c['soft']}; --ok:{c['ok']};")

def tokens_block(d):
    r = d["r"]
    comunes = f'''  /* tipografía */
  --f-display:{d["fdisplay"]}, ui-serif, serif; --f-body:{d["fbody"]}, system-ui, sans-serif; --f-num:{d["fnum"]}, ui-monospace, monospace;
  --dispw:{d["dispw"]};
  /* escala (móvil · se escala ×1.125 desde 768px) */
  --t-xs:14px; --t-sm:15px; --t-base:16px; --t-md:18px; --t-lg:22px; --t-xl:30px; --t-2xl:40px; --t-kpi:52px;
  /* radios con intención: sm controles chicos · md campos/chips · lg hojas · pill/btn botones */
  --r-sm:{r[0]}px; --r-md:{r[1]}px; --r-lg:{r[2]}px; --btnr:{d["btnr"]}; --cardr:{d["cardr"]};
  /* espaciado base 4 */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px; --s-10:40px; --s-12:48px;
  /* sombras */
  --shadow:{d["shadow"]}; --sheetshadow:{d["sheetshadow"]};
  /* táctil */
  --touch:44px;'''
    return (":root{\n" + comunes + "\n  /* claro */\n" + vars_css(d, "light") + "\n}\n"
            "@media (prefers-color-scheme: dark){:root:not([data-theme=light]){\n" + vars_css(d, "dark") + "\n}}\n"
            ":root[data-theme=dark]{\n" + vars_css(d, "dark") + "\n}\n")

def swatches(d, modo):
    c = d[modo]
    filas = [("bg", "Fondo", "ink"), ("surface", "Superficie", "ink"), ("s2", "Superficie 2", "ink"), ("ink", "Texto", "bg"),
             ("ink2", "Texto secundario", "bg"), ("line", "Línea (no texto)", None), ("accent", "Acento", "bg"), ("onaccent", "Texto sobre acento", "accent"),
             ("soft", "Acento suave", "ink"), ("ok", "Éxito", "bg")]
    out = []
    peor = 99
    for k, n, contra in filas:
        if contra:
            ratio = cr(c[k], c[contra]) if k not in ("bg", "surface", "s2", "soft") else cr(c["ink"], c[k])
            if k == "ink2": ratio = min(cr(c["ink2"], c["bg"]), cr(c["ink2"], c["surface"]))
            if k == "accent": ratio = min(cr(c["accent"], c["bg"]), cr(c["accent"], c["surface"]))
            peor = min(peor, ratio)
            lab = f'{ratio:.1f}:1 {"AA" if ratio >= 4.5 else "⚠"}'
        else:
            lab = "decorativa"
        out.append(f'<div class="sw"><i style="background:{c[k]}"></i><span>{n}<br><code>--{k} {c[k]}</code></span><span class="aa">{lab}</span></div>')
    return "".join(out), peor

def page(d):
    fuente = f'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?{d["fonts"]}&display=swap" rel="stylesheet">'
    css = BASE.replace("VAR_DISPX", d["dispx"])
    lt, pl = swatches(d, "light"); dk, pd = swatches(d, "dark")
    bio_checks = []
    for b in (d["bio1"], d["bio2"]):
        bio_checks.append((b["nombre"], cr(b["ink"], b["bg"]), cr(b["btnink"], b["btn"]), cr(b["ink2"], b["bg"])))
    tok = tokens_block(d)
    scale = "".join(f'<div><span>--t-{k} {v}px</span><span style="font-size:{v}px;{f}">{s}</span></div>' for k, v, s, f in [
        ("kpi", 52, "2 631", "font-family:var(--f-num);font-weight:700"), ("2xl", 40, "Café La Ceiba", "font-family:var(--f-display);font-weight:var(--dispw)"),
        ("xl", 30, "Tu página bio", "font-family:var(--f-display);font-weight:var(--dispw)"), ("lg", 22, "Añadir bloque", "font-weight:700"),
        ("md", 18, "Pide por WhatsApp", "font-weight:700"), ("base", 16, "Texto de campos y cuerpo (16 px: iOS no hace zoom)", ""),
        ("sm", 15, "Chips, pestañas del editor", ""), ("xs", 14, "Mínimo absoluto: metadatos, ejes, pies", "")])
    dark_attr = 'data-theme="dark"'
    bc = "".join(f"<li>Tema «{n}»: texto {a:.1f}:1, botón {b:.1f}:1, secundario {c:.1f}:1 {'✔ AA' if min(a,b,c)>=4.5 else '⚠'}</li>" for n,a,b,c in bio_checks)
    html = f'''<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>tubio v2 · {d["nombre"]}</title>{fuente}
<style>
/* ====== TOKENS «{d["nombre"]}» — copiar tal cual a tokens.css ====== */
{tok}
:root{{--page:var(--bg)}}
{css}
</style></head><body>
<div class="doc">
  <header class="doc-h"><div><p class="k">tubio v2 · dirección {d["slug"][0].upper()}</p><h1>{d["nombre"]}</h1><p class="lin">{d["linea"]}</p></div>
  <p class="por">{d["porque"]}<br><br><b>Fuentes:</b> {d["lic"]}. Se sirven desde tubio (woff2 propios), no desde Google.</p></header>

  <section class="sec"><h2>Tokens</h2><p>Variables CSS listas para un solo archivo. Contraste medido con la fórmula WCAG 2.x; peor caso de texto: claro {pl:.1f}:1, oscuro {pd:.1f}:1.</p>
    <div class="tok"><div class="pal"><h3>Claro</h3>{lt}</div><div class="pal" style="background:{d['dark']['surface']};color:{d['dark']['ink']};border-color:{d['dark']['line']}"><h3>Oscuro</h3>{dk}</div></div>
    <div class="misc">
      <div class="scale" style="grid-column:span 2"><h3>Escala tipográfica (móvil)</h3>{scale}</div>
      <div><h3>Radios</h3><div class="rd"><i style="border-radius:{d['r'][0]}px"></i><i style="border-radius:{d['r'][1]}px"></i><i style="border-radius:{d['r'][2]}px"></i><i style="border-radius:{d['btnr']};width:96px;height:44px"></i></div>
        <p style="margin-top:12px">sm {d['r'][0]} · md {d['r'][1]} · lg {d['r'][2]} · botón {d['btnr']}</p>
        <h3 style="margin-top:20px">Espaciado (base 4)</h3><div class="sp">{"".join(f'<i style="height:{v}px" title="{v}px"></i>' for v in (4,8,12,16,20,24,32,40,48))}</div><p style="margin-top:8px">4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48</p>
        <h3 style="margin-top:20px">Sombra</h3><p><code class="mono">{d['shadow']}</code></p></div>
    </div>
    <details style="margin-top:24px"><summary style="min-height:44px;cursor:pointer;font-weight:700">Ver variables CSS</summary><pre class="vars">{tok}</pre></details>
  </section>

  <section class="sec"><h2>Panel y editor (390 px, claro)</h2><p>Barra superior de 56 px (antes ~170), pestañas abajo con «Crear» al centro, un solo menú «⋯» por fila. Editor con interruptor Editar | Vista previa y agarradera para arrastrar; el bloque levantado muestra dónde va a caer.</p>
    <div class="row">{phone(scr_panel(), "1 · Enlaces: buscador de 16 px, filtros como chips, 1 botón por fila.")}
    {phone(scr_editor(), "2 · Editor: «Menú del día» se está arrastrando; el bloque oculto lo dice con texto e ícono, no sólo con color.")}
    {phone(scr_sheet(), "3 · Hoja «Añadir bloque»: buscador, categorías y tipos de 60 px de alto.")}
    {phone(scr_preview(d), "4 · Vista previa en vivo sin salir del editor.")}
    {phone(scr_stats(), "5 · Estadísticas: una cifra manda, tres de apoyo, gráfica diaria y ranking.")}</div></section>

  <section class="sec" {dark_attr}><h2>Modo oscuro</h2><p>Mismos componentes con la paleta oscura (respeta <code>prefers-color-scheme</code> y se puede fijar a mano).</p>
    <div class="row" data-theme="dark" style="{''.join(f'--{k}:{v};' for k,v in d['dark'].items())}">{phone(scr_panel(), "Enlaces, oscuro")}{phone(scr_editor(), "Editor, oscuro")}{phone(scr_stats(), "Estadísticas, oscuro")}</div></section>

  <section class="sec"><h2>Página bio pública: cafetería, 2 temas</h2><p>Botones de 56 px, horario como bloque propio, redes al final. Contraste de los temas:</p><ul class="ndon" style="columns:1">{bc}</ul>
    <div class="row" style="margin-top:24px">{phone(bio(d["bio1"]), "Tema «" + d["bio1"]["nombre"] + "»", "bioframe", d["bio1"]["bg"])}{phone(bio(d["bio2"]), "Tema «" + d["bio2"]["nombre"] + "»", "bioframe", d["bio2"]["bg"])}</div></section>

  <section class="sec"><h2>Escritorio: el editor a 1280 px</h2><p>Barra lateral en vez de pestañas, lista de bloques al centro y la vista previa en vivo fija a la derecha.</p>
    {desktop(d)}</section>

  <section class="sec"><h2>Cómo cumple el brief</h2><ul class="ndon">
    <li>Objetivos táctiles de 44 px o más (pestañas 56, botones de la bio 56, tipos de bloque 60).</li>
    <li>Texto mínimo 14 px; 16 px en campos.</li><li>Estados que no dependen sólo del color: pestaña activa con barra y negrita, bloque oculto con ícono y palabra, chips con aria-pressed.</li>
    <li>Contraste AA (4.5:1) en todo texto, claro y oscuro, medido arriba.</li><li>Transiciones sólo con <code>prefers-reduced-motion: no-preference</code>.</li>
    <li>Fuentes OFL servibles por nosotros.</li><li>Íconos propios de trazo, sin sets de terceros.</li><li>Diseño propio: no se tomó la interfaz de 66biolinks/AltumCode ni de alav.link.</li></ul></section>
</div></body></html>'''
    return html, (pl, pd, bio_checks)

res = {}
for d in D:
    h, chk = page(d)
    open(os.path.join(OUT, d["slug"] + ".html"), "w").write(h)
    res[d["slug"]] = chk
    print(d["slug"], "claro %.2f oscuro %.2f" % chk[:2], [(n, round(a,1), round(b,1), round(c,1)) for n,a,b,c in chk[2]])

# índice
cards = "".join(f'''<a class="dir" href="{d["slug"]}.html" style="--a:{d["light"]["accent"]};--bg:{d["light"]["bg"]};--ink:{d["light"]["ink"]};--ink2:{d["light"]["ink2"]};--line:{d["light"]["line"]};font-family:{d["fbody"]}">
  <span class="l">Dirección {d["slug"][0].upper()}</span><span class="n" style="font-family:{d["fdisplay"]};font-weight:{d["dispw"]};{d["dispx"]}">{d["nombre"]}</span><span class="p">{d["linea"]}</span>
  <span class="m"><i style="background:{d["light"]["bg"]}"></i><i style="background:{d["light"]["ink"]}"></i><i style="background:{d["light"]["accent"]}"></i><i style="background:{d["dark"]["bg"]}"></i><i style="background:{d["dark"]["accent"]}"></i></span>
  <img src="capturas/{d["slug"]}-movil.png" alt="Pantallas móviles de la dirección {d["nombre"]}" loading="lazy"></a>''' for d in D)
fam = "&".join(d["fonts"] for d in D)
idx = f'''<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tubio v2 · direcciones</title>
<link href="https://fonts.googleapis.com/css2?{fam}&display=swap" rel="stylesheet">
<style>body{{margin:0;background:#EFEDE7;color:#1A1A1A;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1360px;margin:0 auto;padding:48px 24px}}
h1{{font-size:40px;margin:0}}p.s{{color:#555;max-width:70ch}}.g{{display:flex;flex-direction:column;gap:32px;margin-top:32px}}
.dir{{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);grid-template-rows:auto auto auto 1fr;column-gap:32px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:28px;text-decoration:none}}
.dir img{{grid-column:2;grid-row:1/-1;width:100%;border-radius:6px}}.l{{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2)}}.n{{font-size:56px;line-height:1;color:var(--a)}}.p{{font-size:18px;margin-top:8px}}
.m{{display:flex;gap:6px;margin-top:16px}}.m i{{width:32px;height:32px;border-radius:4px;border:1px solid rgba(0,0,0,.15)}}.rec{{margin-top:24px;padding:16px 20px;background:#fff8;border:1px solid #ccc;border-radius:8px}}
@media(max-width:800px){{.dir{{grid-template-columns:1fr}}.dir img{{grid-column:1;grid-row:auto;margin-top:16px}}}}</style></head><body><main>
<h1>tubio v2: direcciones visuales</h1><p class="s">Tres caminos para Alejandro. Cada uno trae tokens (claro y oscuro, AA), maquetas móviles a 390 px (panel con pestañas, editor con Editar | Vista previa y arrastre, hoja «Añadir bloque», página bio de una cafetería en 2 temas, estadísticas) y el editor de escritorio.</p>
<div class="rec"><b>Recomendación de design:</b> <b>A · Mercado.</b> Es la que mejor le habla a negocios chicos en México desde el celular: cálida sin ser cursi, y su letra de cuerpo (Atkinson Hyperlegible) está hecha para leerse fácil. Si se prefiere una herramienta más neutra, la segunda opción es C · Taller. Los temas de la página bio son independientes del panel: se pueden ofrecer los seis.</div>
<div class="g">{cards}</div></main></body></html>'''
open(os.path.join(OUT, "index.html"), "w").write(idx)
