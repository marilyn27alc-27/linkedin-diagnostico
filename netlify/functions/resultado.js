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

Regla dura — Recomendaciones sin datos: Si no hay recomendaciones, escribe exactamente: Recomendaciones: 0/10. Actualmente no se observan recomendaciones en tu perfil.

Metodología: Cada sección se puntúa del 1 al 10. Puntuación final sobre 60 puntos.

Estructura del Diagnóstico:
▸ Nombre completo
▸ Número de seguidores
▸ Número de contactos
▸ Resumen general en segunda persona
▸ Sección por sección: [Nombre: puntuación/10] + análisis + ejemplo de optimización
▸ Puntaje final sobre 60 puntos
▸ Párrafo final de cierre, máximo 250 caracteres

Secciones: Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave.

Restricciones: No usar negritas ni ## ni asteriscos. No mencionar reclutadores. Segunda persona. Tono profesional.`;

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

    const profileSummary = `
Nombre: ${profile.fullName || profile.name || "No disponible"}
Titular: ${profile.headline || "No disponible"}
Seguidores: ${profile.followersCount || profile.followers || "No disponible"}
Conexiones: ${profile.connectionsCount || profile.connections || "No disponible"}
Acerca de: ${profile.summary || profile.about || "No disponible"}
Experiencia: ${JSON.stringify(profile.positions || profile.experience || [])}
Educacion: ${JSON.stringify(profile.educations || profile.education || [])}
Aptitudes: ${JSON.stringify(profile.skills || [])}
Recomendaciones: ${JSON.stringify(profile.recommendations || [])}
    `.trim();

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
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
        name: profile.fullName || profile.name || "Perfil",
        followers: profile.followersCount || profile.followers || "-",
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
