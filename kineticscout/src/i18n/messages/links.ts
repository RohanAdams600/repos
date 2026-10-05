import { defineMessages } from '@/i18n/define'

/** Pages reached from emailed links that are not about guardian consent: sign-in confirmation, coach school email, email preferences. */
export const linksMessages = defineMessages(
  {
    confirm: {
      title: 'Confirm',
      resetTitle: 'Reset your password',
      confirmTitle: 'Confirm your email',
      resetIntro: 'Continue to choose a new password.',
      confirmIntro: 'One more step to activate your KineticScout account.',
      checking: 'Checking link',
      continue: 'Continue',
      confirm: 'Confirm my email',
    },
    coachEmail: {
      title: 'Confirm your school email',
      results: {
        confirmed: 'School email confirmed. A KineticScout staff member will check your program staff directory, usually within 2 business days. We will email you when you are verified.',
        invalid: 'This link is not valid or has expired. Sign in and submit your details again to get a new link.',
        limited: 'Too many attempts. Try again in an hour.',
      } as Record<string, string>,
      dashboard: 'Go to your dashboard',
      intro: 'Confirm that this school email address belongs to you so we can verify your coach account.',
      submit: 'Confirm my school email',
      missing: 'This link is missing its code. Use the link in the email we sent.',
    },
    preferences: {
      title: 'Email preferences',
      invalid: 'This preferences link is not valid. Use the link in a recent KineticScout email, or',
      signIn: 'sign in',
      invalidTail: ' and open Settings.',
      choicesFor: (email: string) => `Choices for ${email}.`,
      account: 'Account emails (password resets, billing receipts, consent and deletion notices) are still sent while the account exists. To stop those,',
      accountTail: ' and delete the account from Settings.',
    },
  },
  {
    confirm: {
      title: 'Confirmar',
      resetTitle: 'Restablece tu contraseña',
      confirmTitle: 'Confirma tu correo',
      resetIntro: 'Continúa para elegir una contraseña nueva.',
      confirmIntro: 'Un paso más para activar tu cuenta de KineticScout.',
      checking: 'Revisando el enlace',
      continue: 'Continuar',
      confirm: 'Confirmar mi correo',
    },
    coachEmail: {
      title: 'Confirma tu correo de la universidad',
      results: {
        confirmed: 'Correo de la universidad confirmado. Una persona del equipo de KineticScout revisará el directorio de personal de tu programa, normalmente en un plazo de 2 días hábiles. Te escribiremos cuando estés verificado.',
        invalid: 'Este enlace no es válido o venció. Inicia sesión y vuelve a enviar tus datos para recibir un enlace nuevo.',
        limited: 'Demasiados intentos. Inténtalo de nuevo en una hora.',
      },
      dashboard: 'Ir a tu panel',
      intro: 'Confirma que este correo de la universidad es tuyo para que podamos verificar tu cuenta de entrenador.',
      submit: 'Confirmar mi correo de la universidad',
      missing: 'A este enlace le falta su código. Usa el enlace del correo que te enviamos.',
    },
    preferences: {
      title: 'Preferencias de correo',
      invalid: 'Este enlace de preferencias no es válido. Usa el enlace de un correo reciente de KineticScout, o',
      signIn: 'inicia sesión',
      invalidTail: ' y abre Configuración.',
      choicesFor: (email: string) => `Opciones para ${email}.`,
      account: 'Los correos de la cuenta (restablecimientos de contraseña, recibos de facturación, avisos de consentimiento y de eliminación) se siguen enviando mientras exista la cuenta. Para dejar de recibirlos,',
      accountTail: ' y elimina la cuenta desde Configuración.',
    },
  },
)
