import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Redes del bloque "iconos sociales". Logos de Simple Icons (CC0-1.0, https://simpleicons.org);
 * los que no están ahí (LinkedIn) y los genéricos (correo, teléfono, sitio) son trazos propios.
 * `toUrl` acepta lo que suele pegar la gente: usuario, @usuario o la URL completa.
 */

export type Network = {
  id: string
  name: string
  color: string
  /** path SVG en un viewBox de 24×24 */
  path: string
  placeholder: string
  /** trazos propios con huecos: se pintan con fill-rule=evenodd */
  evenodd?: boolean
  toUrl: (value: string) => string | null
}

const require = createRequire(import.meta.url)
// 'simple-icons/icons.json' apunta a data/simple-icons.json
const SI_JSON = require.resolve('simple-icons/icons.json')
const SI_DIR = join(dirname(dirname(SI_JSON)), 'icons')
const SI_DATA = JSON.parse(readFileSync(SI_JSON, 'utf8')) as
  | { slug?: string; title: string; hex: string }[]
  | { icons: { slug?: string; title: string; hex: string }[] }
const SI_LIST = Array.isArray(SI_DATA) ? SI_DATA : SI_DATA.icons

function siPath(slug: string): string {
  const svg = readFileSync(join(SI_DIR, `${slug}.svg`), 'utf8')
  return /<path d="([^"]+)"/.exec(svg)?.[1] ?? ''
}

function siHex(slug: string, fallback = '#111111'): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const hit = SI_LIST.find((i) => (i.slug ?? norm(i.title)) === slug)
  return hit ? `#${hit.hex}` : fallback
}

function handle(v: string): string | null {
  const h = v.trim().replace(/^@/, '')
  return /^[\w.\-]{1,60}$/.test(h) ? h : null
}

/** Si ya es URL del host esperado la deja; si es usuario arma la URL con la plantilla */
function webOrHandle(hosts: string[], template: (h: string) => string) {
  return (value: string): string | null => {
    const v = value.trim()
    if (!v) return null
    if (/^https?:\/\//i.test(v) || hosts.some((h) => v.toLowerCase().startsWith(h))) {
      try {
        const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
        const hn = u.hostname.toLowerCase().replace(/^www\./, '')
        return hosts.some((h) => hn === h || hn.endsWith('.' + h)) ? (u.protocol === 'http:' ? u.href.replace(/^http:/, 'https:') : u.href) : null
      } catch {
        return null
      }
    }
    const h = handle(v)
    return h ? template(h) : null
  }
}

function anyWeb(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    return u.hostname.includes('.') ? u.href : null
  } catch {
    return null
  }
}

const si = (id: string, name: string, slug: string, hosts: string[], template: (h: string) => string, placeholder: string): Network => ({
  id,
  name,
  color: siHex(slug),
  path: siPath(slug),
  placeholder,
  toUrl: webOrHandle(hosts, template),
})

// trazos propios (24×24)
const PATH_LINKEDIN = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM6.5 9.5V18h2.6V9.5zM7.8 5.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 9.5V18h2.6v-4.4c0-1.2.4-2.1 1.6-2.1 1.1 0 1.3.9 1.3 2V18h2.6v-4.9c0-2.5-1.1-3.8-3.2-3.8-1.2 0-2 .6-2.4 1.2V9.5z'
const PATH_MAIL = 'M3 5h18v14H3zM4.6 6.6v.4l7.4 5.2L19.4 7v-.4zM4.6 9v8.4h14.8V9L12 14.2z'
const PATH_PHONE = 'M6.6 2.8 9.3 2l1.9 4.6-2 1.5a12 12 0 0 0 6.7 6.7l1.5-2 4.6 1.9-.8 2.7A3 3 0 0 1 18.3 20 16.3 16.3 0 0 1 4 5.7a3 3 0 0 1 2.6-2.9z'
const PATH_WEB = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.6 15.6 0 0 0-1.4-4 8.1 8.1 0 0 1 4.4 4zM12 4a14 14 0 0 1 1.9 4h-3.8A14 14 0 0 1 12 4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.8 2h3a15.6 15.6 0 0 0 1.4 4 8.1 8.1 0 0 1-4.4-4zm3-8h-3a8.1 8.1 0 0 1 4.4-4 15.6 15.6 0 0 0-1.4 4zM12 20a14 14 0 0 1-1.9-4h3.8A14 14 0 0 1 12 20zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.2 6a15.6 15.6 0 0 0 1.4-4h3a8.1 8.1 0 0 1-4.4 4zm1.8-6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4z'

