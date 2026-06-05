// Plantilla de guion por defecto — método Apex (llamada de admisión high-ticket).
// Cada cliente parte de aquí y lo adapta. Cada fase tiene "lines" (qué decir/
// preguntar) y "tips" (consejos). Inspirado en el /script de Detrás de Cámara,
// adaptado a lo que se enseña en Apex.

export const DEFAULT_SCRIPT = {
  phases: [
    {
      id: 'apertura', title: 'Apertura y encuadre',
      lines: [
        'Rompe el hielo 30s — rapport genuino, sin forzar.',
        'Encuadra: "Te robo X min. Te hago unas preguntas, te explico cómo trabajamos y al final decidimos juntos si tiene sentido, ¿te parece?"',
        'Pide permiso para preguntar y tomar notas.',
      ],
      tips: ['Marca tú el frame: tú llevas la llamada.', 'Autoridad tranquila, ritmo pausado, sonríe.'],
    },
    {
      id: 'situacion', title: 'Diagnóstico · Situación',
      lines: ['¿A qué te dedicas hoy y cómo lo estás haciendo?', 'Números actuales (facturación, llamadas, cierres…).', '¿Qué has probado ya y qué pasó?'],
      tips: ['Escucha 80 / habla 20. Preguntas abiertas.', 'Anota literal sus palabras para devolvérselas.'],
    },
    {
      id: 'dolor', title: 'Diagnóstico · Dolor',
      lines: ['¿Qué es lo que más te frena ahora mismo?', '¿Qué te está costando eso (dinero / tiempo / cabeza)?', '¿Y si sigue así 6-12 meses?'],
      tips: ['Cuantifica el dolor en €. Profundiza: "¿y eso qué te cuesta?"', 'No rescates: deja que sienta el coste de no actuar.'],
    },
    {
      id: 'objetivo', title: 'Objetivo y por qué ahora',
      lines: ['¿Dónde quieres estar en 6-12 meses?', '¿Por qué ahora y no hace un año?', '¿Qué cambia en tu vida si lo consigues?'],
      tips: ['Ancla la urgencia REAL (la suya, no la tuya).'],
    },
    {
      id: 'puente', title: 'Puente · Mecanismo y autoridad',
      lines: ['Conecta su dolor → su objetivo con tu mecanismo.', 'Caso de éxito de alguien como él (1 frase, concreto).', '"Lo que te falta no es X, es Y — y eso es justo lo que hacemos."'],
      tips: ['Vende el mecanismo único, no el esfuerzo.'],
    },
    {
      id: 'oferta', title: 'Oferta',
      lines: ['Presenta la oferta encuadrada en SU resultado.', 'Qué incluye (3-4 bullets máx, orientados a resultado).', 'Confirma encaje: "¿esto resolvería lo que me has dicho?"'],
      tips: ['Vende el resultado, no las features.', 'Confirma micro-síes antes del precio.'],
    },
    {
      id: 'precio', title: 'Precio',
      lines: ['Ancla valor: lo que gana / deja de perder.', 'Da el precio claro, sin disculparte.', 'Calla. El primero que habla, pierde.'],
      tips: ['Silencio tras el número. No lo llenes tú.', 'Tono firme y tranquilo: el precio es el precio.'],
    },
    {
      id: 'cierre', title: 'Cierre',
      lines: ['Cierre asumido: "¿lo arrancamos hoy?"', 'Si duda: "¿qué te falta para decir que sí?"', 'Concreta pago / siguiente paso AHORA.'],
      tips: ['El primer "no" es una objeción, no un final.', 'No reabras la venta: cierra el detalle logístico.'],
    },
  ],
  objections: [
    { trigger: '"Me lo tengo que pensar"', response: '"Claro. ¿Qué tienes que pensar exactamente — el dinero, el tiempo o si te va a funcionar?" → aísla la objeción real.' },
    { trigger: '"Es caro / no tengo el dinero"', response: 'Reancla al coste de NO resolverlo. "¿Caro comparado con qué — con seguir como estás?" Opciones de pago solo si ya hay decisión.' },
    { trigger: '"Lo hablo con mi socio/pareja"', response: '"Lo respeto. Si por ti fuera, ¿lo harías?" → si sí, agenda cierre a 3 con el decisor.' },
    { trigger: '"No tengo tiempo ahora"', response: '"Justo por eso. ¿Cuánto tiempo te está costando hacerlo a tu manera?"' },
    { trigger: '"Me da miedo que no funcione"', response: 'Prueba social + mecanismo/garantía. "¿Qué tendría que pasar para que estuvieras tranquilo?"' },
  ],
  tonalities: [
    'Curiosa — preguntas con interés genuino.',
    'Autoridad tranquila — sin prisa, sin necesidad.',
    'Empática — validas antes de redirigir.',
    'Firme — en precio y cierre, sin titubear.',
    'Asumida — das por hecho el siguiente paso.',
  ],
}

export const RESULTS = [
  { key: 'won', label: 'Cerrada' },
  { key: 'deposit', label: 'Depósito' },
  { key: 'follow_up', label: 'Seguimiento' },
  { key: 'not_qualified', label: 'No cualifica' },
  { key: 'lost', label: 'Perdida' },
  { key: 'no_show', label: 'No-show' },
]
export const resultLabel = (k) => RESULTS.find(r => r.key === k)?.label || k
