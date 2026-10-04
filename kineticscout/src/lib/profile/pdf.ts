import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatHeight } from '@/lib/profile/format'
import type { ProfileCard } from '@/lib/profile/public'

/**
 * One-page recruiting profile (US Letter). Helvetica for text (the brand's body face), Roboto Mono
 * (SIL OFL 1.1, embedded as a subset) for every number. Colors match the brand tokens; the volt
 * accent is only ever a fill behind onyx text, never text on white.
 */

const ONYX = rgb(0x12 / 255, 0x12 / 255, 0x12 / 255)
const TITANIUM = rgb(0x2d / 255, 0x2d / 255, 0x2d / 255)
const ASH = rgb(0xe0 / 255, 0xe0 / 255, 0xe0 / 255)
const VOLT = rgb(0xe6 / 255, 0xff / 255, 0)
const WHITE = rgb(1, 1, 1)

const PAGE = { width: 612, height: 792 }
const MARGIN = 48

let fontCache: Promise<{ regular: Uint8Array; bold: Uint8Array }> | undefined
function monoFonts() {
  fontCache ??= (async () => {
    const dir = path.join(process.cwd(), 'assets', 'fonts')
    const [regular, bold] = await Promise.all([readFile(path.join(dir, 'RobotoMono-Regular.ttf')), readFile(path.join(dir, 'RobotoMono-Bold.ttf'))])
    return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) }
  })()
  return fontCache
}

/** Latin letters that have no Unicode decomposition but a conventional ASCII spelling. */
const TRANSLITERATIONS: Record<string, string> = {
  '\u0110': 'D', // D with stroke
  '\u0111': 'd',
  '\u0141': 'L', // L with stroke
  '\u0142': 'l',
  '\u0126': 'H', // H with stroke
  '\u0127': 'h',
  '\u0131': 'i', // dotless i
  '\u0166': 'T', // T with stroke
  '\u0167': 't',
}

/** Standard PDF fonts only cover WinAnsi; anything else is transliterated or replaced so rendering never fails. */
export function encodable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  return Array.from(text.normalize('NFC'), (ch) => {
    if (supported.has(ch.codePointAt(0)!)) return ch
    const mapped = TRANSLITERATIONS[ch]
    if (mapped) return mapped
    const stripped = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    return stripped && [...stripped].every((c) => supported.has(c.codePointAt(0)!)) ? stripped : '?'
  }).join('')
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let out = encodable(font, text)
  if (font.widthOfTextAtSize(out, size) <= maxWidth) return out
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1)
  return `${out.trimEnd()}...`
}

function drawCheck(page: PDFPage, x: number, y: number, size: number) {
  // Vector checkmark so no font glyph is needed.
  page.drawSvgPath('M2 9 L6.5 13.5 L16 4', { x, y: y + size, scale: size / 18, borderColor: ONYX, borderWidth: 2.4 })
}

function addLink(doc: PDFDocument, page: PDFPage, rect: [number, number, number, number], url: string) {
  const annotation = doc.context.register(
    doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }),
  )
  page.node.set(PDFName.of('Annots'), doc.context.obj([annotation]))
}

