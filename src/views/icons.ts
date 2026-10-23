import { raw, type SafeHtml } from '../lib/html.ts'

/** Íconos propios (trazo 2 px, 24×24). Decorativos: aria-hidden; el texto va al lado. */
const P: Record<string, string> = {
  links: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6h-6M17 20.5v-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  bio: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9.5 8h5M9.5 12h5M9.5 16h5"/>',
  short: '<path d="M5 12h11M12 7l5 5-5 5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-1.4 1.8-2 3-2s2.2.6 3 2M14.5 10h4M14.5 13h3"/>',
  event: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/>',
}

export function icon(name: keyof typeof P | string, cls = 'ic'): SafeHtml {
  const fill = name === 'more' || name === 'grip'
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`)
}
