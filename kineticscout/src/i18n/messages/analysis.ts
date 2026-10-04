import type { Locale } from '@/i18n/config'
import { defineMessages } from '@/i18n/define'
import type { Motion } from '@/lib/biomechanics/motions'
import type { Finding, KinematicReport } from '@/lib/biomechanics/types'

type Failure = { title: string; help: string }

/** Video analysis: upload, history, the report, puck and ball tracking, and the side-by-side comparison. */
export const analysisMessages = defineMessages(
  {
    title: 'Video analysis',
    h1: 'AI biomechanics video analysis',
    report: 'Report',
    reportTitle: 'Analysis report',
    buildPlan: 'Build a training plan',
    buildPlanTail: ' from this analysis’s focus areas.',
    status: { AWAITING_UPLOAD: 'Waiting for upload', QUEUED: 'Queued', PROCESSING: 'Analyzing', COMPLETE: 'Complete', FAILED: 'Failed' } as Record<string, string>,
    failures: {
      FILE_MISSING: { title: 'The upload did not finish', help: 'Upload the video again.' },
      UNSUPPORTED_FILE: { title: 'That file is not a supported video', help: 'Export the clip as MP4 or MOV and upload it again.' },
      FILE_TOO_LARGE: { title: 'The file is too large', help: 'Trim the clip to just the motion (20 seconds or less).' },
      NO_PERSON: { title: 'No athlete was detected', help: 'Make sure your whole body is in frame and well lit, with no one else in the shot.' },
      POSE_INCOMPLETE: {
        title: 'Not enough of the body was visible',
        help: 'Hips, shoulders, arms and ankles must stay in frame for the whole motion. Film from a little further back.',
      },
      BUDGET_EXHAUSTED: { title: 'Analysis is paused for this month', help: 'Your monthly analysis allowance is used up. It resets on the 1st.' },
      PROCESSING_ERROR: { title: 'We could not finish the analysis', help: 'This was a problem on our side. Upload the clip again in a few minutes.' },
      UPLOAD_EXPIRED: { title: 'The upload expired', help: 'The upload was never completed. Start a new upload.' },
    } as Record<string, Failure>,
    list: {
      title: 'Your analyses',
      loading: 'Loading analyses',
      emptyTitle: 'No analyses yet',
      emptyBody: 'Upload your first swing or pitch above.',
      inOrder: 'Sequence in order',
      issues: (n: number) => `${n} issue${n === 1 ? '' : 's'} found`,
      failed: 'Failed',
      loadingMore: 'Loading',
      loadMore: 'Load more',
    },
    detail: {
      loading: 'Loading analysis',
      wait: 'This usually takes one to three minutes. You can leave this page; results are saved to your history.',
      another: 'Upload another clip',
      noReport: 'This analysis has no report.',
      deleted: 'The original video has been deleted under our retention policy. The report below is kept.',
      compare: 'Compare side by side',
    },
    player: {
      video: 'Your uploaded video with skeletal tracking overlay',
      hide: 'Hide skeleton',
      show: 'Show skeleton',
      jumpFoot: 'Jump to foot strike',
      speed: 'Speed',
    },
    sequence: {
      segment: { pelvis: 'Pelvis', torso: 'Trunk', arm: 'Arm', hand: 'Hand' },
      footStrike: 'Foot strike',
      axis: (foot: boolean) => `time relative to ${foot ? 'foot strike' : 'first peak'} (ms)`,
      caption: (observed: string[], ideal: string[]) => `Peak order observed: ${observed.join(', then ')}. Efficient order: ${ideal.join(', then ')}.`,
      title: (ideal: boolean) => `Kinematic sequence: ${ideal ? 'in order' : 'out of order'}`,
      tableCaption: 'Peak angular speed and timing by body segment',
      colSegment: 'Segment',
      colTime: 'Peak time (s)',
      colSpeed: 'Peak speed (deg/s, 2D estimate)',
      pelvisToTrunk: 'Pelvis to trunk',
      trunkToArm: 'Trunk to arm',
      sepFoot: 'Separation at foot strike',
      notMeasured: 'Not measured',
      maxSep: 'Max separation',
      deg: 'deg',
      workOn: 'What to work on',
      noFindings: 'No sequencing problems were detected in this clip. Keep filming regularly to track consistency.',
      severity: { high: 'High priority', medium: 'Medium priority', low: 'Worth checking' },
      focus: 'Focus: ',
      about: 'About this measurement',
      quality: (fps: number, sec: number, confidence: number) => `${fps} frames per second, ${sec} s analyzed, tracking confidence ${confidence}%.`,
      warnings: {
        LOW_FRAME_RATE: 'Recorded below 100 frames per second, so timing differences shorter than one frame cannot be measured. Use slow motion for sharper results.',
        FOOT_STRIKE_NOT_DETECTED: 'Front foot landing was not detected, so separation at foot strike is not reported.',
        LOW_KEYPOINT_CONFIDENCE: 'Body tracking confidence was low. Better lighting and a clear view of the whole body will improve accuracy.',
        SHORT_CLIP: 'Very short clip. Include the full motion from load to follow-through.',
      } as Record<string, string>,
      limits:
        'Speeds and angles are estimated from a single 2D camera view and are best used to compare your own clips over time. They are not a substitute for a motion capture lab or a qualified coach.',
    },
    projectile: {
      noun: { SWING: 'ball', PITCH: 'ball', HOCKEY_SHOT: 'puck', FOOTBALL_THROW: 'ball' } as Record<Motion, string>,
      title: (noun: string) => `${noun.charAt(0).toUpperCase()}${noun.slice(1)} tracking`,
      beta: '(beta)',
      speed: 'Estimated speed across the frame',
      speedValue: (mph: string) => `about ${mph} mph (lower bound)`,
      notAvailable: 'not available',
      launch: 'Launch direction',
      launchValue: (deg: number, up: boolean, side: 'left' | 'right' | null) => `${deg}° ${up ? 'upward' : 'downward'}, toward the ${side ?? 'center'} of the frame`,
      warnings: {
        NOT_FOUND: 'We could not find it in this clip. Tracking works best with a bright ball or puck, a plain background, good light and slow motion.',
        FEW_POINTS: 'It was only visible in a few frames after release, too few to measure.',
        NO_HEIGHT: 'Add your height on Profile and sharing to get a speed estimate; your height is the ruler we measure with.',
        IMPLAUSIBLE_SPEED: 'The speed we measured is outside the realistic range, so we are not showing it. This usually means the camera angle or distance made the scale unreliable.',
        LOW_FIT: 'Its path did not follow a clean line after release, so we did not estimate speed.',
      } as Record<string, string>,
      limits: (noun: string) =>
        `Measured from one camera, so any movement toward or away from the camera is missed and the true speed is likely higher. The scale assumes the ${noun} travels at about your distance from the camera. Use a radar gun or launch monitor for numbers you share with coaches.`,
    },
    upload: {
      motionNames: (names: string[]) => names.map((n) => n.toLowerCase()).join(' or '),
      type: 'Choose an MP4 or MOV video. Most phones record in one of these formats.',
      tooBig: (mb: string, limit: number, names: string) => `That file is ${mb} MB. The limit is ${limit} MB; trim the clip to just the ${names}.`,
      tooLong: (sec: string, limit: number) => `The clip is ${sec} seconds. Trim it to ${limit} seconds or less.`,
      tooShort: 'The clip must be at least 1 second long.',
      unreadable: 'We could not read that video in your browser. Try exporting it again as MP4.',
      title: (names: string) => `Analyze a ${names}`,
      intro: 'The analysis estimates when your hips, trunk, arm and hand reach peak speed, and flags the sequence problems behind lost velocity.',
      motion: 'Motion',
      hand: { SWING: 'Bats', PITCH: 'Throws', HOCKEY_SHOT: 'Shoots', FOOTBALL_THROW: 'Throws' } as Record<Motion, string>,
      right: 'Right',
      left: 'Left',
      track: (noun: string) =>
        `Also track the ${noun} (beta). We estimate its direction and speed across the frame from the video. It is an estimate, it works best with a bright ${noun} against a plain background, and we may not find it at all.`,
      checklist: 'Filming checklist',
      filming: {
        SWING: 'Camera facing your chest, square to the line toward the pitcher, at hip height.',
        PITCH: 'Camera facing your chest, square to the line toward the plate, at hip height.',
        HOCKEY_SHOT: 'Camera facing your chest from the side boards, square to the line toward the net, at hip height. Film on ice or a shooting pad with your whole body and stick in frame.',
        FOOTBALL_THROW: 'Camera facing your chest from the side, square to the line of the throw, at hip height, with your whole body in frame through the follow-through.',
      } as Record<Motion, string>,
      wholeBody: 'Whole body in frame from start to finish, with no one else in the shot.',
      slowMo: 'Use slow motion (120 or 240 frames per second) if your phone has it.',
      format: (sec: number, mb: number) => `MP4 or MOV, up to ${sec} seconds and ${mb} MB.`,
      file: 'Video file',
      record: 'Or record now',
      recordHint: '(opens the camera on phones and tablets)',
      checking: 'Checking video',
      preview: 'Preview of the selected video',
      uploading: 'Uploading video',
      finalizing: 'Checking the uploaded file',
      start: 'Upload and analyze',
      confirmTitle: 'Start this analysis?',
      confirmBody: (n: number) => `This uses one of your ${n} analyses for the month. Results usually take one to three minutes.`,
      confirm: 'Start analysis',
      cancel: 'Cancel upload',
    },
    compare: {
      title: 'Side-by-side comparison',
      crumb: 'Compare',
      intro:
        'Both clips are lined up on the moment your front foot lands (or on peak hand speed when a foot strike is not visible, common on skates), then play together. Slow them down to see which body segment fires first.',
      loadingOptions: 'Loading comparison options',
      deleted: 'This clip cannot be compared because its video was deleted under the retention policy.',
      uploadNew: 'Upload a new clip',
      toCompare: ' to compare.',
      nothingTitle: 'Nothing to compare with yet',
      nothingBody: (first: boolean) =>
        `Upload another ${first ? 'clip' : 'clip of the same motion'} to compare your mechanics over time. Professional reference clips appear here when KineticScout has licensed footage to show.`,
      with: 'Compare with',
      references: 'Licensed reference clips',
      earlier: 'Your earlier clips',
      noReferences: 'Professional reference clips appear here when KineticScout has licensed footage to show. Until then you can compare your own clips.',
      loadingBoth: 'Loading both clips',
      sequence: 'Kinematic sequence',
      you: 'You',
      reference: 'Reference',
      earlierClip: 'Earlier clip',
      anchor: { FOOT_STRIKE: 'foot strike', HAND_PEAK: 'peak hand speed' } as Record<string, string>,
      synced: (label: string) => `${label}, synced with the other clip`,
      mirrored: ' · mirrored to match your side',
      pauseBoth: 'Pause both clips',
      playBoth: 'Play both clips',
      pause: 'Pause',
      play: 'Play',
      jump: (anchor: string) => `Jump to ${anchor}`,
      speed: 'Speed',
      hideAll: 'Hide skeletons',
      showAll: 'Show skeletons',
      timeFrom: (anchor: string) => `Time from ${anchor}:`,
      msFrom: (ms: number, anchor: string) => `${ms} milliseconds from ${anchor}`,
      segment: { pelvis: 'Pelvis', torso: 'Torso', arm: 'Arm', hand: 'Hand' },
      mark: { pelvis: 'P', torso: 'T', arm: 'A', hand: 'H' },
      svg: (anchor: string) => `Peak speed timing of pelvis, torso, arm and hand for both clips, relative to ${anchor}. Values are listed in the table below.`,
      tableCaption: (anchor: string) => `Peak speed time relative to ${anchor}, in milliseconds`,
      colSegment: 'Segment',
      colDiff: 'Difference',
      na: 'n/a',
      error: 'Times are estimated from 2D video at each clip’s frame rate, so differences under about one frame (33 ms at 30 fps) are within measurement error. The order of the peaks matters more than the exact times.',
    },
  },
  {
    title: 'Análisis de video',
    h1: 'Análisis biomecánico de video con IA',
    report: 'Informe',
    reportTitle: 'Informe del análisis',
    buildPlan: 'Crea un plan de entrenamiento',
    buildPlanTail: ' a partir de las áreas de enfoque de este análisis.',
    status: { AWAITING_UPLOAD: 'Esperando la carga', QUEUED: 'En cola', PROCESSING: 'Analizando', COMPLETE: 'Completo', FAILED: 'Falló' },
    failures: {
      FILE_MISSING: { title: 'La carga no terminó', help: 'Vuelve a subir el video.' },
      UNSUPPORTED_FILE: { title: 'Ese archivo no es un video compatible', help: 'Exporta el clip como MP4 o MOV y vuelve a subirlo.' },
      FILE_TOO_LARGE: { title: 'El archivo es demasiado grande', help: 'Recorta el clip para dejar solo el movimiento (20 segundos o menos).' },
      NO_PERSON: { title: 'No se detectó a ningún atleta', help: 'Asegúrate de que todo tu cuerpo esté en cuadro y bien iluminado, sin nadie más en la toma.' },
      POSE_INCOMPLETE: {
        title: 'No se vio suficiente del cuerpo',
        help: 'La cadera, los hombros, los brazos y los tobillos deben quedar en cuadro durante todo el movimiento. Graba desde un poco más lejos.',
      },
      BUDGET_EXHAUSTED: { title: 'El análisis está en pausa este mes', help: 'Se agotó tu cupo mensual de análisis. Se renueva el día 1.' },
      PROCESSING_ERROR: { title: 'No pudimos terminar el análisis', help: 'Fue un problema de nuestro lado. Vuelve a subir el clip en unos minutos.' },
      UPLOAD_EXPIRED: { title: 'La carga venció', help: 'La carga nunca se completó. Empieza una nueva.' },
    },
    list: {
      title: 'Tus análisis',
      loading: 'Cargando los análisis',
      emptyTitle: 'Todavía no hay análisis',
      emptyBody: 'Sube arriba tu primer swing o lanzamiento.',
      inOrder: 'Secuencia en orden',
      issues: (n: number) => `${n} ${n === 1 ? 'problema encontrado' : 'problemas encontrados'}`,
      failed: 'Falló',
      loadingMore: 'Cargando',
      loadMore: 'Cargar más',
    },
    detail: {
      loading: 'Cargando el análisis',
      wait: 'Normalmente tarda de uno a tres minutos. Puedes salir de esta página; los resultados se guardan en tu historial.',
      another: 'Sube otro clip',
      noReport: 'Este análisis no tiene informe.',
      deleted: 'El video original se eliminó según nuestra política de conservación. El informe de abajo se conserva.',
      compare: 'Comparar lado a lado',
    },
    player: {
      video: 'Tu video subido con el esqueleto de seguimiento superpuesto',
      hide: 'Ocultar esqueleto',
      show: 'Mostrar esqueleto',
      jumpFoot: 'Ir al apoyo del pie',
      speed: 'Velocidad',
    },
    sequence: {
      segment: { pelvis: 'Pelvis', torso: 'Tronco', arm: 'Brazo', hand: 'Mano' },
      footStrike: 'Apoyo del pie',
      axis: (foot: boolean) => `tiempo respecto ${foot ? 'al apoyo del pie' : 'al primer pico'} (ms)`,
      caption: (observed: string[], ideal: string[]) => `Orden de picos observado: ${observed.join(', luego ')}. Orden eficiente: ${ideal.join(', luego ')}.`,
      title: (ideal: boolean) => `Secuencia cinemática: ${ideal ? 'en orden' : 'fuera de orden'}`,
      tableCaption: 'Velocidad angular máxima y tiempo por segmento del cuerpo',
      colSegment: 'Segmento',
      colTime: 'Tiempo del pico (s)',
      colSpeed: 'Velocidad máxima (grados/s, estimación 2D)',
      pelvisToTrunk: 'De pelvis a tronco',
      trunkToArm: 'De tronco a brazo',
      sepFoot: 'Separación en el apoyo del pie',
      notMeasured: 'No medida',
      maxSep: 'Separación máxima',
      deg: 'grados',
      workOn: 'Qué trabajar',
      noFindings: 'No se detectaron problemas de secuencia en este clip. Sigue grabando con regularidad para ver tu consistencia.',
      severity: { high: 'Prioridad alta', medium: 'Prioridad media', low: 'Vale la pena revisar' },
      focus: 'Enfoque: ',
      about: 'Sobre esta medición',
      quality: (fps: number, sec: number, confidence: number) => `${fps} cuadros por segundo, ${sec} s analizados, confianza del seguimiento ${confidence} %.`,
      warnings: {
        LOW_FRAME_RATE: 'Se grabó a menos de 100 cuadros por segundo, así que no se pueden medir diferencias de tiempo menores a un cuadro. Usa cámara lenta para obtener resultados más precisos.',
        FOOT_STRIKE_NOT_DETECTED: 'No se detectó el apoyo del pie delantero, así que no se informa la separación en ese momento.',
        LOW_KEYPOINT_CONFIDENCE: 'La confianza del seguimiento del cuerpo fue baja. Más luz y una vista clara de todo el cuerpo mejorarán la precisión.',
        SHORT_CLIP: 'Clip muy corto. Incluye el movimiento completo, desde la carga hasta el final.',
      },
      limits:
        'Las velocidades y los ángulos se estiman a partir de una sola vista de cámara en 2D y sirven sobre todo para comparar tus propios clips con el tiempo. No sustituyen a un laboratorio de captura de movimiento ni a un entrenador calificado.',
    },
    projectile: {
      noun: { SWING: 'pelota', PITCH: 'pelota', HOCKEY_SHOT: 'disco', FOOTBALL_THROW: 'balón' },
      title: (noun: string) => `Seguimiento ${noun === 'disco' ? 'del disco' : noun === 'balón' ? 'del balón' : 'de la pelota'}`,
      beta: '(beta)',
      speed: 'Velocidad estimada a lo largo del cuadro',
      speedValue: (mph: string) => `unas ${mph} mph (límite inferior)`,
      notAvailable: 'no disponible',
      launch: 'Dirección de salida',
      launchValue: (deg: number, up: boolean, side: 'left' | 'right' | null) =>
        `${deg}° hacia ${up ? 'arriba' : 'abajo'}, hacia ${side === 'left' ? 'la izquierda' : side === 'right' ? 'la derecha' : 'el centro'} del cuadro`,
      warnings: {
        NOT_FOUND: 'No pudimos encontrarlo en este clip. El seguimiento funciona mejor con una pelota o un disco de color brillante, un fondo liso, buena luz y cámara lenta.',
        FEW_POINTS: 'Solo se vio en unos pocos cuadros después de soltarlo, muy pocos para medir.',
        NO_HEIGHT: 'Agrega tu estatura en Perfil y compartir para obtener una estimación de velocidad; tu estatura es la regla con la que medimos.',
        IMPLAUSIBLE_SPEED: 'La velocidad que medimos está fuera del rango realista, así que no la mostramos. Esto suele significar que el ángulo o la distancia de la cámara hicieron poco confiable la escala.',
        LOW_FIT: 'Su trayectoria no siguió una línea limpia después de soltarlo, así que no estimamos la velocidad.',
      },
      limits: (noun: string) =>
        `Se mide con una sola cámara, así que no se capta el movimiento hacia la cámara o alejándose de ella, y la velocidad real probablemente sea mayor. La escala supone que ${noun === 'disco' ? 'el disco' : noun === 'balón' ? 'el balón' : 'la pelota'} viaja a más o menos tu misma distancia de la cámara. Usa una pistola de radar o un monitor de lanzamiento para las cifras que compartas con entrenadores.`,
    },
    upload: {
      motionNames: (names: string[]) => names.map((n) => n.toLowerCase()).join(' o '),
      type: 'Elige un video MP4 o MOV. La mayoría de los teléfonos graban en uno de estos formatos.',
      tooBig: (mb: string, limit: number, names: string) => `Ese archivo pesa ${mb} MB. El límite es de ${limit} MB; recorta el clip para dejar solo el ${names}.`,
      tooLong: (sec: string, limit: number) => `El clip dura ${sec} segundos. Recórtalo a ${limit} segundos o menos.`,
      tooShort: 'El clip debe durar al menos 1 segundo.',
      unreadable: 'No pudimos leer ese video en tu navegador. Intenta exportarlo otra vez como MP4.',
      title: (names: string) => `Analiza un ${names}`,
      intro: 'El análisis estima cuándo tu cadera, tronco, brazo y mano llegan a su velocidad máxima, y señala los problemas de secuencia que te hacen perder velocidad.',
      motion: 'Movimiento',
      hand: { SWING: 'Bateas', PITCH: 'Lanzas', HOCKEY_SHOT: 'Tiras', FOOTBALL_THROW: 'Lanzas' },
      right: 'Derecha',
      left: 'Izquierda',
      track: (noun: string) =>
        `Seguir también ${noun === 'disco' ? 'el disco' : noun === 'balón' ? 'el balón' : 'la pelota'} (beta). Estimamos su dirección y velocidad a lo largo del cuadro a partir del video. Es una estimación, funciona mejor con ${noun === 'disco' ? 'un disco' : noun === 'balón' ? 'un balón' : 'una pelota'} de color brillante sobre un fondo liso, y es posible que no lo encontremos.`,
      checklist: 'Lista para grabar',
      filming: {
        SWING: 'Cámara de frente a tu pecho, perpendicular a la línea hacia el lanzador, a la altura de la cadera.',
        PITCH: 'Cámara de frente a tu pecho, perpendicular a la línea hacia el plato, a la altura de la cadera.',
        HOCKEY_SHOT: 'Cámara de frente a tu pecho desde la valla lateral, perpendicular a la línea hacia la portería, a la altura de la cadera. Graba sobre hielo o una plataforma de tiro con todo tu cuerpo y el palo en cuadro.',
        FOOTBALL_THROW: 'Cámara de frente a tu pecho desde un costado, perpendicular a la línea del pase, a la altura de la cadera, con todo tu cuerpo en cuadro hasta el final del movimiento.',
      },
      wholeBody: 'Todo el cuerpo en cuadro de principio a fin, sin nadie más en la toma.',
      slowMo: 'Usa cámara lenta (120 o 240 cuadros por segundo) si tu teléfono la tiene.',
      format: (sec: number, mb: number) => `MP4 o MOV, hasta ${sec} segundos y ${mb} MB.`,
      file: 'Archivo de video',
      record: 'O graba ahora',
      recordHint: '(abre la cámara en teléfonos y tabletas)',
      checking: 'Revisando el video',
      preview: 'Vista previa del video elegido',
      uploading: 'Subiendo el video',
      finalizing: 'Revisando el archivo subido',
      start: 'Subir y analizar',
      confirmTitle: '¿Empezar este análisis?',
      confirmBody: (n: number) => `Esto usa uno de tus ${n} análisis del mes. Los resultados suelen tardar de uno a tres minutos.`,
      confirm: 'Empezar el análisis',
      cancel: 'Cancelar la carga',
    },
    compare: {
      title: 'Comparación lado a lado',
      crumb: 'Comparar',
      intro:
        'Ambos clips se alinean en el momento en que tu pie delantero toca el suelo (o en la velocidad máxima de la mano cuando no se ve el apoyo, algo común con patines) y se reproducen juntos. Ponlos en cámara lenta para ver qué segmento del cuerpo se activa primero.',
      loadingOptions: 'Cargando las opciones de comparación',
      deleted: 'Este clip no se puede comparar porque su video se eliminó según la política de conservación.',
      uploadNew: 'Sube un clip nuevo',
      toCompare: ' para comparar.',
      nothingTitle: 'Todavía no hay con qué comparar',
      nothingBody: (first: boolean) =>
        `Sube otro ${first ? 'clip' : 'clip del mismo movimiento'} para comparar tu mecánica con el tiempo. Los clips de referencia profesionales aparecen aquí cuando KineticScout tiene material con licencia para mostrar.`,
      with: 'Comparar con',
      references: 'Clips de referencia con licencia',
      earlier: 'Tus clips anteriores',
      noReferences: 'Los clips de referencia profesionales aparecen aquí cuando KineticScout tiene material con licencia para mostrar. Mientras tanto puedes comparar tus propios clips.',
      loadingBoth: 'Cargando ambos clips',
      sequence: 'Secuencia cinemática',
      you: 'Tú',
      reference: 'Referencia',
      earlierClip: 'Clip anterior',
      anchor: { FOOT_STRIKE: 'el apoyo del pie', HAND_PEAK: 'la velocidad máxima de la mano' },
      synced: (label: string) => `${label}, sincronizado con el otro clip`,
      mirrored: ' · reflejado para coincidir con tu lado',
      pauseBoth: 'Pausar ambos clips',
      playBoth: 'Reproducir ambos clips',
      pause: 'Pausar',
      play: 'Reproducir',
      jump: (anchor: string) => `Ir a ${anchor}`,
      speed: 'Velocidad',
      hideAll: 'Ocultar esqueletos',
      showAll: 'Mostrar esqueletos',
      timeFrom: (anchor: string) => `Tiempo desde ${anchor}:`,
      msFrom: (ms: number, anchor: string) => `${ms} milisegundos desde ${anchor}`,
      segment: { pelvis: 'Pelvis', torso: 'Torso', arm: 'Brazo', hand: 'Mano' },
      mark: { pelvis: 'P', torso: 'T', arm: 'B', hand: 'M' },
      svg: (anchor: string) => `Tiempo de velocidad máxima de pelvis, torso, brazo y mano en ambos clips, respecto a ${anchor}. Los valores aparecen en la tabla de abajo.`,
      tableCaption: (anchor: string) => `Tiempo de velocidad máxima respecto a ${anchor}, en milisegundos`,
      colSegment: 'Segmento',
      colDiff: 'Diferencia',
      na: 'n/d',
      error: 'Los tiempos se estiman a partir de video 2D a la velocidad de cuadros de cada clip, así que las diferencias de menos de un cuadro (33 ms a 30 cuadros por segundo) están dentro del margen de error. Importa más el orden de los picos que los tiempos exactos.',
    },
  },
)

