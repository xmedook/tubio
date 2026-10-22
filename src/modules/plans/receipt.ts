import PDFDocument from 'pdfkit'
import type { Plan } from './limits.ts'
import { ivaBreakdown, type Payment } from './billing.ts'

export type ReceiptInfo = { issuer: string; issuerAddress: string; issuerRfc: string; contact: string; locale: string; customer: string; email: string; t: (k: string, v?: Record<string, string | number>) => string }

const money = (locale: string, cents: number, cur: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(cents / 100)

/** Recibo simple en PDF (no es CFDI). */
export function receiptPdf(p: Payment, plan: Plan, info: ReceiptInfo): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56, info: { Title: `Recibo ${p.reference}`, Author: 'tubio' } })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    const { t } = info
    const m = (c: number) => money(info.locale, c, p.currency)
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#14181f').text('tu', { continued: true }).fillColor('#1d4ed8').text('bio')
    doc.moveDown(0.5).fillColor('#14181f').fontSize(16).text(t('receipt.title'))
    doc.font('Helvetica').fontSize(10).fillColor('#5b6472').text(t('receipt.not_cfdi'))
    doc.moveDown()
    doc.fillColor('#14181f').fontSize(10)
    doc.font('Helvetica-Bold').text(info.issuer).font('Helvetica').text(info.issuerAddress)
    if (info.issuerRfc) doc.text(`RFC: ${info.issuerRfc}`)
    doc.text(info.contact)
    doc.moveDown()
    const row = (k: string, v: string) => doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(v)
    row(t('receipt.number'), p.reference)
    row(t('receipt.date'), new Intl.DateTimeFormat(info.locale, { dateStyle: 'long' }).format(p.paid_at ?? p.created_at))
    row(t('receipt.customer'), p.billing_name || info.customer)
    row(t('auth.email'), info.email)
    row(t('receipt.method'), t(`pay.method_${p.method}`))
    doc.moveDown()
    const { subtotal, iva } = ivaBreakdown(p.amount - p.discount)
    doc.font('Helvetica-Bold').fontSize(11).text(`${t('receipt.concept')}: ${t('receipt.concept_value', { plan: plan.name, period: t(`pay.period_${p.period}`) })}`)
    doc.moveDown(0.5).font('Helvetica').fontSize(10)
    row(t('receipt.price'), m(p.amount))
    if (p.discount) row(t('receipt.discount') + (p.coupon_code ? ` (${p.coupon_code})` : ''), `-${m(p.discount)}`)
    row(t('receipt.subtotal'), m(subtotal))
    row(t('receipt.iva'), m(iva))
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).text(`${t('receipt.total')}: ${m(p.amount - p.discount)}`)
    doc.moveDown(2).font('Helvetica').fontSize(8).fillColor('#5b6472').text(t('receipt.footer'))
    doc.end()
  })
}
