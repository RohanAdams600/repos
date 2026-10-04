/** Name of the first-party theme preference cookie (values: "light" | "dark"). */
export const THEME_COOKIE = 'ks_theme'

export function parseTheme(value: string | undefined): 'light' | 'dark' | undefined {
  return value === 'light' || value === 'dark' ? value : undefined
}
