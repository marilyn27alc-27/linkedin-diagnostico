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

Regla dura — Recomendaciones sin datos: La sección "Recomendaciones" se considera AUSENTE si el campo no existe o su valor es Empty. Cuando esté ausente: Recomendaciones: 0/10.

Metodología de Evaluación:
Cada sección se puntúa en una escala del 1 al 10. La puntuación final se calcula sobre 60 puntos.

Secciones a evaluar: Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave.

Restricciones de Estilo: No usar negritas ni ## ni asteriscos como viñetas. No mencionar reclutadores. Redactar siempre en segunda persona. Tono profesional, claro y práctico.`;

  try {
    const { linkedinUrl } = JSON.parse(event.body);

    const runRes = await fetch(
      `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: [linkedinUrl], profileScraperMode: "Profile details no email ($4 per 1k)" }),
      }
    );

    if (!runRes.ok) throw new Error("Error al iniciar Apify: " + await runRes.text());

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error("No se recibio ID de ejecucion.");

    let succeeded = false;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      const status = statusData.data?.status;
      if (status === "SUCCEEDED") { succeeded = true; break; }
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
    }

    if (!succeeded) throw new Error("El scraping no pudo completarse.");

    const itemsRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`);
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