export const NETWORKS: Network[] = [
  si('instagram', 'Instagram', 'instagram', ['instagram.com'], (h) => `https://instagram.com/${h}`, '@usuario'),
  si('tiktok', 'TikTok', 'tiktok', ['tiktok.com'], (h) => `https://www.tiktok.com/@${h}`, '@usuario'),
  si('youtube', 'YouTube', 'youtube', ['youtube.com', 'youtu.be'], (h) => `https://youtube.com/@${h}`, '@canal'),
  si('x', 'X', 'x', ['x.com', 'twitter.com'], (h) => `https://x.com/${h}`, '@usuario'),
  si('facebook', 'Facebook', 'facebook', ['facebook.com', 'fb.com'], (h) => `https://facebook.com/${h}`, 'usuario'),
  si('threads', 'Threads', 'threads', ['threads.net', 'threads.com'], (h) => `https://www.threads.net/@${h}`, '@usuario'),
  {
    ...si('whatsapp', 'WhatsApp', 'whatsapp', ['wa.me', 'whatsapp.com', 'api.whatsapp.com'], () => '', '5215512345678'),
    toUrl: (v) => {
      const d = v.replace(/[\s().-]/g, '')
      if (/^\+?\d{8,15}$/.test(d)) return `https://wa.me/${d.replace('+', '')}`
      return webOrHandle(['wa.me', 'whatsapp.com', 'api.whatsapp.com'], () => '')(v)
    },
  },
  si('telegram', 'Telegram', 'telegram', ['t.me', 'telegram.me'], (h) => `https://t.me/${h}`, '@usuario'),
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0a66c2',
    path: PATH_LINKEDIN,
    evenodd: true,
    placeholder: 'https://linkedin.com/in/…',
    toUrl: webOrHandle(['linkedin.com'], (h) => `https://www.linkedin.com/in/${h}`),
  },
  si('bluesky', 'Bluesky', 'bluesky', ['bsky.app'], (h) => `https://bsky.app/profile/${h.includes('.') ? h : h + '.bsky.social'}`, '@usuario.bsky.social'),
  { ...si('mastodon', 'Mastodon', 'mastodon', [], () => '', 'https://instancia/@usuario'), toUrl: anyWeb },
  si('pinterest', 'Pinterest', 'pinterest', ['pinterest.com', 'pin.it'], (h) => `https://pinterest.com/${h}`, 'usuario'),
  si('snapchat', 'Snapchat', 'snapchat', ['snapchat.com'], (h) => `https://www.snapchat.com/add/${h}`, 'usuario'),
  si('twitch', 'Twitch', 'twitch', ['twitch.tv'], (h) => `https://twitch.tv/${h}`, 'canal'),
  si('kick', 'Kick', 'kick', ['kick.com'], (h) => `https://kick.com/${h}`, 'canal'),
  si('discord', 'Discord', 'discord', ['discord.gg', 'discord.com'], (h) => `https://discord.gg/${h}`, 'invitación'),
  si('reddit', 'Reddit', 'reddit', ['reddit.com'], (h) => `https://reddit.com/user/${h}`, 'usuario'),
  si('spotify', 'Spotify', 'spotify', ['open.spotify.com', 'spotify.com'], (h) => `https://open.spotify.com/user/${h}`, 'https://open.spotify.com/…'),
  si('applemusic', 'Apple Music', 'applemusic', ['music.apple.com'], () => '', 'https://music.apple.com/…'),
  si('soundcloud', 'SoundCloud', 'soundcloud', ['soundcloud.com'], (h) => `https://soundcloud.com/${h}`, 'usuario'),
  si('github', 'GitHub', 'github', ['github.com'], (h) => `https://github.com/${h}`, 'usuario'),
  si('behance', 'Behance', 'behance', ['behance.net'], (h) => `https://behance.net/${h}`, 'usuario'),
  si('dribbble', 'Dribbble', 'dribbble', ['dribbble.com'], (h) => `https://dribbble.com/${h}`, 'usuario'),
  si('patreon', 'Patreon', 'patreon', ['patreon.com'], (h) => `https://patreon.com/${h}`, 'usuario'),
  si('kofi', 'Ko-fi', 'kofi', ['ko-fi.com'], (h) => `https://ko-fi.com/${h}`, 'usuario'),
  si('substack', 'Substack', 'substack', ['substack.com'], (h) => `https://${h}.substack.com`, 'usuario'),
  si('medium', 'Medium', 'medium', ['medium.com'], (h) => `https://medium.com/@${h}`, '@usuario'),
  si('tumblr', 'Tumblr', 'tumblr', ['tumblr.com'], (h) => `https://${h}.tumblr.com`, 'usuario'),
  si('vk', 'VK', 'vk', ['vk.com'], (h) => `https://vk.com/${h}`, 'usuario'),
  si('paypal', 'PayPal', 'paypal', ['paypal.me', 'paypal.com'], (h) => `https://paypal.me/${h}`, 'usuario'),
  si('signal', 'Signal', 'signal', ['signal.me', 'signal.group'], () => '', 'https://signal.me/…'),
  {
    id: 'email',
    name: 'Correo',
    color: '#ea4335',
    path: PATH_MAIL,
    evenodd: true,
    placeholder: 'hola@ejemplo.com',
    toUrl: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? `mailto:${v.trim()}` : null),
  },
  {
    id: 'phone',
    name: 'Teléfono',
    color: '#16a34a',
    path: PATH_PHONE,
    placeholder: '+52 55 1234 5678',
    toUrl: (v) => {
      const d = v.replace(/[\s().-]/g, '')
      return /^\+?\d{6,15}$/.test(d) ? `tel:${d}` : null
    },
  },
  { id: 'website', name: 'Sitio web', color: '#475569', path: PATH_WEB, evenodd: true, placeholder: 'https://…', toUrl: anyWeb },
]

export const NETWORK_BY_ID = new Map(NETWORKS.map((n) => [n.id, n]))

/** Normaliza y descarta lo vacío; las URLs que la plantilla devuelve vacías cuentan como inválidas */
export function normalizeSocial(id: string, value: string): string | null {
  const n = NETWORK_BY_ID.get(id)
  if (!n) return null
  const r = n.toUrl(value)
  return r ? r : null
}