/** Spanish wording per motion for the findings; English findings are stored on the report as written. */
const ES_MOTION: Record<Motion, { arm: string; handTitle: string; plant: string; armFocus: string }> = {
  SWING: {
    arm: 'brazo guía',
    handTitle: 'Las manos y el bate llegan a su pico antes que el brazo',
    plant: 'el apoyo del pie',
    armFocus: 'Mantén las manos atrás hasta que gire el tronco, sin empujar ni abrir el bate antes de tiempo.',
  },
  PITCH: {
    arm: 'brazo de lanzar',
    handTitle: 'La mano llega a su pico antes que el brazo al soltar',
    plant: 'el apoyo del pie',
    armFocus: 'Retrasa la aceleración del brazo hasta que el tronco haya girado hacia el objetivo.',
  },
  HOCKEY_SHOT: {
    arm: 'brazo de abajo',
    handTitle: 'Las manos y el palo llegan a su pico antes que el brazo',
    plant: 'la transferencia de peso a la pierna delantera',
    armFocus: 'Deja que la cadera y el tronco giren hacia la portería antes de que las manos jalen el palo.',
  },
  FOOTBALL_THROW: {
    arm: 'brazo de lanzar',
    handTitle: 'La mano llega a su pico antes que el brazo al soltar',
    plant: 'el apoyo del pie delantero',
    armFocus: 'Deja que la cadera y el tronco se abran hacia el objetivo antes de que pase el brazo.',
  },
}

