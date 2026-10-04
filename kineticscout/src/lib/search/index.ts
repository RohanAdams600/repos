import 'server-only'
import { FAQS, FAQS_ES, type Faq } from '@/lib/content/faq'
import type { Locale } from '@/i18n/config'
import { db } from '@/lib/db'
import { rankDocuments, SEARCH_LIMITS, tokenize, type SearchDocument, type SearchResult } from '@/lib/search/score'

const STATIC_PAGES: SearchDocument[] = [
  { href: '/', section: 'Page', title: 'KineticScout home', description: 'Log your measurables, see your class percentile and find programs that fit your numbers.', keywords: 'exit velocity pitch velocity 60 yard dash pop time recruiting' },
  { href: '/pricing', section: 'Page', title: 'Pricing', description: 'Scout is free forever. Pro Prospect adds video analysis, the College Matchmaker and unlimited logging.', keywords: 'price cost plan pro subscription free monthly yearly cancel' },
  { href: '/faq', section: 'Page', title: 'Frequently asked questions', description: 'Percentiles, privacy, video analysis accuracy, college matching and billing.', keywords: 'faq help questions' },
  { href: '/about', section: 'Page', title: 'About KineticScout', description: 'Who runs KineticScout and how to reach us.', keywords: 'company team address directions' },
  { href: '/contact', section: 'Page', title: 'Contact us', description: 'Email, phone and a contact form. We reply within 2 business days.', keywords: 'support help email phone message' },
  { href: '/blog', section: 'Page', title: 'Data reports', description: 'Weekly percentile reports built from anonymized KineticScout athlete data.', keywords: 'blog articles statistics averages' },
  { href: '/case-studies', section: 'Page', title: 'Case studies', description: 'How athletes and families have used KineticScout, published with their consent.', keywords: 'stories examples results' },
  { href: '/reviews', section: 'Page', title: 'Reviews', description: 'What KineticScout users say, published with their permission.', keywords: 'testimonials reviews ratings' },
  { href: '/legal/privacy', section: 'Legal', title: 'Privacy Policy', description: 'What we collect, why, who processes it, and your rights.', keywords: 'data deletion personal information children coppa' },
  { href: '/legal/terms', section: 'Legal', title: 'Terms of Service', description: 'The agreement for using KineticScout.', keywords: 'terms conditions rules' },
  { href: '/legal/refunds', section: 'Legal', title: 'Refund Policy', description: 'Refund windows, duplicate charges and cancellation.', keywords: 'refund money back cancel' },
  { href: '/legal/cookies', section: 'Legal', title: 'Cookie Policy', description: 'The cookies KineticScout sets and why.', keywords: 'cookies tracking analytics consent' },
  { href: '/sign-up', section: 'Page', title: 'Create your free profile', description: 'Sign up for a free KineticScout account.', keywords: 'register join account signup' },
  { href: '/events', section: 'Page', title: 'Showcases, camps and combines', description: 'Upcoming events, each checked against the organizer’s own page.', keywords: 'events showcase camp combine tournament' },
  { href: '/recruiting-calendar', section: 'Page', title: 'Recruiting calendar', description: 'Contact, evaluation, quiet and dead periods with their sources.', keywords: 'ncaa calendar dead period contact period recruiting rules' },
]

