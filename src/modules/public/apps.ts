/**
 * «Abrir en la app»: si el destino es de una app conocida y quien abre está en un teléfono, una página
 * intermedia intenta abrir la app (Android: intent:// con respaldo a la web; iOS: esquema propio de la
 * app) y, si no está instalada, sigue a la web. Sirve sobre todo dentro de los navegadores de Instagram
 * o TikTok, que abren todo en su propia vista web.
 */
export type AppTarget = { app: string; name: string; ios: string | null; android: string | null }

type Def = { app: string; name: string; hosts: RegExp; pkg: string; ios: (u: URL) => string | null }

const DEFS: Def[] = [
  { app: 'youtube', name: 'YouTube', hosts: /^(www\.|m\.)?(youtube\.com|youtu\.be)$/, pkg: 'com.google.android.youtube', ios: (u) => `youtube://${u.host}${u.pathname}${u.search}` },
  { app: 'instagram', name: 'Instagram', hosts: /^(www\.)?instagram\.com$/, pkg: 'com.instagram.android', ios: (u) => {
      const user = /^\/([\w.]+)\/?$/.exec(u.pathname)?.[1]
      return user && !['p', 'reel', 'explore'].includes(user) ? `instagram://user?username=${encodeURIComponent(user)}` : `instagram://`
    } },
  { app: 'tiktok', name: 'TikTok', hosts: /^(www\.|vm\.|m\.)?tiktok\.com$/, pkg: 'com.zhiliaoapp.musically', ios: (u) => `snssdk1233://${u.host}${u.pathname}` },
  { app: 'spotify', name: 'Spotify', hosts: /^open\.spotify\.com$/, pkg: 'com.spotify.music', ios: (u) => {
      const m = /^\/(?:intl-\w+\/)?(track|album|artist|playlist|show|episode)\/(\w+)/.exec(u.pathname)
      return m ? `spotify:${m[1]}:${m[2]}` : null
    } },
  { app: 'facebook', name: 'Facebook', hosts: /^(www\.|m\.)?facebook\.com$/, pkg: 'com.facebook.katana', ios: (u) => `fb://facewebmodal/f?href=${encodeURIComponent(u.href)}` },
  { app: 'x', name: 'X', hosts: /^(www\.|mobile\.)?(x\.com|twitter\.com)$/, pkg: 'com.twitter.android', ios: (u) => {
      const user = /^\/(\w{1,15})\/?$/.exec(u.pathname)?.[1]
      return user ? `twitter://user?screen_name=${user}` : null
    } },
  { app: 'telegram', name: 'Telegram', hosts: /^(t\.me|telegram\.me)$/, pkg: 'org.telegram.messenger', ios: (u) => {
      const user = /^\/(\w{4,})\/?$/.exec(u.pathname)?.[1]
      return user ? `tg://resolve?domain=${user}` : null
    } },
  { app: 'linkedin', name: 'LinkedIn', hosts: /^(www\.)?linkedin\.com$/, pkg: 'com.linkedin.android', ios: (u) => `linkedin://${u.pathname.replace(/^\//, '')}` },
  { app: 'amazon', name: 'Amazon', hosts: /^(www\.)?amazon\.(com|com\.mx|es|co\.uk|de|fr|it|ca|com\.br)$/, pkg: 'com.amazon.mShop.android.shopping', ios: (u) => `com.amazon.mobile.shopping.web://${u.host}${u.pathname}${u.search}` },
]

export function appFor(dest: string): AppTarget | null {
  let u: URL
  try {
    u = new URL(dest)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const d = DEFS.find((x) => x.hosts.test(u.hostname.toLowerCase()))
  if (!d) return null
  const android = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=${d.pkg};S.browser_fallback_url=${encodeURIComponent(u.href)};end`
  return { app: d.app, name: d.name, ios: d.ios(u), android }
}

export function mobileOs(ua: string): 'ios' | 'android' | null {
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return null
}
