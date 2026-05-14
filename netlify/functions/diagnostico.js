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

⚠️ Restricción técnica adicional:
Si la URL proporcionada corresponde a una página de empresa o página de productos (por ejemplo, contiene "/company/" o "/showcase/"), no debes generar un diagnóstico. En su lugar, responde de forma automática y directa con el siguiente mensaje:
Lo siento, no puedo generar diagnósticos para páginas de empresa en LinkedIn. Solo puedo ayudarte a optimizar perfiles personales.

Objetivo del Diagnóstico:
Optimizar la visibilidad, credibilidad y efectividad del perfil en LinkedIn, alineándolo con buenas prácticas y estrategias avanzadas de personal branding y posicionamiento en la plataforma.

Importante:
Por limitaciones técnicas de la herramienta que recopila la información del perfil de LinkedIn, solo se te proporcionará una sola entrada visible por sección en los casos de: Educación, Aptitudes, Recomendaciones. Esto no significa que el perfil contenga únicamente esa entrada. Debes considerar cada dato como una referencia representativa, y no penalizar la puntuación ni la evaluación con base en la cantidad de entradas visibles.

Regla dura — Recomendaciones sin datos: La sección "Recomendaciones" se considera AUSENTE si el campo no existe o su valor es Empty. Cuando esté ausente: Recomendaciones: 0/10. Actualmente no se observan recomendaciones en tu perfil. Incluir una o dos recomendaciones orientadas a resultados reforzaría tu credibilidad y prueba social.

Metodología de Evaluación:
Cada sección se puntúa en una escala del 1 al 10. La puntuación final se calcula sobre 60 puntos.

Estructura del Diagnóstico:
▸ Nombre completo de la persona
▸ Número de seguidores
▸ Número de contactos
▸ Resumen general en segunda persona
▸ Sección por sección: [Nombre: puntuación/10] + análisis + ejemplo de optimización
▸ Puntaje final sobre 60 puntos
▸ Párrafo final de cierre, máximo 250 caracteres

Secciones a evaluar: Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave.

Restricciones de Estilo: No usar negritas ni ## ni asteriscos como viñetas. No mencionar reclutadores. Redactar siempre en segunda persona. Tono profesional, claro y práctico.`;

  try {
    const { linkedinUrl } = JSON.parse(event.body);

    // 1. Iniciar actor de Apify
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrls: [linkedinUrl],
      }
    );

    if (!runRes.ok) throw new Error("Error al iniciar Apify: " + await runRes.text());

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error("No se recibió ID de ejecución.");

    // 2. Polling hasta que termine
    let succeeded = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const statusData = await statusRes.json();
      const status = statusData.data?.status;
      if (status === "SUCCEEDED") { succeeded = true; break; }
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
    }

    if (!succeeded) throw new Error("El scraping no pudo completarse.");

    // 3. Obtener datos
    const itemsRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
    );
    const items = await itemsRes.json();
    const profile = items[0];
    if (!profile) throw new Error("No se encontraron datos del perfil.");

    const profileSummary = `
Nombre: ${profile.fullName || profile.name || "No disponible"}
Titular: ${profile.headline || "No disponible"}
Seguidores: ${profile.followersCount || profile.followers || "No disponible"}
Conexiones: ${profile.connectionsCount || profile.connections || "No disponible"}
Acerca de: ${profile.summary || profile.about || "No disponible"}
Experiencia: ${JSON.stringify(profile.positions || profile.experience || [])}
Educación: ${JSON.stringify(profile.educations || profile.education || [])}
Aptitudes: ${JSON.stringify(profile.skills || [])}
Recomendaciones: ${JSON.stringify(profile.recommendations || [])}
    `.trim();

    // 4. Llamar a Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: "Genera el diagnóstico completo de este perfil de LinkedIn:\n\n" + profileSummary,
          },
        ],
      }),
    });

    if (!claudeRes.ok) throw new Error("Error en Claude API: " + await claudeRes.text());

    const claudeData = await claudeRes.json();
    const diagnosis = claudeData.content?.[0]?.text || "No se pudo generar el diagnóstico.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        name: profile.fullName || profile.name || "Perfil",
        followers: profile.followersCount || profile.followers || "—",
        connections: profile.connectionsCount || profile.connections || "—",
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
