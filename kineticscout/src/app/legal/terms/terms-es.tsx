import Link from 'next/link'
import type { businessDetails } from '@/lib/legal'

/** Courtesy Spanish translation of the Terms of Service. Keep it in step with page.tsx; the English text governs. */
export function TermsEs({ b }: { b: ReturnType<typeof businessDetails> }) {
  return (
    <>
      <p>
        Estos términos son un acuerdo entre tú y {b.legalName} (&quot;KineticScout&quot;, &quot;nosotros&quot;). Al crear una cuenta, los aceptas.
        Si tienes menos de 18 años, tu padre, madre o tutor también debe aceptarlos antes de que puedas hacer una compra o hacer público tu perfil.
      </p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Debes tener al menos 13 años y dar información exacta, incluida tu fecha de nacimiento.</li>
        <li>Mantén tu contraseña en privado. Eres responsable de la actividad de tu cuenta.</li>
        <li>Una persona por cuenta. Las cuentas de entrenador y de equipo son para adultos.</li>
      </ul>

      <h2>Uso aceptable</h2>
      <ul>
        <li>Registra solo cifras que realmente se midieron. No ingreses métricas falsas o engañosas.</li>
        <li>Sube solo videos que tengas derecho a compartir y en los que aparezcas tú.</li>
        <li>No extraigas datos de forma automatizada, no sobrecargues el servicio ni intentes sondear o eludir su seguridad.</li>
        <li>No te hagas pasar por otra persona ni uses el servicio para acosar a nadie.</li>
      </ul>

      <h2>Tu contenido</h2>
      <p>
        Las métricas y los videos que aportas son tuyos. Nos das una licencia limitada para guardarlos y procesarlos para operar el servicio, y para
        incluir tus valores en estadísticas anónimas de al menos 25 atletas. Puedes eliminar tu contenido en cualquier momento.
      </p>
      <p>
        Si haces público tu perfil, cualquier persona con el enlace puede verlo y descargar su PDF. Eres responsable de que sea exacto, y puedes
        volverlo privado o cambiar el enlace en cualquier momento.
      </p>

      <h2>Verificación, comparaciones y el asistente de reclutamiento</h2>
      <ul>
        <li>
          Una insignia de Verificado significa que un revisor de KineticScout vio el valor registrado en el video que enviaste. No es una
          certificación oficial, y quitamos la insignia si descubrimos que la prueba era engañosa.
        </li>
        <li>No envíes el video de otro atleta ni un video que no muestre la medición. Hacerlo puede llevar a la suspensión.</li>
        <li>Los clips de referencia profesionales se muestran con licencia solo para comparar dentro de KineticScout. No los grabes, descargues ni compartas.</li>
        <li>
          Los borradores de correos los escribe un sistema de IA a partir de tu perfil y de datos publicados del programa. Lee y edita cada borrador
          antes de enviarlo; eres responsable de los mensajes que envías. KineticScout nunca envía mensajes a entrenadores por ti.
        </li>
      </ul>

      <h2>Cuentas de entrenador</h2>
      <ul>
        <li>
          Las cuentas de entrenador son para adultos que trabajan actualmente en un programa deportivo universitario. Debes dar tu nombre y cargo
          reales, usar un correo de la escuela o del programa y mantener tus datos al día. Revisamos el directorio de personal de tu programa antes
          de que puedas buscar atletas o enviar solicitudes.
        </li>
        <li>
          Eres responsable de cumplir las reglas de reclutamiento de tu asociación, incluidos los periodos de contacto. Cada solicitud te pide
          confirmar que el contacto está permitido en ese momento; no envíes una cuando no lo esté.
        </li>
        <li>
          Usa la información de los atletas solo para reclutar para tu programa. No copies perfiles a otros servicios, no compartas datos de contacto
          con nadie fuera del personal de tu programa ni los uses para marketing. No incluyas enlaces ni números de teléfono en un primer mensaje, y
          no intentes contactar por otros medios a un atleta que te rechazó o te bloqueó.
        </li>
        <li>Podemos suspender una cuenta de entrenador que no cumpla estas reglas o que ya no podamos verificar. La suspensión retira las solicitudes abiertas.</li>
      </ul>

      <h2>Solicitudes de contacto para atletas</h2>
      <ul>
        <li>
          Los entrenadores verificados pueden encontrar tu perfil solo mientras es público, y solo pueden pedir contactarte. No se comparte nada a
          menos que aceptes. Si tienes menos de 18 años, un padre, una madre o un tutor también debe aprobarlo antes de que el entrenador reciba tu
          correo y el suyo.
        </li>
        <li>
          Puedes rechazar, bloquear o reportar a cualquier entrenador. Bloquear te quita de los resultados de búsqueda de ese entrenador y quita de su
          página en KineticScout cualquier correo que hayas compartido. Nuestro personal revisa cada reporte.
        </li>
      </ul>

      <h2>Cuentas de equipo</h2>
      <ul>
        <li>
          Las cuentas de equipo son para adultos que entrenan al equipo que registran, en la escuela o el club indicado, y que figuran en su página
          pública de personal. Revisamos esa página antes de que los jugadores puedan unirse.
        </li>
        <li>
          Registra solo resultados que mediste tú, en la fecha indicada, de atletas que estaban presentes. No registres estimaciones ni valores que
          te haya dado otra persona. Los atletas aceptan o rechazan cada resultado antes de que cuente.
        </li>
        <li>
          Usa la información de la plantilla solo para dirigir tu equipo. Si descubrimos que un equipo registró valores engañosos, podemos
          suspenderlo y quitar la etiqueta de registrado por el entrenador de todos los valores que registró.
        </li>
      </ul>

      <h2>Mensajes</h2>
      <ul>
        <li>
          Los mensajes entre un atleta y un entrenador universitario se abren cuando el atleta acepta una solicitud de contacto. Mantenlos sobre el
          reclutamiento, honestos y respetuosos. No presiones a un atleta, no pidas información personal más allá de lo que el reclutamiento
          necesita ni organices un encuentro con un menor sin su padre, madre o tutor.
        </li>
        <li>
          Para atletas menores de 18 años, un padre, una madre o un tutor recibe una copia de cada mensaje y puede terminar la conversación.
          Cualquiera de los participantes también puede terminarla, y cualquiera en ella puede reportar un mensaje. Nuestro personal lee los
          mensajes reportados y puede terminar una conversación o suspender una cuenta.
        </li>
      </ul>

      <h2>Cuentas de padres, madres y tutores</h2>
      <ul>
        <li>
          Las cuentas de padres, madres y tutores son para adultos. Crea una solo con el correo que un atleta nos dio para ti, y solo si eres el
          padre, la madre o el tutor legal de ese atleta. La cuenta actúa por cada atleta menor de 18 años que indicó esa dirección.
        </li>
        <li>
          Las decisiones que tomas desde la cuenta (consentimiento, aprobaciones de equipos y de contacto de entrenadores, terminar una
          conversación, eliminación) tienen el mismo efecto que los enlaces enviados por correo.
        </li>
      </ul>

      <h2>Eventos y el calendario de reclutamiento</h2>
      <ul>
        <li>
          Los entrenadores y los padres pueden enviar showcases, campamentos, combines y torneos. Copia los datos de la página del propio
          organizador y enlázala. No envíes un evento que no tengas motivos para creer que es real, y no agregues promesas sobre becas, exposición,
          clasificaciones o resultados. Publicamos un evento solo después de que nuestro personal lo revisa, y podemos rechazar, editar o quitar
          cualquier anuncio.
        </li>
        <li>KineticScout publica eventos; no los organiza, respalda ni clasifica, y no es responsable de ellos. Inscríbete, paga y confirma los detalles con el organizador.</li>
        <li>
          Nuestro personal copia el calendario de reclutamiento del calendario publicado por el organismo rector, con la fuente enlazada. Es un
          resumen, no asesoría sobre las reglas: el documento fuente y la oficina de cumplimiento de la universidad deciden qué está permitido.
        </li>
      </ul>

      <h2>Planes de entrenamiento</h2>
      <p>
        Los planes de entrenamiento sugieren ejercicios para las áreas de enfoque de tu análisis de video. Los ejercicios los escriben o licencian
        nuestros entrenadores y los revisa una segunda persona del personal, pero son orientación general, no consejo médico ni un sustituto de tu
        propio entrenador. Calienta, sigue las notas de seguridad y detente si algo te duele. No prometemos ningún cambio en la rapidez, la
        velocidad ni otras mediciones.
      </p>

      <h2>Lo que KineticScout hace y no hace</h2>
      <p>
        Los percentiles, los puntajes de afinidad y el análisis de video son estimaciones basadas en los datos disponibles. El análisis de video
        usa una sola vista de cámara en 2D y no es consejo médico, de lesiones ni de entrenamiento profesional. El seguimiento del disco y la
        pelota es una función beta: sus cifras de velocidad y ángulo son estimaciones a partir del video (la velocidad es un límite inferior), no
        son mediciones de radar ni oficiales, y pueden faltar cuando no se puede seguir el objeto. Las cifras nacionales vienen de tablas con
        licencia publicadas por terceros, para la población y el rango que describen, y se muestran tal como se publicaron. Las mediciones
        registradas sin conexión se guardan en tu dispositivo hasta que se envían; si antes se borra el almacenamiento del dispositivo, se pierden.
        KineticScout no garantiza interés de reclutamiento, lugares en plantillas, becas ni ofertas, y no está afiliado a ninguna universidad,
        liga ni organismo rector.
      </p>

      <h2>Suscripciones y pagos</h2>
      <ul>
        <li>Pro se cobra por adelantado, cada mes o cada año, al precio que se muestra al suscribirte, y se renueva automáticamente hasta que lo canceles.</li>
        <li>Puedes cancelar en cualquier momento desde la página de facturación, en un solo paso. Pro sigue activo hasta el final del periodo que pagaste.</li>
        <li>Te enviaremos un correo al menos 30 días antes de que se aplique cualquier aumento de precio a tu suscripción.</li>
        <li>Los reembolsos siguen nuestra <Link href="/legal/refunds">Política de reembolsos</Link>.</li>
      </ul>

      <h2>Cierre de tu cuenta</h2>
      <p>
        Puedes eliminar tu cuenta en cualquier momento desde Configuración. La eliminación se hace 7 días después de tu solicitud, y puedes
        cancelarla hasta entonces. Cuando se hace, cualquier suscripción termina de inmediato y tus datos se eliminan como se describe en la{' '}
        <Link href="/legal/privacy">Política de privacidad</Link>. Un padre, una madre o un tutor de un atleta menor de 18 años también puede
        pedir la eliminación. Podemos suspender cuentas que no cumplan estos términos, y te diremos por qué salvo que la ley lo impida.
      </p>

      <h2>Exenciones y responsabilidad</h2>
      <p>
        El servicio se ofrece tal cual. En la medida en que la ley lo permita, no somos responsables de pérdidas indirectas o consecuentes, y
        nuestra responsabilidad total se limita a lo que nos pagaste en los 12 meses anteriores al reclamo. Nada en estos términos limita los
        derechos que tengas según las leyes de protección al consumidor que no se pueden renunciar.
      </p>

      <h2>Traducciones</h2>
      <p>
        Estos términos se ofrecen en español como cortesía. La versión en inglés es la que rige; si las dos versiones difieren, prevalece la
        versión en inglés.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de {b.governingLaw}, sin afectar los derechos obligatorios del consumidor donde vivas.</p>

      <h2>Contacto</h2>
      <p>
        {b.legalName}, {b.postalAddress}. Correo: <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a>.
      </p>
    </>
  )
}
