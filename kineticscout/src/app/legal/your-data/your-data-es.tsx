import Link from 'next/link'
import { GuardianLinkRequestForm } from '@/components/account/guardian-manage-forms'
import { DELETION_GRACE_DAYS } from '@/lib/account/deletion'
import type { businessDetails } from '@/lib/legal'

/** Courtesy Spanish translation of the Your data page. Keep it in step with page.tsx; the English text governs. */
export function YourDataEs({ b }: { b: ReturnType<typeof businessDetails> }) {
  return (
    <>
      <p>
        Todo lo que aparece en esta página funciona sin contactarnos. Cada opción está disponible para todos los titulares de cuentas, vivan donde
        vivan. Para conocer en detalle qué recopilamos y por qué, lee la <Link href="/legal/privacy">Política de privacidad</Link>.
      </p>

      <h2>Descarga tus datos</h2>
      <p>
        Con tu sesión iniciada, abre <Link href="/dashboard/settings">Configuración</Link> y elige Descargar mis datos. Recibes un archivo JSON con
        tu perfil, cada métrica que registraste, tus análisis de video, tu lista de reclutamiento, el historial de tu suscripción, tus opciones de
        correo y tus eventos de seguridad. Se genera en el momento y nunca se guarda.
      </p>

      <h2>Elimina tu cuenta</h2>
      <p>
        En <Link href="/dashboard/settings">Configuración</Link>, elige Eliminar mi cuenta y confírmalo con tu contraseña. Te enviamos un correo de
        inmediato. Durante {DELETION_GRACE_DAYS} días puedes cancelarlo iniciando sesión; mientras tanto tu perfil es privado y cualquier
        suscripción queda sin renovación. Después eliminamos de forma permanente tu perfil, métricas, videos, análisis, lista de reclutamiento y
        acceso, y cancelamos cualquier suscripción. Solo guardamos un comprobante anónimo que muestra que la solicitud se completó, y Stripe
        conserva las facturas anteriores como exige la ley fiscal.
      </p>
      <p>
        ¿No puedes iniciar sesión? Escribe a <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> desde el correo de la cuenta y
        programaremos la misma eliminación por ti.
      </p>

      <h2>Opciones de correo</h2>
      <ul>
        <li>Los correos de producto están desactivados a menos que los actives, al registrarte o en Configuración.</li>
        <li>Cada correo de producto tiene un enlace para darte de baja y admite la baja con un clic en tu app de correo. No hace falta iniciar sesión.</li>
        <li>Los correos de la cuenta (restablecimientos de contraseña, recibos, avisos de consentimiento y de eliminación) se envían mientras exista la cuenta.</li>
      </ul>

      <h2>Cookies y analítica</h2>
      <p>
        La analítica funciona solo si eliges Aceptar en el aviso de cookies, y solo en las páginas públicas. Cuando la analítica está en uso, el
        enlace Configuración de cookies del pie de página te permite cambiar tu elección en cualquier momento. Consulta la{' '}
        <Link href="/legal/cookies">Política de cookies</Link>.
      </p>

      <h2>Padres, madres y tutores</h2>
      <p>
        Los atletas de 13 a 17 años necesitan el consentimiento de un padre, una madre o un tutor antes de que su perfil pueda ser público, antes de
        enviar correos a entrenadores y antes de cualquier compra. Después de dar su consentimiento, el padre, la madre o el tutor recibe un enlace
        privado que le permite, en cualquier momento y sin cuenta:
      </p>
      <ul>
        <li>retirar el consentimiento, lo que vuelve privado el perfil y bloquea las compras y los correos a entrenadores de inmediato;</li>
        <li>detener la renovación de una suscripción Pro;</li>
        <li>pedir que se eliminen la cuenta y todos sus datos, con el mismo plazo de {DELETION_GRACE_DAYS} días, que solo esa persona puede cancelar.</li>
      </ul>
      <p>¿Perdiste el enlace? Ingresa el correo que recibió la solicitud de consentimiento y te enviaremos uno nuevo.</p>
      <div className="max-w-md">
        <GuardianLinkRequestForm />
      </div>

      <h2>Corrige tu información</h2>
      <p>
        Los atletas pueden editar cada dato del perfil desde <Link href="/dashboard/profile">Editar perfil</Link> en el panel. Para cualquier cosa
        que no puedas cambiar tú, como tu correo o tu fecha de nacimiento, usa la <Link href="/contact">página de contacto</Link>. Respondemos en
        un plazo de 2 días hábiles.
      </p>
    </>
  )
}
