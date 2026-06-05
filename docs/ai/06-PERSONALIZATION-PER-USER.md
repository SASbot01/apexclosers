# 06 — PERSONALIZATION (por cada nuevo usuario)

> **Regla nº1 del proyecto.** Cada usuario tiene *su* Orbe: su alma (overlay), su memoria,
> su contexto, sus intenciones. Se crea al darse de alta, se aísla por `user_id` y evoluciona
> con el uso. Nada se comparte ni se filtra entre usuarios. Nunca.

## 1. Por qué por-usuario (no un Orbe global)

El vínculo —y por tanto la retención y el boca-oreja entre closers— nace de que el Orbe
**te conoce a ti**: tu producto, tus leads, tu forma de cerrar, tus manías. Un asistente
genérico es reemplazable; uno que lleva 3 meses contigo, no. Es la palanca directa contra
nuestro riesgo nº1 (churn) y el motor del LTV.

## 2. Qué se instancia al crear un usuario `U`

```
signup(U) ⇒
  soul_profiles[U]   ← clona la soul card por defecto (sobre el alma base compartida)
  user_models[U]     ← perfil vacío, se siembra en onboarding
  memories(U)        ← almacén vacío, aislado por RLS
  drives(U)          ← drives por defecto de [04]
  settings(U)        ← idioma/región, preferencias, consentimiento de grabación
```
Todo bajo `user_id = U`. El alma base y las definiciones de tools son compartidas (y
cacheadas); **lo personal es la overlay + memoria + modelo**.

## 3. El User Model (la ficha viva del usuario)

Un registro por usuario que resume lo esencial y se inyecta casi siempre en contexto
([03](./03-CONTEXT.md) capa 4). Se siembra en onboarding y se actualiza con la memoria.

```jsonc
{
  "user_id": "U",
  "name": "Alex",
  "region": "es-ES",
  "business": {
    "what_sells": "programa high-ticket de fitness",
    "ticket": "~1500€",
    "sales_process": "VSL → llamada de admisión → cierre",
    "channels": ["WhatsApp", "Instagram"]
  },
  "style": { "follow_up_channel": "WhatsApp", "tone": "directo", "cadence": "mañanas" },
  "goals": ["subir ratio de cierre", "no perder follow-ups"],
  "stats_snapshot": { "show_rate": 0.78, "close_rate": 0.22 },   // refrescado periódicamente
  "updated_at": "..."
}
```

## 4. Cold-start / onboarding (sembrado)

El primer arranque resuelve el "no sé nada de ti todavía". Onboarding mínimo (no fricción):
1. 4–6 preguntas: qué vendes, ticket, cómo es tu proceso, por dónde haces follow-up, cómo
   quieres que te hable el Orbe.
2. Conectar calendario (para ver llamadas) → el Orbe ya tiene datos vivos desde el minuto 1.
3. Con eso se siembra `user_models[U]` + la soul card (formalidad, idioma regional, etc.).
4. La primera llamada transcrita dispara la primera escritura de memoria → el Orbe empieza a
   "conocerte". (= el momento de activación del PDR: 1ª llamada + 1er follow-up en <24h.)

## 5. Bucle de adaptación (cómo evoluciona *tu* Orbe)

```
cada interacción / llamada ⇒
  extraer hechos      → memoria(U)                ([02])
  detectar preferencias→ actualizar soul card(U)  ([01])
  refrescar negocio   → user_model(U)
  ajustar proactividad→ drives(U) según qué nudges te sirven  ([04])
```
Resultado: a las semanas, el Orbe te habla como te gusta, recuerda tus leads, anticipa tus
follow-ups y conoce tus objeciones típicas. Sin que hayas configurado nada manualmente.

## 6. Cómo instancian los 4 pilares por usuario

| Pilar | Compartido (base) | Por usuario `U` |
|---|---|---|
| SOUL | identidad, valores, voz | soul card (relación, tono, idioma regional) |
| MEMORY | esquema, políticas | todos los hechos (`memories` filtrado por U) |
| CONTEXT | pila, presupuesto | user model + memoria de U en cada ventana |
| INTENTION | catálogo de drives/triggers | qué drives priorizar, qué nudges sirven a U |

## 7. Aislamiento (garantía dura)

- **RLS por `user_id`** en toda tabla (`memories`, `user_models`, `soul_profiles`, `orbe_intents`).
- `user_id` se inyecta **server-side** en cada tool y query (nunca lo decide el modelo).
- Misma disciplina que ya exigimos entre **perfiles de cliente** en Apex (ver memorias de
  aislamiento del proyecto). Una filtración entre usuarios es un **bug crítico P0**.
- Test de no-filtración permanente en evals ([08](./08-EVALS-AND-TELEMETRY.md)).

## 8. Propiedad de los datos del usuario

- **Ver:** el usuario puede inspeccionar qué recuerda el Orbe de él (panel de memoria).
- **Editar/Olvidar:** "olvida esto" borra el registro; puede corregir hechos erróneos.
- **Exportar / Borrar todo:** export JSON + borrado completo (GDPR / confianza).
- **Reset del Orbe:** opción de "empezar de cero" (limpia memoria + overlay, conserva datos
  de producto).

## 9. Continuidad

El Orbe del usuario es el mismo en web, móvil y (si se empaqueta) escritorio: la identidad y
la memoria viven en el backend por `user_id`, no en el dispositivo.

## 10. Multi-tenant (futuro, opcional)

Si una empresa adopta el producto para su equipo: cada miembro = un usuario con su Orbe;
opcionalmente una capa de "memoria de equipo" compartida (políticas, playbooks de la empresa)
**explícitamente marcada como compartida** — nunca por defecto. La memoria personal sigue
siendo privada de cada usuario.
