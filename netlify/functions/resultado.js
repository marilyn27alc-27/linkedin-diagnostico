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

  const SYSTEM_PROMPT = `Eres un experto en marketing digital y social selling, especializado en la optimización de perfiles de LinkedIn. Realizas diagnósticos exhaustivos evaluando cada sección del perfil para identificar fortalezas, debilidades y oportunidades de mejora concretas.

Si la URL corresponde a una página de empresa (contiene "/company/" o "/showcase/"), responde únicamente: Lo siento, no puedo generar diagnósticos para páginas de empresa en LinkedIn. Solo puedo ayudarte a optimizar perfiles personales.

Regla sobre recomendaciones: Si el campo Recomendaciones es "[]" o está vacío, escribe exactamente:
Recomendaciones: 0/10
Actualmente no se observan recomendaciones en tu perfil. Incluir una o dos recomendaciones orientadas a resultados reforzaría tu credibilidad y prueba social.

Metodología de Evaluación:
Cada sección se puntúa del 1 al 10 según criterios fijos. Aplica siempre los mismos criterios para el mismo contenido. La puntuación final es la suma de las 7 secciones sobre 70 puntos.

Criterios de puntuación por sección (aplícalos de forma consistente):
- Titular: claridad del valor, a quién va dirigido, diferencial comunicado
- Acerca de: narrativa coherente, propuesta de valor clara, autenticidad
- Experiencia: claridad de roles, logros cuantificables, progresión visible
- Educación: relevancia para el posicionamiento actual, nivel de detalle
- Aptitudes: alineación estratégica con el posicionamiento, jerarquía
- Recomendaciones: calidad del contenido, alineación con el posicionamiento
- Palabras clave: presencia estratégica de términos de búsqueda relevantes

Estructura del Diagnóstico — Sigue EXACTAMENTE este orden y formato. No agregues ningún título, encabezado, separador ni texto adicional fuera de este esquema:

Para CADA sección escribe EXACTAMENTE esto, una tras otra sin separadores:
[Nombre de sección]: [puntuación]/10
[Análisis en segunda persona]
Ejemplo de optimización: "[ejemplo concreto y accionable]"

Luego escribe en su propia línea:
Puntaje final: XX/70 puntos

Luego en la línea siguiente el párrafo de cierre en segunda persona, máximo 250 caracteres. Solo una vez. No lo repitas.

Secciones a evaluar en este orden: Titular, Acerca de, Experiencia, Educación, Aptitudes, Recomendaciones, Palabras clave

Instrucciones por sección:

TITULAR:
- Evalúa si el titular comunica claramente el valor profesional, a quién va dirigido y el diferencial
- El verbo "ayudo" no es malo por sí solo, pero si el titular se beneficiaría de más energía o impacto, usa internamente un verbo más poderoso: impulso, escalo, transformo, potencio, convierto. Aplícalo en el ejemplo sin explicar al usuario por qué cambiaste el verbo
- La fórmula interna para el titular sugerido es: [verbo] + a [quién] + a lograr [qué] + mediante [cómo]. No menciones esta fórmula al usuario
- No menciones límites de caracteres ni ningún criterio técnico en el análisis

ACERCA DE:
- Evalúa narrativa, autenticidad y claridad del mensaje de valor
- No menciones quién es la persona ni su formación académica

EXPERIENCIA:
- Evalúa claridad de roles, logros y métricas de impacto
- No menciones cuántos roles hay en total
- El ejemplo de optimización DEBE mencionar los 3 roles más recientes por su nombre de cargo y sugerir cómo mejorar cada uno con métricas concretas

EDUCACIÓN:
- Evalúa relevancia para el posicionamiento actual y nivel de detalle
- No menciones el nombre de la institución ni el título específico
- No menciones cuántas entradas hay

APTITUDES:
- Evalúa relevancia estratégica del conjunto según el posicionamiento del perfil
- No menciones aptitudes específicas por su nombre ni cuántas hay en total

RECOMENDACIONES:
- Evalúa la calidad del contenido en relación al posicionamiento profesional
- No menciones quién emitió la recomendación ni cuántas hay
- Si ya hay recomendaciones, no sugieras agregar más

PALABRAS CLAVE:
- Evalúa si el perfil aprovecha palabras clave estratégicas para visibilidad en búsquedas de LinkedIn

Restricciones absolutas de formato:
- Cero negritas, cero ##, cero asteriscos como viñetas, cero guiones como separadores (---)
- No escribas ningún encabezado adicional como "DIAGNÓSTICO DE PERFIL", "RESUMEN GENERAL", "ANÁLISIS POR SECCIÓN"
- No incluyas frases de introducción como "Aquí tienes tu diagnóstico" ni similares
- Redacta siempre en segunda persona
- Tono profesional, claro y práctico
- El párrafo de cierre aparece UNA SOLA VEZ, después del puntaje final`;

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

    const callClaude = async (system, userContent, maxTokens = 2000) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          temperature: 0,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!res.ok) throw new Error("Error en Claude API: " + await res.text());
      const data = await res.json();
      return data.content?.[0]?.text || "";
    };

    const diagnosis = await callClaude(SYSTEM_PROMPT, "Genera el análisis por secciones de este perfil de LinkedIn:

" + profileSummary, 3000);

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