export async function renderProfilePdf(card: ProfileCard, options: { publicUrl: string | null; generatedAt: Date }): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts = await monoFonts()
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(fonts.regular, { subset: true })
  const monoBold = await doc.embedFont(fonts.bold, { subset: true })

  const name = `${card.firstName} ${card.lastName}`
  doc.setTitle(`${name} recruiting profile`)
  doc.setAuthor('KineticScout')
  doc.setSubject(`Class of ${card.gradYear} ${card.positionLabel}`)
  doc.setCreator('KineticScout')
  doc.setProducer('KineticScout')
  doc.setCreationDate(options.generatedAt)
  doc.setModificationDate(options.generatedAt)
  doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'))

  const page = doc.addPage([PAGE.width, PAGE.height])
  const width = PAGE.width - MARGIN * 2
  let y = PAGE.height

  // Header band and accent rule.
  page.drawRectangle({ x: 0, y: y - 56, width: PAGE.width, height: 56, color: ONYX })
  page.drawText('KineticScout', { x: MARGIN, y: y - 36, size: 18, font: sansBold, color: WHITE })
  const tag = 'Recruiting profile'
  page.drawText(tag, { x: PAGE.width - MARGIN - sans.widthOfTextAtSize(tag, 11), y: y - 34, size: 11, font: sans, color: ASH })
  page.drawRectangle({ x: 0, y: y - 62, width: PAGE.width, height: 6, color: VOLT })
  y -= 62 + 44

  // Identity.
  page.drawText(fitText(sansBold, name, 28, width), { x: MARGIN, y, size: 28, font: sansBold, color: ONYX })
  y -= 22
  const sides = [card.bats ? `Bats ${card.bats === 'RIGHT' ? 'R' : 'L'}` : null, card.throws ? `Throws ${card.throws === 'RIGHT' ? 'R' : 'L'}` : null].filter(Boolean).join(' / ')
  const subtitle = [`Class of ${card.gradYear}`, card.positionLabel, sides || null].filter(Boolean).join('  ·  ')
  page.drawText(fitText(sans, subtitle, 13, width), { x: MARGIN, y, size: 13, font: sans, color: TITANIUM })
  y -= 30

  // Measurables row (numbers), then school and handle on their own line so long names fit.
  const facts: [string, string][] = []
  if (card.heightInches) facts.push(['Height', formatHeight(card.heightInches)])
  if (card.weightLbs) facts.push(['Weight', `${card.weightLbs} lb`])
  if (card.gpa !== null) facts.push(['GPA', card.gpa.toFixed(2)])
  if (facts.length) {
    facts.forEach(([label, value], i) => {
      const x = MARGIN + i * 120
      page.drawText(label.toUpperCase(), { x, y, size: 8, font: sansBold, color: TITANIUM })
      page.drawText(value, { x, y: y - 17, size: 13, font: monoBold, color: ONYX })
    })
    y -= 40
  }
  const contact = [card.highSchool, card.twitterHandle ? `@${card.twitterHandle} on X` : null].filter((v): v is string => Boolean(v)).join('  \u00b7  ')
  if (contact) {
    page.drawText(fitText(sans, contact, 11, width), { x: MARGIN, y, size: 11, font: sans, color: ONYX })
    y -= 24
  }

  // Metrics table.
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 1.5, color: ONYX })
  y -= 16
  const cols = { label: MARGIN, best: MARGIN + 176, date: MARGIN + 276, standing: MARGIN + 366, verified: MARGIN + 450 }
  const header = (text: string, x: number) => page.drawText(text.toUpperCase(), { x, y, size: 8, font: sansBold, color: TITANIUM })
  header('Measurement', cols.label)
  header('Best', cols.best)
  header('Measured', cols.date)
  header('Class standing', cols.standing)
  header('Verified', cols.verified)
  y -= 10

  if (card.metrics.length === 0) {
    y -= 18
    page.drawText('No measurements logged in the last 18 months.', { x: MARGIN, y, size: 11, font: sans, color: TITANIUM })
    y -= 10
  }
  for (const metric of card.metrics.slice(0, 13)) {
    y -= 26
    page.drawLine({ start: { x: MARGIN, y: y + 18 }, end: { x: PAGE.width - MARGIN, y: y + 18 }, thickness: 0.5, color: ASH })
    page.drawText(fitText(sans, metric.label, 11, 168), { x: cols.label, y, size: 11, font: sans, color: ONYX })
    page.drawText(`${metric.best.toFixed(metric.decimals)} ${metric.unit}`, { x: cols.best, y, size: 11, font: monoBold, color: ONYX })
    page.drawText(metric.bestDate, { x: cols.date, y, size: 10, font: mono, color: TITANIUM })
    page.drawText(metric.classPercentile !== null ? `Top ${Math.max(1, 100 - metric.classPercentile)}%` : 'n/a', { x: cols.standing, y, size: 10, font: mono, color: TITANIUM })
    if (metric.bestVerified) {
      page.drawRectangle({ x: cols.verified - 2, y: y - 4, width: 62, height: 16, color: VOLT })
      drawCheck(page, cols.verified + 2, y - 2, 10)
      page.drawText('Verified', { x: cols.verified + 16, y, size: 9, font: sansBold, color: ONYX })
    } else if (metric.bestCoachRecorded) {
      page.drawRectangle({ x: cols.verified - 2, y: y - 4, width: 76, height: 16, borderColor: ONYX, borderWidth: 1 })
      page.drawText('Coach-recorded', { x: cols.verified + 2, y, size: 8.5, font: sansBold, color: ONYX })
    } else if (metric.verifiedBest !== null) {
      page.drawText(`${metric.verifiedBest.toFixed(metric.decimals)} verified`, { x: cols.verified, y, size: 8, font: mono, color: TITANIUM })
    }
  }
  y -= 14
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 1.5, color: ONYX })

  // Method notes, then the link.
  const notes = [
    'Verified: a KineticScout reviewer confirmed the value from video of the measurement. Coach-recorded: a staff-checked school or club',
    'coach recorded it at a testing day and the athlete accepted it. Other values are self-reported.',
    'Class standing compares the best value of the last 18 months with KineticScout athletes in the same graduating class',
    '(published only for groups of at least 25 athletes). It is not a national ranking.',
  ]
  y -= 20
  for (const line of notes) {
    page.drawText(encodable(sans, line), { x: MARGIN, y, size: 8.5, font: sans, color: TITANIUM })
    y -= 12
  }

  const footerY = MARGIN
  if (options.publicUrl) {
    const label = 'Full profile and latest numbers:'
    page.drawText(label, { x: MARGIN, y: footerY + 16, size: 9, font: sans, color: TITANIUM })
    page.drawText(options.publicUrl, { x: MARGIN, y: footerY + 2, size: 11, font: monoBold, color: ONYX })
    const urlWidth = monoBold.widthOfTextAtSize(options.publicUrl, 11)
    page.drawLine({ start: { x: MARGIN, y: footerY }, end: { x: MARGIN + urlWidth, y: footerY }, thickness: 0.75, color: ONYX })
    addLink(doc, page, [MARGIN, footerY - 3, MARGIN + urlWidth, footerY + 12], options.publicUrl)
  }
  const stamp = `Generated ${options.generatedAt.toISOString().slice(0, 10)}`
  page.drawText(stamp, { x: PAGE.width - MARGIN - mono.widthOfTextAtSize(stamp, 8), y: footerY + 2, size: 8, font: mono, color: TITANIUM })

  return doc.save({ useObjectStreams: true })
}
