import type { businessDetails } from '@/lib/legal'

/** Courtesy Spanish translation of the Refund Policy. Keep it in step with page.tsx; the English text governs. */
export function RefundsEs({ b }: { b: ReturnType<typeof businessDetails> }) {
  return (
    <>
      <ul>
        <li>Cobros duplicados: si alguna vez se inician dos suscripciones Pro en una misma cuenta, la suscripción adicional se cancela y se reembolsa automáticamente.</li>
        <li>Suscripciones nuevas: si Pro no es para ti, escríbenos dentro de los 14 días posteriores a tu primer pago para recibir un reembolso completo.</li>
        <li>Renovaciones anuales: escríbenos dentro de los 14 días posteriores al cobro de una renovación anual para recibir un reembolso completo.</li>
        <li>Renovaciones mensuales: cancela en cualquier momento para detener los cobros futuros. Pro sigue activo hasta el final del mes pagado; los meses parciales no se reembolsan.</li>
        <li>Eliminación de la cuenta: cualquier suscripción termina cuando se hace la eliminación, 7 días después de la solicitud. Los plazos de reembolso anteriores siguen aplicando; escríbenos antes de la fecha de eliminación para que podamos asociar el pago a tu cuenta.</li>
      </ul>
      <p>
        Para pedir un reembolso, escribe a <a href={`mailto:${b.supportEmail}`}>{b.supportEmail}</a> desde el correo de tu cuenta. Los reembolsos
        vuelven al método de pago original, normalmente en un plazo de 5 a 10 días hábiles según tu banco. No hay cargos por cancelación.
      </p>
    </>
  )
}
