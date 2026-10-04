import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { type Locale } from '@/i18n/config'
import { getLocale } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === 'es' ? 'Política de cookies' : 'Cookie Policy', alternates: { canonical: '/legal/cookies' } }
}

type Row = readonly [name: string, purpose: string, duration: string]

const COOKIES: Record<Locale, readonly Row[]> = {
  en: [
    ['sb-…-auth-token', 'Keeps you signed in. Readable only by our server, not by scripts in the page.', 'Session, refreshed while you use the site'],
    ['ks_theme', 'Remembers whether you chose light or dark mode.', '12 months'],
    ['ks_locale', 'Remembers the language you chose (English or Spanish).', '12 months'],
    ['ks_age_screen', 'Set only if an age check fails, to stop the sign-up form being resubmitted with a different date.', '24 hours'],
    ['ks_consent', 'Remembers whether you accepted or rejected analytics, so we do not ask on every page.', '12 months'],
  ],
  es: [
    ['sb-…-auth-token', 'Mantiene tu sesión iniciada. Solo nuestro servidor puede leerla, no los scripts de la página.', 'Sesión, se renueva mientras usas el sitio'],
    ['ks_theme', 'Recuerda si elegiste el modo claro u oscuro.', '12 meses'],
    ['ks_locale', 'Recuerda el idioma que elegiste (inglés o español).', '12 meses'],
    ['ks_age_screen', 'Se crea solo si falla una verificación de edad, para evitar que el formulario de registro se vuelva a enviar con otra fecha.', '24 horas'],
    ['ks_consent', 'Recuerda si aceptaste o rechazaste la analítica, para no preguntarte en cada página.', '12 meses'],
  ],
}

const OPTIONAL_COOKIES: Record<Locale, readonly Row[]> = {
  en: [
    ['_ga, _ga_<id>', 'Google Analytics: distinguishes visits to our public pages so we can count them. Set by Google on our domain.', '13 months'],
    ['ks_utm', 'Remembers the campaign link (UTM tags) you first arrived from, so a sign-up can be credited to the right campaign.', '30 days'],
  ],
  es: [
    ['_ga, _ga_<id>', 'Google Analytics: distingue las visitas a nuestras páginas públicas para poder contarlas. La crea Google en nuestro dominio.', '13 meses'],
    ['ks_utm', 'Recuerda el enlace de campaña (etiquetas UTM) por el que llegaste por primera vez, para atribuir un registro a la campaña correcta.', '30 días'],
  ],
}

const T = {
  en: {
    title: 'Cookie Policy',
    intro:
      'KineticScout sets cookies that are strictly necessary to run the service. Analytics cookies are optional: they are set only if you choose Accept in the cookie banner, only on our public pages, and never in your dashboard. You can change your choice at any time with Cookie settings in the footer. We do not use advertising or social media tracking cookies.',
    necessary: 'Strictly necessary',
    necessaryCaption: 'Cookies set by KineticScout',
    cols: ['Name', 'Purpose', 'Duration'],
    storage: 'Storage on your device',
    storageIntro: 'The installable app also uses browser storage that is not a cookie. None of it is used for tracking.',
    outbox: '(local storage): measurements you log while offline, kept until they are sent, for at most 30 days, and deleted when you sign out.',
    shell: '(app cache): the offline page and app icons, so the app can tell you it is offline. It contains nothing about your account and is replaced when the app updates.',
    push: 'Notification registration: only if you turn on notifications for a device in Settings. Removed when you turn them off or sign out.',
    optional: 'Optional, only if you accept analytics',
    optionalCaption: 'Optional analytics cookies',
    stripe:
      'When you pay, Stripe sets its own cookies on checkout.stripe.com to process the payment and prevent fraud. Those are governed by Stripe’s privacy policy.',
  },
  es: {
    title: 'Política de cookies',
    intro:
      'KineticScout usa cookies estrictamente necesarias para operar el servicio. Las cookies de analítica son opcionales: se crean solo si eliges Aceptar en el aviso de cookies, solo en nuestras páginas públicas y nunca en tu panel. Puedes cambiar tu elección en cualquier momento con Configuración de cookies, en el pie de página. No usamos cookies de publicidad ni de seguimiento de redes sociales.',
    necessary: 'Estrictamente necesarias',
    necessaryCaption: 'Cookies que usa KineticScout',
    cols: ['Nombre', 'Finalidad', 'Duración'],
    storage: 'Almacenamiento en tu dispositivo',
    storageIntro: 'La app instalable también usa almacenamiento del navegador que no es una cookie. Nada de eso se usa para seguimiento.',
    outbox: '(almacenamiento local): las mediciones que registras sin conexión, guardadas hasta que se envían, por un máximo de 30 días, y borradas al cerrar sesión.',
    shell: '(caché de la app): la página sin conexión y los iconos de la app, para que la app pueda avisarte que no hay conexión. No contiene nada sobre tu cuenta y se reemplaza cuando la app se actualiza.',
    push: 'Registro de notificaciones: solo si activas las notificaciones en un dispositivo desde Configuración. Se quita cuando las desactivas o cierras sesión.',
    optional: 'Opcionales, solo si aceptas la analítica',
    optionalCaption: 'Cookies de analítica opcionales',
    stripe:
      'Cuando pagas, Stripe crea sus propias cookies en checkout.stripe.com para procesar el pago y prevenir fraudes. Esas cookies se rigen por la política de privacidad de Stripe.',
  },
} as const

function CookieTable({ rows, caption, cols }: { rows: readonly Row[]; caption: string; cols: readonly string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-border-subtle">
            <th scope="col" className="py-2 pr-4">
              {cols[0]}
            </th>
            <th scope="col" className="py-2 pr-4">
              {cols[1]}
            </th>
            <th scope="col" className="py-2">
              {cols[2]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose, duration]) => (
            <tr key={name} className="border-b border-border-subtle align-top">
              <td className="tabular py-2 pr-4">{name}</td>
              <td className="py-2 pr-4 text-fg-muted">{purpose}</td>
              <td className="py-2 text-fg-muted">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function CookiesPage() {
  const locale = await getLocale()
  const t = T[locale]
  return (
    <LegalPage title={t.title}>
      <p>{t.intro}</p>
      <h2>{t.necessary}</h2>
      <CookieTable rows={COOKIES[locale]} caption={t.necessaryCaption} cols={t.cols} />
      <h2>{t.storage}</h2>
      <p>{t.storageIntro}</p>
      <ul>
        <li>
          <span className="tabular">ks_outbox_v1</span> {t.outbox}
        </li>
        <li>
          <span className="tabular">ks-shell-v1</span> {t.shell}
        </li>
        <li>{t.push}</li>
      </ul>
      <h2>{t.optional}</h2>
      <CookieTable rows={OPTIONAL_COOKIES[locale]} caption={t.optionalCaption} cols={t.cols} />
      <p>{t.stripe}</p>
    </LegalPage>
  )
}
