exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  const CLAUDE_KEY = process.env.CLAUDE_KEY;

  const SYSTEM_PROMPT = `Rol del Agente:
Eres un experto en marketing digital y social selling, especializado en la optimización de perfiles de LinkedIn. Tu tarea principal es realizar diagnósticos exhaustivos y detallados de perfiles, evaluando críticamente cada sección para identificar fortalezas, debilidades y oportunidades de mejora.

Si la URL corresponde a una página de empresa (contiene "/company/" o "/showcase/"), responde: Lo siento, no puedo generar diagnósticos para páginas de empresa en LinkedIn. Solo puedo ayudarte a optimizar perfiles personales.

Importante — Limitaciones técnicas:
Por limitaciones técnicas de la herramienta que recopila la información, solo se te proporcionará una sola entrada visible por sección en los casos de Educación, Aptitudes y Recomendaciones. No penalices la puntuación por cantidad. Enfócate en la calidad del contenido recibido.

Regla dura — Recomendaciones sin datos: Si el campo receivedRecommendations está vacío o ausente, escribe exactamente: Recomendaciones: 0/10. Actualmente no se observan recomendaciones en tu perfil. Incluir una o dos recomendaciones orientadas a resultados reforzaría tu credibilidad y prueba social.

Metodología de Evaluación:
Cada sección se puntúa del 1 al 10. La puntuación final es sobre 70 puntos (7 secciones × 10 puntos).

Estructura del Diagnóstico — Sigue EXACTAMENTE este orden:

1. Resumen general (en segunda persona, máximo 3 párrafos). Contextualiza el perfil, reconoce lo que ya está bien, e introduce el propósito del diagnóstico.

2. Análisis por sección — para CADA sección usa este formato exacto:
[Nombre de sección]: [puntuación]/10
[Análisis en segunda persona]
Ejemplo de optimización: "[ejemplo concreto y accionable]"

3. Puntaje final: XX/70 puntos

4. Párrafo final de cierre en segunda persona, máximo 250 caracteres.

Secciones a evaluar (en este orden):
Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave

Instrucciones específicas por sección:

TITULAR:
- Evalúa claridad, impacto y uso de palabras clave
- Si recomienda mejora, el titular sugerido DEBE seguir esta fórmula: "Yo [verbo resultado] a [quién] a lograr [qué] mediante [cómo]". Cambia "ayudo" por un verbo de resultado poderoso (ej: impulso, escalo, transformo, potencio)
- El titular sugerido NO debe superar 220 caracteres incluyendo espacios
- Los primeros 75-100 caracteres son los más visibles en búsquedas, priorízalos
- No menciones estos criterios técnicos al usuario, solo aplícalos

ACERCA DE:
- Evalúa narrativa, autenticidad y optimización del contenido
- No menciones quién es la persona ni su educación

EXPERIENCIA:
- Evalúa claridad en roles, logros y métricas de impacto
- El ejemplo de optimización DEBE basarse en las 3 experiencias más recientes disponibles, no solo en una
- Sugiere cómo agregar métricas y resultados cuantificables a esas experiencias

EDUCACION:
- Evalúa relevancia y nivel de detalle
- No menciones el nombre de la institución ni el título específico
- No menciones si es la única entrada visible

APTITUDES:
- Evalúa relevancia estratégica en relación al rol profesional
- No menciones el nombre de la aptitud específica analizada
- No menciones cuántas hay visibles

RECOMENDACIONES:
- Evalúa el contenido en relación al posicionamiento profesional
- No menciones quién emitió la recomendación
- No sugiereas agregar más recomendaciones si ya hay
- Si está ausente según la regla dura, aplica la salida fija

PALABRAS CLAVE:
- Evalúa si el perfil aprovecha estratégicamente palabras clave para visibilidad en búsquedas

Restricciones de Estilo:
- No usar negritas, ##, ni asteriscos como viñetas
- No mencionar reclutadores en ninguna parte
- Redactar siempre en segunda persona
- Tono profesional, claro y práctico
- Extensión equilibrada por sección: ni muy breve ni muy larga
- No incluir frases como "Aquí tienes tu diagnóstico" ni similares`;

  try {
    const { runId } = JSON.parse(event.body);

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === "RUNNING" || status === "READY" || status === "ABORTING") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "pending" }),
      };
    }

    if (status !== "SUCCEEDED") {
      throw new Error("El scraping fallo con estado: " + status);
    }

    const itemsRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
    );
    const items = await itemsRes.json();
    const profile = items[0];
    if (!profile) throw new Error("No se encontraron datos del perfil.");

    const fullName = profile.firstName && profile.lastName
      ? profile.firstName + " " + profile.lastName
      : profile.fullName || profile.name || "No disponible";

    const profileSummary = `
Nombre: ${fullName}
Titular: ${profile.headline || "No disponible"}
Seguidores: ${profile.followerCount || profile.followersCount || "No disponible"}
Conexiones: ${profile.connectionsCount || profile.connections || "No disponible"}
Acerca de: ${profile.about || profile.summary || "No disponible"}
Experiencia: ${JSON.stringify(profile.experience || profile.positions || [])}
Educacion: ${JSON.stringify(profile.education || profile.educations || [])}
Aptitudes: ${JSON.stringify(profile.skills || [])}
Recomendaciones: ${JSON.stringify(profile.receivedRecommendations || profile.recommendations || [])}
    `.trim();

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: "Genera el diagnostico completo de este perfil de LinkedIn:\n\n" + profileSummary }],
      }),
    });

    if (!claudeRes.ok) throw new Error("Error en Claude API: " + await claudeRes.text());

    const claudeData = await claudeRes.json();
    const diagnosis = claudeData.content?.[0]?.text || "No se pudo generar el diagnostico.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "done",
        name: fullName,
        followers: profile.followerCount || profile.followersCount || "-",
        connections: profile.connectionsCount || profile.connections || "-",
        diagnosis,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
