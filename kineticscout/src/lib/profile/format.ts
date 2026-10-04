export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}' ${inches % 12}"`
}

/** ASCII-only file name, safe inside a Content-Disposition header. */
export function pdfFilename(firstName: string, lastName: string, gradYear: number): string {
  const safe = `${firstName}-${lastName}`.normalize('NFKD').replace(/[^A-Za-z-]+/g, '').slice(0, 60) || 'athlete'
  return `${safe}-${gradYear}-KineticScout.pdf`
}
