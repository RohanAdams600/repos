/** Tiny DOM builder: h('div', { class: 'x', onclick: fn }, 'text', child). */
export type Child = string | number | Node | null | undefined | false | Child[]

type Attrs = Record<string, unknown>

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate', 'open'])

function apply(el: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined || val === null || val === false) continue
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val as EventListener)
    } else if (key === 'class') {
      el.setAttribute('class', String(val))
    } else if (key === 'style' && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, string>)) (el as HTMLElement).style.setProperty(k, v)
    } else if (key === 'dataset' && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, string>)) (el as HTMLElement).dataset[k] = v
    } else if (PROPS.has(key)) {
      ;(el as unknown as Record<string, unknown>)[key] = val
    } else {
      el.setAttribute(key, val === true ? '' : String(val))
    }
  }
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    if (Array.isArray(c)) append(el, c)
    else if (c instanceof Node) el.appendChild(c)
    else el.appendChild(document.createTextNode(String(c)))
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  apply(el, attrs)
  append(el, children)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  apply(el, attrs)
  append(el, children)
  return el
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export function mount(el: Element, ...children: Child[]): void {
  clear(el)
  append(el, children)
}

let toastTimer = 0

export function toast(text: string): void {
  document.querySelector('.toast')?.remove()
  const el = h('div', { class: 'toast', role: 'status' }, text)
  document.body.appendChild(el)
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.remove(), 2600)
}

/** Announce to screen readers through the shared live region. */
export function announce(text: string): void {
  const region = document.getElementById('live-region')
  if (region) region.textContent = text
}

export function fmtDate(iso: string): string {
  if (/^\d{4}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!d) return `${months[(m ?? 1) - 1]} ${y}`
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`
}

export async function copyText(text: string, fallbackInput?: HTMLInputElement | HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (fallbackInput) {
      fallbackInput.value = text
      fallbackInput.focus()
      fallbackInput.select()
    }
    return false
  }
}
