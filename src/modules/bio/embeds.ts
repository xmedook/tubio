/**
 * Convierte la URL que pega el usuario en la URL oficial de embed del proveedor.
 * Sólo se aceptan los hosts conocidos; el ID se valida con una expresión estricta.
 */

export type Embed = { src: string; ratio: '16x9' | '9x16' | 'fixed'; height?: number }

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')

export function youtubeEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u) return null
  const h = host(u)
  let id: string | null = null
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null
  else if (h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)
      id = m?.[1] ?? null
    }
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  const shorts = u.pathname.startsWith('/shorts/')
  const t = Number(u.searchParams.get('t')?.replace(/s$/, '')) || 0
  return { src: `https://www.youtube-nocookie.com/embed/${id}${t ? `?start=${t}` : ''}`, ratio: shorts ? '9x16' : '16x9' }
}

export function vimeoEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u) return null
  const h = host(u)
  if (h !== 'vimeo.com' && h !== 'player.vimeo.com') return null
  const m = /(?:^|\/)(\d{6,12})(?:\/([0-9a-f]{6,20}))?(?:$|[/?#])/.exec(u.pathname)
  if (!m) return null
  const hash = m[2] ?? u.searchParams.get('h')
  return { src: `https://player.vimeo.com/video/${m[1]}${hash && /^[0-9a-f]+$/.test(hash) ? `?h=${hash}` : ''}`, ratio: '16x9' }
}

export function tiktokEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'tiktok.com') return null
  const m = /\/video\/(\d{8,25})/.exec(u.pathname)
  return m ? { src: `https://www.tiktok.com/player/v1/${m[1]}?rel=0`, ratio: '9x16' } : null
}

/** Twitch pide el dominio que incrusta (parent) */
export function twitchEmbed(url: string, parentHost: string): Embed | null {
  const u = parse(url)
  if (!u) return null
  const h = host(u)
  if (h !== 'twitch.tv') return null
  const parent = encodeURIComponent(parentHost)
  const video = /^\/videos\/(\d{5,15})/.exec(u.pathname)
  if (video) return { src: `https://player.twitch.tv/?video=${video[1]}&parent=${parent}&autoplay=false`, ratio: '16x9' }
  const clip = /^\/[\w]{3,25}\/clip\/([\w-]{5,100})/.exec(u.pathname)
  if (clip) return { src: `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${parent}&autoplay=false`, ratio: '16x9' }
  const ch = /^\/([\w]{3,25})\/?$/.exec(u.pathname)
  if (ch) return { src: `https://player.twitch.tv/?channel=${ch[1]}&parent=${parent}&autoplay=false&muted=true`, ratio: '16x9' }
  return null
}

export function spotifyEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'open.spotify.com') return null
  const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})/.exec(u.pathname)
  if (!m) return null
  return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, ratio: 'fixed', height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 }
}

export function soundcloudEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u) return null
  const h = host(u)
  if (h !== 'soundcloud.com' && h !== 'on.soundcloud.com') return null
  if (!/^\/[\w-]+(\/[\w-]+){0,2}\/?$/.test(u.pathname)) return null
  const clean = `https://soundcloud.com${u.pathname}`
  const isSet = u.pathname.includes('/sets/') || u.pathname.split('/').filter(Boolean).length === 1
  return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&visual=false&show_comments=false`, ratio: 'fixed', height: isSet ? 352 : 166 }
}

/** Orígenes que la CSP de la página bio deja incrustar */
export const EMBED_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.tiktok.com',
  'https://player.twitch.tv',
  'https://clips.twitch.tv',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
]

/** Audio/video por URL directa: https y extensión conocida */
export function mediaUrl(url: string, kind: 'video' | 'audio'): string | null {
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return null
  const ext = /\.([a-z0-9]{2,4})$/i.exec(u.pathname)?.[1]?.toLowerCase()
  const ok = kind === 'video' ? ['mp4', 'webm', 'mov', 'm4v', 'ogv'] : ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'webm']
  return ext && ok.includes(ext) ? u.href : null
}
