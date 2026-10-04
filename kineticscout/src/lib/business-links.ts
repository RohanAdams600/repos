/** Directions link for the business address. A plain link: nothing loads from Google until it is clicked. */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

/** tel: href from an E.164 number, and a readable US format for display. */
export function telHref(e164: string): string {
  return `tel:${e164.replace(/[^+\d]/g, '')}`
}

export function formatPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164
}