/**
 * A finding in the reader's language. English uses the text stored with the report; Spanish is
 * rebuilt from the finding code, the motion and the measured values on the same report.
 */
export function findingText(finding: Finding, report: Pick<KinematicReport, 'peaks' | 'separationAtFootStrikeDeg'> | null, motion: Motion, locale: Locale): Pick<Finding, 'title' | 'detail' | 'focus'> {
  if (locale === 'en') return finding
  const w = ES_MOTION[motion]
  const peak = (s: string) => report?.peaks.find((p) => p.segment === s)?.time ?? 0
  const ms = (a: string, b: string) => Math.round((peak(a) - peak(b)) * 1000)
  switch (finding.code) {
    case 'TRUNK_LEADS_PELVIS':
      return {
        title: 'La rotación del tronco llega a su pico antes que la cadera',
        detail: `La velocidad del tronco llegó a su pico ${ms('pelvis', 'torso')} ms antes que la de la pelvis. La parte superior del cuerpo inicia la rotación en lugar de ser arrastrada por la cadera.`,
        focus: 'Deja que la cadera inicie la rotación mientras el pecho se mantiene cerrado hasta el apoyo del pie.',
      }
    case 'ARM_LEADS_TRUNK':
      return {
        title: 'La velocidad del brazo llega a su pico antes que el tronco',
        detail: `El ${w.arm} llegó a su pico ${ms('torso', 'arm')} ms antes que el tronco, señal de que el brazo genera velocidad por su cuenta en lugar de recibirla del cuerpo.`,
        focus: w.armFocus,
      }
    case 'HAND_LEADS_ARM':
      return {
        title: w.handTitle,
        detail: `La velocidad del antebrazo llegó a su pico ${ms('arm', 'hand')} ms antes que la del brazo.`,
        focus: 'Trabaja en soltar el antebrazo y la mano al final de la cadena.',
      }
    case 'LOW_HIP_SHOULDER_SEPARATION':
      return {
        title: `La cadera y los hombros giran juntos en ${w.plant}`,
        detail: `La separación estimada entre cadera y hombros en ${w.plant} fue de ${(report?.separationAtFootStrikeDeg ?? 0).toFixed(0)} grados. Poca separación limita el estiramiento que puede aprovechar el tronco.`,
        focus:
          motion === 'HOCKEY_SHOT'
            ? 'Empieza a abrir la cadera manteniendo los hombros cerrados mientras el peso pasa a la pierna delantera.'
            : 'Empieza a abrir la cadera manteniendo los hombros cerrados mientras aterriza el pie delantero.',
      }
    case 'SEGMENTS_FIRE_TOGETHER':
      return {
        title: 'Los segmentos llegan a su pico casi al mismo tiempo',
        detail: 'El orden es correcto, pero los picos de pelvis, tronco y brazo están a menos de 10 ms entre sí, así que el movimiento se comporta más como un bloque que como un látigo.',
        focus: 'Construye ritmo entre el giro de la cadera y el del tronco en lugar de girar todo a la vez.',
      }
    case 'NO_SPEED_GAIN_PELVIS_TO_TRUNK':
      return {
        title: 'El tronco no es más rápido que la pelvis',
        detail: 'En una secuencia eficiente, cada segmento llega a un pico más rápido que el anterior. Es una estimación basada en imágenes; confírmalo con un segundo clip antes de actuar.',
        focus: 'Concéntrate en transferir la rotación de la cadera a un giro más rápido del tronco.',
      }
  }
}

/** Just the finding title, for lists that only carry the code and the stored English title. */
export function findingTitle(finding: Pick<Finding, 'code' | 'title' | 'severity'>, motion: Motion, locale: Locale): string {
  return findingText({ ...finding, detail: '', focus: '' }, null, motion, locale).title
}
