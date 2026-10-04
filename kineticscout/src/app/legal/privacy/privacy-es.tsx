import Link from 'next/link'
import type { businessDetails } from '@/lib/legal'

/** Courtesy Spanish translation of the Privacy Policy. Keep it in step with page.tsx; the English text governs. */
export function PrivacyEs({ b }: { b: ReturnType<typeof businessDetails> }) {
  return (
    <>
      <p>
        KineticScout es operado por {b.legalName}, {b.postalAddress}. Esta política explica qué datos recopilamos, para qué, quién los procesa
        por nosotros y qué opciones tienes. Escríbenos a <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a>.
      </p>

      <h2>Quién puede usar KineticScout</h2>
      <p>
        Debes tener al menos 13 años. No recopilamos a sabiendas información personal de menores de 13 años; si tienes menos de 13, nuestro registro
        no crea una cuenta ni guarda lo que escribiste. Si crees que un menor de 13 años nos dio información, escríbenos y la eliminaremos. Los
        atletas de 13 a 17 años pueden crear una cuenta, pero esta sigue siendo privada hasta que un padre, una madre o un tutor dé su
        consentimiento por correo, y solo un adulto puede hacer una compra.
      </p>

      <h2>Qué datos recopilamos</h2>
      <ul>
        <li>Cuenta: correo electrónico, contraseña (guardada solo como hash con sal por nuestro proveedor de autenticación), fecha de nacimiento, tipo de cuenta y, para atletas menores de 18 años, el correo de un padre, una madre o un tutor.</li>
        <li>Perfil del atleta: nombre, generación, deporte, posición y, de forma opcional, estatura, peso, GPA, escuela secundaria, lado de bateo y de lanzamiento, y usuario de X.</li>
        <li>Datos de rendimiento: las métricas que registras y las fechas en que se midieron.</li>
        <li>Los videos que subes para su análisis, los puntos del cuerpo detectados en ellos, la trayectoria del disco o la pelota si activas el seguimiento (beta) y el informe resultante.</li>
        <li>Los clips que envías para verificar una medición, los resultados de las comprobaciones automáticas (tipo de archivo, duración, fecha de grabación según el archivo y una huella del archivo) y la decisión del revisor.</li>
        <li>Las universidades que agregas a tu lista de reclutamiento y su estado, la configuración de tu asistente de reclutamiento y los borradores de correos escritos para ti.</li>
        <li>Las opciones de tu perfil público (si es público y si se muestran el GPA y la escuela) y el conteo diario de visitas al perfil y descargas del PDF. No registramos quién vio tu perfil.</li>
        <li>Las notificaciones que te enviamos dentro de la app, como resultados de verificación, alertas de reclutamiento y solicitudes de contacto.</li>
        <li>
          Cuentas de entrenadores (solo adultos): nombre, cargo, programa universitario, un correo de la escuela o del programa que confirmamos con
          un enlace, un enlace al directorio público de personal del programa y la decisión de verificación de nuestro personal. También los
          atletas que guarda un entrenador, con sus notas privadas.
        </li>
        <li>
          Solicitudes de contacto entre entrenadores verificados y atletas: el mensaje del entrenador, las respuestas del atleta y, para atletas
          menores de 18 años, del padre, la madre o el tutor, y los correos que se comparten cuando se acepta una solicitud. También los bloqueos y
          los reportes que los atletas hacen sobre entrenadores.
        </li>
        <li>Los mensajes entre un atleta y un entrenador universitario después de aceptar una solicitud de contacto, cuándo se leyó cada uno y los reportes sobre mensajes.</li>
        <li>
          Cuentas de equipo para entrenadores de high school y de club (solo adultos): nombre y cargo tal como aparecen en la página de personal del
          equipo, el equipo, la escuela o el club y el estado, un enlace a esa página y la decisión de nuestro personal. Para cada equipo: quién
          pidió unirse y cuándo, la plantilla, los días de pruebas y los resultados que registró el entrenador, con si cada atleta los aceptó o
          rechazó.
        </li>
        <li>Si activas las notificaciones en un dispositivo: la dirección push que tu navegador nos da para ese dispositivo y cuándo le enviamos algo por última vez.</li>
        <li>
          Cuentas de padres, madres y tutores (solo adultos): el correo y la fecha de nacimiento de la cuenta, y las acciones que se hacen desde
          ella, como dar o retirar el consentimiento, aprobar una solicitud de equipo o de contacto de un entrenador, reportar un mensaje o terminar
          una conversación.
        </li>
        <li>
          Eventos: los anuncios que envían entrenadores y padres (los datos del evento copiados de la página del organizador y qué cuenta lo envió)
          y los eventos a los que un atleta marca que va a ir, con si decidió mostrarlo a entrenadores universitarios verificados.
        </li>
        <li>Planes de entrenamiento: los planes que creas a partir de un análisis de video, los ejercicios que incluyen, los días en que marcas un ejercicio como practicado y la medición que sigue el plan con su valor inicial.</li>
        <li>Facturación: tu identificador de cliente de Stripe y el estado de tu suscripción. Los datos de la tarjeta van directo a Stripe; nunca vemos ni guardamos números de tarjeta.</li>
        <li>Datos de seguridad: usamos las direcciones IP de las solicitudes para prevenir abusos y las guardamos solo como hashes con clave, nunca de forma legible. Registramos eventos de seguridad como los inicios de sesión fallidos.</li>
        <li>Formulario de contacto: tu nombre, correo, tema y mensaje, que usamos solo para responderte y eliminamos después de 12 meses.</li>
        <li>Analítica, solo si aceptas las cookies de analítica: Google Analytics mide las visitas a nuestras páginas públicas (nunca a tu panel), y recordamos el enlace de campaña (etiquetas UTM) por el que llegaste por primera vez, hasta por 30 días, para saber qué difusión funciona.</li>
      </ul>
      <p>No recopilamos ubicación, contactos ni identificadores publicitarios, y no usamos cookies publicitarias. La analítica queda apagada a menos que elijas Aceptar.</p>
      <p>
        Las mediciones que registras mientras tu dispositivo no tiene conexión se guardan en tu navegador, en ese dispositivo, hasta que se envían,
        y se borran de él cuando cierras sesión. La app también guarda en el dispositivo una copia de su página sin conexión; no contiene nada
        sobre tu cuenta.
      </p>
      <p>Tu preferencia de idioma se guarda en una cookie y, si tienes sesión iniciada, en tu cuenta, para mostrarte el sitio y enviarte los correos en ese idioma.</p>

      <h2>Cómo los usamos</h2>
      <ul>
        <li>Para operar tu cuenta y las funciones que usas: percentiles (incluidas las comparaciones con atletas de edad, estatura y peso similares), gráficas de progreso, análisis de video, comparaciones lado a lado y coincidencias con universidades.</li>
        <li>Para comparar tus mediciones con tablas nacionales con licencia cuando una cubre tu edad y complexión. La comparación se hace en nuestros servidores; no se envía nada sobre ti al editor de la tabla.</li>
        <li>
          Para mostrar tu perfil público y tu PDF a quien le compartas el enlace, solo si haces público el perfil. Los perfiles públicos nunca
          aparecen en buscadores, y puedes cambiar el enlace o volver privado el perfil en cualquier momento.
        </li>
        <li>Para verificar mediciones: un revisor de KineticScout ve el clip que envías para confirmar el valor. El clip nunca se muestra en tu perfil.</li>
        <li>
          Para que entrenadores universitarios verificados encuentren perfiles públicos. Antes de que un entrenador pueda buscar, confirmamos su
          correo de la escuela y nuestro personal comprueba que figura en el directorio de personal de su programa. Los entrenadores ven solo lo que
          muestra tu perfil público, y solo mientras es público. Tú ves cuántos entrenadores verificados guardaron tu perfil, nunca cuáles.
        </li>
        <li>
          Para hacer llegar las solicitudes de contacto. El primer mensaje de un entrenador no puede contener enlaces ni números de teléfono. Tu
          correo se comparte con el entrenador solo si aceptas; para atletas menores de 18 años, solo después de que un padre, una madre o un tutor
          también lo apruebe por correo, y entonces el entrenador recibe ambas direcciones. Puedes rechazar, bloquear o reportar a cualquier
          entrenador.
        </li>
        <li>
          Para transmitir mensajes una vez aceptada una solicitud. Para atletas menores de 18 años, enviamos a un padre, una madre o un tutor una
          copia de cada mensaje de la conversación, con un enlace privado para leerla, reportar un mensaje o terminar la conversación. Cuando
          alguien reporta un mensaje, nuestro personal lo lee junto con los mensajes cercanos para decidir qué hacer, y guardamos un registro de
          cada vez que el personal abre los reportes.
        </li>
        <li>
          Para operar los equipos. Un entrenador de equipo ve el nombre, la generación y la posición de los atletas de su plantilla, y los
          resultados que registra. No ve tu correo ni las mediciones que registras tú. Un resultado que registra el entrenador aparece en tu perfil,
          marcado como registrado por el entrenador, solo si lo aceptas. Los atletas menores de 18 años se unen a un equipo solo después de que un
          padre, una madre o un tutor lo aprueba por correo.
        </li>
        <li>
          Para operar las cuentas de padres, madres y tutores. Un atleta menor de 18 años indica el correo de un padre, una madre o un tutor al
          registrarse. Una cuenta de padre con esa misma dirección, ya confirmada, ve a ese atleta en su página Familia: su nombre, generación,
          deporte y configuración del perfil, las solicitudes de equipo y de contacto de entrenadores que esperan aprobación, copias de las
          conversaciones con entrenadores universitarios, sus eventos y planes de entrenamiento, y puede descargar sus datos, retirar o dar el
          consentimiento o eliminar su cuenta. No se muestra nada más sobre el atleta, y la cuenta no ve a ningún otro atleta. Si cambia el correo
          del padre, la madre o el tutor en la cuenta del atleta, el acceso pasa a la nueva dirección.
        </li>
        <li>
          Para publicar eventos. Nuestro personal compara cada anuncio enviado con la página del propio organizador antes de que otros puedan verlo.
          Si marcas que vas a un evento y decides mostrarlo a los entrenadores, los entrenadores universitarios verificados ven tu nombre,
          generación, posición y un enlace a tu perfil público en la página de ese evento, solo mientras tu perfil sea público; para atletas menores
          de 18 años también se requiere el consentimiento de un padre, una madre o un tutor. Un entrenador que bloqueaste nunca lo ve. Fuera de
          eso, nadie más ve a qué eventos vas, salvo la cuenta de tu padre, madre o tutor.
        </li>
        <li>Para crear planes de entrenamiento a partir de los resultados de tu análisis, con ejercicios que nuestros entrenadores escribieron o licenciaron. Los planes muestran las mediciones que registras después de empezar junto a tu valor inicial; no afirmamos que los ejercicios hayan causado ningún cambio.</li>
        <li>Para enviar notificaciones a los dispositivos donde las activaste. Una notificación solo dice qué tipo de novedad es, por ejemplo &ldquo;Mensaje nuevo&rdquo;; los nombres, cifras y textos de mensajes aparecen solo dentro de la app.</li>
        <li>Para operar el asistente de reclutamiento si lo usas: seguimos los cambios de entrenadores y las necesidades de plantilla en los programas de tu lista y redactamos presentaciones para que las revises y las envíes tú. Nunca contactamos a entrenadores por ti.</li>
        <li>Para publicar estadísticas anónimas. Cada cifra publicada describe un grupo de al menos 25 atletas, con un valor por atleta, para que no se pueda identificar a nadie.</li>
        <li>Para enviar correos de la cuenta (confirmaciones, restablecimientos de contraseña, solicitudes de consentimiento parental, avisos de facturación), en el idioma que elegiste.</li>
        <li>Para enviar novedades del producto solo si lo aceptaste. Cada correo de marketing tiene un enlace para darte de baja y admite la baja con un clic; también puedes cambiar tu elección en Configuración o desde el enlace de preferencias de cualquier correo. Registramos cuándo hiciste cada elección.</li>
        <li>Para mantener el servicio seguro, prevenir fraudes y cumplir la ley.</li>
      </ul>

      <h2>Quién procesa datos por nosotros</h2>
      <ul>
        <li>Supabase: autenticación y alojamiento de la base de datos.</li>
        <li>Google Cloud: almacenamiento privado de los videos de análisis y de verificación, detección de postura y, cuando activas el seguimiento, seguimiento del disco y la pelota (Video Intelligence API).</li>
        <li>Stripe: pagos y suscripciones.</li>
        <li>Upstash: límites de solicitudes y caché de corta duración.</li>
        <li>Resend: envío de los correos de la cuenta, incluidos los correos de solicitudes de contacto y de equipos a atletas, entrenadores y padres, madres o tutores, y las copias de mensajes que se envían a padres, madres o tutores.</li>
        <li>Servicios push del navegador (Google, Mozilla, Apple o Microsoft, según tu navegador): envío de notificaciones a los dispositivos donde las activaste. El contenido va cifrado para que el servicio push no pueda leerlo, y es solo una línea genérica.</li>
        <li>
          OpenAI: redacción de textos de marketing e informes de datos a partir de estadísticas agregadas y, solo cuando usas el asistente de
          reclutamiento, redacción de correos. Para un borrador enviamos tu nombre, generación, posición, mejores mediciones y, si los ingresaste,
          estatura, peso, GPA y escuela, además de datos sobre el programa. Nunca enviamos tu correo, tu fecha de nacimiento ni tus videos. Según
          los términos de la API de OpenAI, estos datos no se usan para entrenar sus modelos.
        </li>
        <li>Google Analytics: uso anónimo de las páginas públicas, solo con tu consentimiento, con las señales de Google y la personalización de anuncios desactivadas.</li>
        <li>Nuestro proveedor de alojamiento, que sirve el sitio web.</li>
      </ul>
      <p>
        Estos proveedores actúan según nuestras instrucciones bajo acuerdos de tratamiento de datos. No vendemos información personal ni la
        compartimos para publicidad conductual entre contextos. Tu perfil es visible para otros solo si lo haces público, y tu correo llega a un
        entrenador solo cuando aceptas su solicitud, como se describe arriba.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <ul>
        <li>Datos de la cuenta y del perfil: hasta que elimines tu cuenta. La eliminación se hace 7 días después de la solicitud.</li>
        <li>Después de la eliminación guardamos solo un comprobante anónimo (un hash con clave, no tu id ni tu correo) que muestra que la solicitud se completó.</li>
        <li>Videos subidos: se eliminan 12 meses después de subirlos. El informe del análisis se guarda con tu cuenta.</li>
        <li>Clips de verificación: se eliminan 30 días después de la decisión del revisor (de inmediato si las comprobaciones automáticas los rechazan). La decisión y la huella del archivo se guardan con la medición.</li>
        <li>Borradores de correos y notificaciones: hasta que los elimines o elimines tu cuenta.</li>
        <li>Cuentas de entrenadores, atletas guardados y notas privadas: hasta que el entrenador elimine su cuenta o quite al atleta de su lista.</li>
        <li>
          Solicitudes de contacto: hasta que el atleta o el entrenador elimine su cuenta. Las solicitudes sin respuesta se cierran a los 30 días. Si
          un atleta bloquea a un entrenador, o un padre, una madre o un tutor retira el consentimiento, cualquier correo ya compartido se quita de la
          página del entrenador en KineticScout; no podemos recuperar una copia que el entrenador ya haya hecho.
        </li>
        <li>Reportes sobre entrenadores: hasta que se elimine la cuenta del entrenador o la del atleta que hizo el reporte.</li>
        <li>Mensajes: hasta que el atleta o el entrenador elimine su cuenta. Una conversación que terminó se elimina 12 meses después de terminar, salvo que todavía se esté revisando un reporte sobre ella.</li>
        <li>Equipos, plantillas y días de pruebas: hasta que el entrenador del equipo elimine su cuenta; la participación y los resultados de un atleta terminan cuando se elimina cualquiera de las dos cuentas. Un resultado que aceptaste pasa a ser una de tus propias mediciones.</li>
        <li>Dispositivos con notificaciones: hasta que desactives las notificaciones, cierres sesión en ese dispositivo o el servicio push nos indique que el dispositivo ya no existe.</li>
        <li>Eventos: a qué eventos vas se elimina 12 meses después de que termina el evento. Los eventos se eliminan 24 meses después de terminar, y los anuncios que nuestro personal no publicó, 90 días después de la decisión.</li>
        <li>Planes de entrenamiento y registros de práctica: hasta que elimines tu cuenta. Los planes se marcan como terminados dos semanas después de su fecha final.</li>
        <li>Registros de seguridad: hasta 24 meses.</li>
        <li>Mensajes del formulario de contacto: 12 meses.</li>
        <li>Registros de facturación: el tiempo que exijan las leyes fiscales y contables, en poder de Stripe.</li>
      </ul>

      <h2>Tus opciones y derechos</h2>
      <p>
        Puedes acceder, corregir, exportar o eliminar tu información por tu cuenta, sin contactarnos. Consulta{' '}
        <Link href="/legal/your-data">Tus datos y opciones de privacidad</Link> para ver las instrucciones paso a paso.
      </p>
      <ul>
        <li>Acceso y portabilidad: descarga todo lo que tenemos sobre tu cuenta como un archivo JSON desde Configuración.</li>
        <li>Corrección: los atletas editan su perfil desde el panel; contáctanos para cualquier cosa que no puedas cambiar tú.</li>
        <li>
          Eliminación: solicítala desde Configuración, confirmándola con tu contraseña. Te enviamos un correo de inmediato, mantenemos tu perfil
          privado y hacemos la eliminación después de 7 días, durante los cuales puedes cancelarla. Si no puedes iniciar sesión, escribe a{' '}
          <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> desde el correo de tu cuenta y programaremos la misma eliminación.
        </li>
        <li>Los padres, madres y tutores también pueden crear una cuenta de padre con el correo que su atleta nos dio, y hacer todo lo siguiente, además de descargar los datos del atleta, desde su página Familia.</li>
        <li>
          Los padres, madres y tutores de atletas menores de 18 años reciben un enlace privado cuando dan su consentimiento. Con él pueden retirar
          el consentimiento (el perfil vuelve a ser privado, las compras y el contacto con entrenadores se detienen de inmediato, se rechazan las
          solicitudes de contacto abiertas, terminan las conversaciones con entrenadores y la participación en equipos, y los correos ya compartidos
          se quitan de las páginas de los entrenadores), detener la renovación de una suscripción o pedir que se elimine la cuenta. Una eliminación
          que pide un padre, una madre o un tutor solo la puede cancelar esa misma persona. Se puede pedir un enlace nuevo en cualquier momento.
        </li>
      </ul>
      <p>
        Según dónde vivas (por ejemplo, California, Virginia, Colorado o la UE), puedes tener derechos adicionales, que respetamos para todos los
        usuarios sin importar dónde estén.
      </p>

      <h2>Seguridad</h2>
      <p>
        Todo el tráfico va cifrado con HTTPS. Los scripts no pueden leer las cookies de sesión. Los videos se guardan de forma privada y se
        comparten solo mediante enlaces firmados de corta duración. El acceso a los datos de producción se limita al personal que lo necesita.
      </p>

      <h2>Cambios</h2>
      <p>
        Si cambiamos esta política o nuestros Términos de forma importante, enviaremos un correo a los titulares de cuentas antes de que el cambio
        entre en vigor, y te pediremos que revises y aceptes la nueva versión la próxima vez que inicies sesión. Mientras no la aceptes, todavía
        puedes descargar tus datos o eliminar tu cuenta. Consulta también nuestra <Link href="/legal/cookies">Política de cookies</Link> y
        nuestros <Link href="/legal/terms">Términos del servicio</Link>.
      </p>
    </>
  )
}
