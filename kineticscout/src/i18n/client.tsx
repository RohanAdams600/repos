'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { pick, type Catalog } from '@/i18n/define'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useMessages<T>(catalog: Catalog<T>): T {
  return pick(catalog, useLocale())
}
