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

  const SYSTEM_PROMPT = `Eres un experto en marketing digital y social selling, especializado en la optimización de perfiles de LinkedIn. Tu tarea es realizar diagnósticos exhaustivos evaluando cada sección para identificar fortalezas, debilidades y oportunidades de mejora.

Si la URL corresponde a una página de empresa (contiene "/company/" o "/showcase/"), responde únicamente: Lo siento, no puedo generar diagnósticos para páginas de empresa en LinkedIn. Solo puedo ayudarte a optimizar perfiles personales.

Regla sobre recomendaciones: Si el campo Recomendaciones es "[]" o está vacío, escribe exactamente:
Recomendaciones: 0/10
Actualmente no se observan recomendaciones en tu perfil. Incluir una o dos recomendaciones orientadas a resultados reforzaría tu credibilidad y prueba social.

Metodología de Evaluación:
Cada sección se puntúa del 1 al 10. La puntuación final es sobre 70 puntos (7 secciones × 10 puntos).

Estructura del Diagnóstico — Sigue EXACTAMENTE este orden y formato. No agregues ningún título, encabezado, separador ni texto adicional fuera de este esquema:

Primero escribe directamente el resumen general en segunda persona (máximo 3 párrafos). Sin ningún encabezado antes, sin "RESUMEN GENERAL", sin guiones. Solo los párrafos. El resumen no debe mencionar secciones específicas del perfil.

Luego para CADA sección escribe EXACTAMENTE esto (sin separadores entre secciones):
[Nombre de sección]: [puntuación]/10
[Análisis en segunda persona]
Ejemplo de optimización: "[ejemplo concreto y accionable]"

Luego escribe:
Puntaje final: XX/70 puntos

Luego el párrafo de cierre en segunda persona, máximo 250 caracteres.

Secciones a evaluar en este orden: Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave

Instrucciones por sección:

TITULAR:
- Evalúa si comunica claramente el valor profesional y a quién va dirigido
- Si propones un titular mejorado, usa internamente esta estructura: [verbo de impacto] + a [quién] + a lograr [qué] + mediante [cómo]. Usa verbos como impulso, escalo, transformo, potencio. Nunca uses "ayudo"
- No menciones límites de caracteres ni criterios técnicos en el texto del diagnóstico

ACERCA DE:
- Evalúa narrativa, autenticidad y claridad del mensaje
- No menciones quién es la persona ni su formación académica

EXPERIENCIA:
- El campo "cargo" contiene el título del rol en cada experiencia. No digas que los títulos están vacíos si ese campo tiene contenido
- Evalúa claridad de roles, logros y métricas de impacto
- El ejemplo de optimización DEBE basarse en las 3 experiencias más recientes

EDUCACIÓN:
- Evalúa relevancia y nivel de detalle
- No menciones el nombre de la institución ni el título específico

APTITUDES:
- Evalúa relevancia estratégica según el rol profesional
- No menciones aptitudes específicas ni cuántas hay

RECOMENDACIONES:
- Evalúa contenido en relación al posicionamiento profesional
- No menciones quién emitió la recomendación
- Si ya hay recomendaciones, no sugieras agregar más

PALABRAS CLAVE:
- Evalúa si el perfil aprovecha palabras clave estratégicas para visibilidad en búsquedas

Restricciones absolutas de formato:
- Cero negritas, cero ##, cero asteriscos, cero guiones como separadores (---)
- No escribas "DIAGNÓSTICO DE PERFIL", "RESUMEN GENERAL", "ANÁLISIS POR SECCIÓN" ni ningún encabezado extra
- No incluyas frases de introducción como "Aquí tienes tu diagnóstico"
- Redacta siempre en segunda persona
- Tono profesional, claro y práctico`;

  // Mapeo correcto según el JSON real de Apify harvestapi~linkedin-profile-scraper
  function resumeExperience(list, max = 5) {
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.slice(0, max).map((e) => ({
      cargo: e.position || e.title || e.jobTitle || "No especificado",
      empresa: e.companyName || e.company || "",
      duracion: e.duration || "",
      descripcion: (e.description || e.summary || "").slice(0, 400),
    }));
  }

  function resumeEducation(list, max = 3) {
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.slice(0, max).map((e) => ({
      titulo: e.degree || e.fieldOfStudy || e.degreeName || "",
      institucion: e.schoolName || e.school || "",
      periodo: e.period || "",
    }));
  }

  function resumeSkills(list, max = 20) {
    if (!Array.isArray(list) || list.length === 0) return "No disponible";
    return list.slice(0, max).map((s) => s.name || s.skill || s).filter(Boolean).join(", ");
  }

  function resumeRecommendations(profile, max = 4) {
    const list =
      profile.receivedRecommendations ||
      profile.recommendationsReceived ||
      profile.recommendations ||
      [];
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.slice(0, max).map((r) => ({
      texto: (r.description || r.text || r.recommendation || r.recommendationText || "").slice(0, 500),
    })).filter((r) => r.texto.length > 0);
  }

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
      ? `${profile.firstName} ${profile.lastName}`
      : profile.fullName || profile.name || "No disponible";

    const experienciaRaw = profile.experience || profile.positions || [];
    const educacionRaw = profile.education || profile.educations || [];
    const aptitudesRaw = profile.skills || [];
    const recomendacionesData = resumeRecommendations(profile);

    const profileSummary = `
Nombre: ${fullName}
Titular: ${(profile.headline || "No disponible").slice(0, 300)}
Seguidores: ${profile.followerCount || profile.followersCount || "No disponible"}
Conexiones: ${profile.connectionsCount || profile.connections || "No disponible"}
Acerca de: ${(profile.about || profile.summary || "No disponible").slice(0, 2000)}
Experiencia: ${JSON.stringify(resumeExperience(experienciaRaw))}
Educacion: ${JSON.stringify(resumeEducation(educacionRaw))}
Aptitudes: ${resumeSkills(aptitudesRaw)}
Recomendaciones: ${recomendacionesData.length > 0 ? JSON.stringify(recomendacionesData) : "[]"}
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
        messages: [{
          role: "user",
          content: "Genera el diagnostico completo de este perfil de LinkedIn:\n\n" + profileSummary
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error("Error en Claude API: " + errText);
    }

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