const STATIC_PAGES_ES: SearchDocument[] = [
  { href: '/', section: 'Página', title: 'Inicio de KineticScout', description: 'Registra tus mediciones, mira tu percentil de clase y encuentra programas que encajen con tus números.', keywords: 'velocidad de salida lanzamiento carrera 60 yardas pop time reclutamiento' },
  { href: '/pricing', section: 'Página', title: 'Precios', description: 'Scout es gratis para siempre. Pro Prospect agrega análisis de video, el College Matchmaker y registro ilimitado.', keywords: 'precio costo plan pro suscripcion gratis mensual anual cancelar' },
  { href: '/faq', section: 'Página', title: 'Preguntas frecuentes', description: 'Percentiles, privacidad, precisión del análisis de video, coincidencias con universidades y pagos.', keywords: 'ayuda preguntas dudas' },
  { href: '/about', section: 'Página', title: 'Sobre KineticScout', description: 'Quién está detrás de KineticScout y cómo contactarnos.', keywords: 'empresa equipo direccion' },
  { href: '/contact', section: 'Página', title: 'Contáctanos', description: 'Correo, teléfono y un formulario de contacto. Respondemos en un plazo de 2 días hábiles.', keywords: 'soporte ayuda correo telefono mensaje' },
  { href: '/blog', section: 'Página', title: 'Informes de datos', description: 'Informes semanales de percentiles con datos anónimos de atletas de KineticScout.', keywords: 'blog articulos estadisticas promedios' },
  { href: '/case-studies', section: 'Página', title: 'Casos de estudio', description: 'Cómo atletas y familias han usado KineticScout, publicado con su consentimiento.', keywords: 'historias ejemplos resultados' },
  { href: '/reviews', section: 'Página', title: 'Opiniones', description: 'Lo que dicen los usuarios de KineticScout, publicado con su permiso.', keywords: 'testimonios opiniones calificaciones' },
  { href: '/events', section: 'Página', title: 'Showcases, campamentos y combines', description: 'Próximos eventos, cada uno revisado con la página del organizador.', keywords: 'eventos showcase campamento combine torneo' },
  { href: '/recruiting-calendar', section: 'Página', title: 'Calendario de reclutamiento', description: 'Periodos de contacto, evaluación, silencio y muertos, con sus fuentes.', keywords: 'ncaa calendario periodo muerto contacto reglas reclutamiento' },
  { href: '/legal/privacy', section: 'Legal', title: 'Política de privacidad', description: 'Qué recopilamos, por qué, quién lo procesa y tus derechos.', keywords: 'datos eliminacion informacion personal menores coppa' },
  { href: '/legal/terms', section: 'Legal', title: 'Términos del servicio', description: 'El acuerdo para usar KineticScout.', keywords: 'terminos condiciones reglas' },
  { href: '/legal/refunds', section: 'Legal', title: 'Política de reembolsos', description: 'Plazos de reembolso, cargos duplicados y cancelación.', keywords: 'reembolso devolucion dinero cancelar' },
  { href: '/legal/cookies', section: 'Legal', title: 'Política de cookies', description: 'Las cookies que usa KineticScout y por qué.', keywords: 'cookies rastreo analitica consentimiento' },
  { href: '/sign-up', section: 'Página', title: 'Crea tu perfil gratis', description: 'Regístrate para una cuenta gratis de KineticScout.', keywords: 'registro unirse cuenta' },
]

const faqDocs = (faqs: readonly Faq[], section: string): SearchDocument[] =>
  faqs.map((f) => ({ href: `/faq#${f.id}`, section, title: f.question, description: f.answer[0]!, keywords: f.answer.slice(1).join(' ') }))
const FAQ_DOCS = faqDocs(FAQS, 'FAQ')
const FAQ_DOCS_ES = faqDocs(FAQS_ES, 'Preguntas frecuentes')

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Site search over pages, FAQs, and published articles and case studies. */
export async function siteSearch(query: string, locale: Locale = 'en'): Promise<SearchResult[]> {
  if (query.length < SEARCH_LIMITS.minLength) return []
  const tokens = tokenize(query).slice(0, 6)
  if (tokens.length === 0) return []

  // Every token must match title or description. Parameterised ILIKE with escaped wildcards.
  const posts = await db.blogPost.findMany({
    where: {
      status: 'PUBLISHED',
      AND: tokens.map((t) => ({
        OR: [{ title: { contains: escapeLike(t), mode: 'insensitive' as const } }, { metaDescription: { contains: escapeLike(t), mode: 'insensitive' as const } }],
      })),
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    select: { slug: true, title: true, metaDescription: true, kind: true },
  })
  const postDocs: SearchDocument[] = posts.map((p) => ({
    href: p.kind === 'CASE_STUDY' ? `/case-studies/${p.slug}` : `/blog/${p.slug}`,
    section: p.kind === 'CASE_STUDY' ? (locale === 'es' ? 'Caso de estudio' : 'Case study') : locale === 'es' ? 'Informe de datos' : 'Data report',
    title: p.title,
    description: p.metaDescription,
  }))
  const pages = locale === 'es' ? [...STATIC_PAGES_ES, ...FAQ_DOCS_ES] : [...STATIC_PAGES, ...FAQ_DOCS]
  return rankDocuments([...pages, ...postDocs], query)
}
