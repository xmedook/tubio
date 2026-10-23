import { raw, type SafeHtml } from '../../lib/html.ts'

/** Íconos de la portada (design, trazo 1.75). Decorativos. */
const I: Record<string, string> = {
  link: "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>",
  qr: "<rect x=\"4\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"14\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"4\" y=\"14\" width=\"6\" height=\"6\" rx=\"1\"/><path d=\"M14 14h2v2M20 14v6h-6v-2M17 17h0\"/>",
  chart: "<path d=\"M4 20V10M10 20V4M16 20v-8M21 20H3\"/>",
  user: "<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"/><path d=\"M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  grip: "<circle cx=\"9\" cy=\"6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"6\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"9\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"9\" cy=\"18\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15\" cy=\"18\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>",
  dots: "<circle cx=\"5.5\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"18.5\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/>",
  back: "<path d=\"M15 5l-7 7 7 7\"/>",
  search: "<circle cx=\"11\" cy=\"11\" r=\"6\"/><path d=\"M20 20l-4.5-4.5\"/>",
  eyeoff: "<path d=\"M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.6 3.3M6.4 7.5C4.6 8.8 3.3 10.6 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1\"/>",
  text: "<path d=\"M5 6h14M12 6v13M9 19h6\"/>",
  btn: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><path d=\"M8 12h8\"/>",
  img: "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M20 16l-5-5-8 8\"/>",
  wa: "<path d=\"M5 19l1.2-3.4A7.5 7.5 0 1 1 9 18.5z\"/><path d=\"M9.5 9.5c.3 1.6 1.9 3.6 4 4.3l1.1-1.1 1.5.8c-.2 1-1 1.6-2 1.6-3 0-5.8-2.8-5.8-5.8 0-1 .6-1.8 1.6-2l.8 1.5z\"/>",
  map: "<path d=\"M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.2\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 8v4.5l3 1.8\"/>",
  mail: "<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"12\" rx=\"2\"/><path d=\"M4 7l8 6 8-6\"/>",
  cal: "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14\" rx=\"2\"/><path d=\"M4 10h16M9 3.5v4M15 3.5v4\"/>",
  copy: "<rect x=\"8\" y=\"8\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15V6a1 1 0 0 1 1-1h9\"/>",
  check: "<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>",
  ig: "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"3.6\"/><circle cx=\"17\" cy=\"7\" r=\".9\" fill=\"currentColor\" stroke=\"none\"/>",
  tt: "<path d=\"M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5\"/><path d=\"M14 4c.5 2.5 2.4 4 5 4.2\"/>",
  fb: "<path d=\"M14.5 20v-7h2.4l.4-2.8h-2.8V8.5c0-.8.3-1.4 1.4-1.4h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.6 1.3-3.6 3.8v1.9H9.2V13h2.4v7\"/>",
  pencil: "<path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>",
  dup: "<rect x=\"8\" y=\"8\" width=\"11\" height=\"11\" rx=\"2\"/><rect x=\"5\" y=\"5\" width=\"11\" height=\"11\" rx=\"2\"/>",
  trash: "<path d=\"M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12\"/>",
  menu: "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
  globe: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z\"/>",
}

export function hic(name: string, size = 22, cls = 'ic'): SafeHtml {
  return raw(`<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] ?? ''}</svg>`)
}
