// Caché en memoria para evitar llamar a Claude múltiples veces por el mismo runId
const resultadoCache = {};

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

Metodología de Evaluación:
Cada sección se puntúa del 1 al 10 según criterios fijos. Aplica siempre los mismos criterios para el mismo contenido. La puntuación final es la suma de las 8 secciones sobre 80 puntos.

Criterios de puntuación por sección (aplícalos de forma consistente):
- Foto de perfil: calidad visual, profesionalismo, coherencia con la marca personal
- Banner: diseño, mensaje visual, coherencia con el posicionamiento profesional
- Titular: claridad del valor, a quién va dirigido, diferencial comunicado
- Acerca de: narrativa coherente, propuesta de valor clara, autenticidad
- Experiencia: claridad de roles, logros cuantificables, progresión visible
- Educación: relevancia para el posicionamiento actual, nivel de detalle
- Aptitudes: alineación estratégica con el posicionamiento, jerarquía
- Palabras clave: presencia estratégica de términos de búsqueda relevantes

Estructura del Diagnóstico — Sigue EXACTAMENTE este orden y formato. No agregues ningún título, encabezado, separador ni texto adicional fuera de este esquema:

Para CADA sección escribe EXACTAMENTE esto, una tras otra sin separadores:
[Nombre de sección]: [puntuación]/10
[Análisis en segunda persona]
Ejemplo de optimización: "[ejemplo concreto y accionable]"

Una vez escritas las 8 secciones (Foto de perfil, Banner, Titular, Acerca de, Experiencia, Educación, Aptitudes, Palabras clave), escribe en una línea nueva:
Puntaje final: XX/60 puntos

Inmediatamente después, en la siguiente línea, escribe el párrafo de cierre en segunda persona (máximo 250 caracteres). Una sola vez. No lo repitas dentro de ninguna sección.

Secciones a evaluar en este orden: Foto de perfil, Banner, Titular, Acerca de, Experiencia, Educación, Aptitudes, Palabras clave

Instrucciones por sección:

TITULAR:
- Evalúa si el titular comunica claramente el valor profesional, a quién va dirigido y el diferencial
- El verbo "ayudo" no es malo por sí solo, pero si el titular se beneficiaría de más energía o impacto, usa internamente un verbo más poderoso: impulso, escalo, transformo, potencio, convierto. Aplícalo en el ejemplo sin explicar al usuario por qué cambiaste el verbo
- La fórmula interna para el titular sugerido es: [verbo] + a [quién] + a lograr [qué] + mediante [cómo]. No menciones esta fórmula al usuario
- No menciones límites de caracteres ni ningún criterio técnico en el análisis

ACERCA DE:
- Analiza desde una perspectiva estratégica de posicionamiento, conexión humana, credibilidad y diferenciación. NO como un resumen de CV
- Evalúa: claridad de la propuesta profesional, diferenciación frente a otros perfiles, autenticidad y cercanía, claridad sobre qué hace y para quién, coherencia con el posicionamiento actual, narrativa y fluidez, equilibrio entre profesionalismo y humanidad, uso de frases genéricas, capacidad de generar confianza e interés
- El objetivo NO es sonar "más profesional" sino más claro, auténtico y relevante para las oportunidades que la persona quiere atraer
- Las recomendaciones deben ayudar a que el texto suene más humano y natural, tenga personalidad, explique claramente qué hace, conecte con problemas reales y genere cercanía sin perder autoridad
- Evita sugerir textos demasiado formales, corporativos, llenos de buzzwords o que parezcan generados automáticamente
- Evita estructuras tipo: "Profesional apasionado por…", "Especialista con amplia experiencia…", "Potencio negocios mediante soluciones innovadoras…"
- Evita CTAs genéricos como: "¿Hablamos?", "Contáctame", "Potenciemos tu negocio"
- NUNCA inventes métricas, clientes, resultados, especialidades ni promesas que no aparezcan en el perfil
- El ejemplo de optimización debe sonar narrativo, humano y conversacional. Debe sentirse como una presentación profesional auténtica, no como un CV. Sigue esta lógica: 1) qué hace y para quién, 2) cómo trabaja o aporta valor, 3) tipo de impacto que busca generar, 4) cierre humano y natural
- No menciones quién es la persona ni su formación académica

EXPERIENCIA:
- Analiza desde una perspectiva estratégica de posicionamiento, credibilidad y autoridad. NO como reclutador tradicional
- REGLA CRÍTICA: NO asumas que dos cargos similares pertenecen a la misma empresa. Analiza el nombre exacto de cada empresa y la estructura antes de cualquier conclusión
- NO analices ni menciones fechas, duración, solapamiento temporal, progresión temporal ni jerarquía temporal de los cargos
- Enfócate en las 2 a 3 experiencias más recientes. Menciona patrones generales del resto sin profundizar individualmente
- Evalúa: claridad de la descripción de cada rol, responsabilidades principales, nivel de detalle, presencia de logros, coherencia con el posicionamiento actual, diferenciación profesional entre cargos, nivel de autoridad, uso estratégico de descripciones, percepción de especialización
- NUNCA inventes métricas, resultados, clientes o logros. En lugar de números inventados, explica qué tipo de información sería valioso agregar. Ejemplo correcto: "Podrías fortalecer esta experiencia incluyendo resultados concretos del impacto de tu trabajo, como crecimiento de clientes, alcance de proyectos o mejoras operativas"
- Analiza cómo la experiencia contribuye a generar confianza, construir autoridad, diferenciar el perfil y apoyar objetivos de networking y oportunidades de negocio
- El análisis debe sonar humano, profesional y directo. Evita repetir recomendaciones similares para cada experiencia
- No menciones cuántos roles hay en total

EDUCACIÓN:
- Evalúa relevancia para el posicionamiento actual y nivel de detalle
- No menciones el nombre de la institución ni el título específico
- No menciones cuántas entradas hay

APTITUDES:
- Evalúa relevancia estratégica del conjunto según el posicionamiento del perfil
- No menciones aptitudes específicas por su nombre ni cuántas hay en total

FOTO DE PERFIL:
- Evalúa: calidad y resolución, iluminación y nitidez, encuadre y cercanía del rostro, expresión facial y nivel de confianza/profesionalismo, vestimenta y coherencia con el sector, fondo y distracciones visuales
- Interpreta el impacto estratégico: si genera cercanía, autoridad y credibilidad, y si es coherente con el objetivo profesional del perfil
- No describas solo lo que ves; analiza el impacto estratégico que tiene en la percepción profesional
- Tono esperado: "Tu foto transmite cercanía y profesionalismo, pero la iluminación y el fondo reducen el impacto visual. Una imagen con mejor contraste y un encuadre más cercano podría aumentar la percepción de autoridad y confianza."
- Si no hay foto o no se puede analizar, indícalo claramente

BANNER:
- Evalúa: calidad visual y diseño, claridad del mensaje, si comunica qué hace la persona o cómo aporta valor, uso estratégico del espacio, jerarquía visual, legibilidad del texto, coherencia con la marca personal, uso de colores y elementos gráficos
- Interpreta si el banner ayuda al posicionamiento o pasa desapercibido, y si complementa el titular y la propuesta de valor
- No describas solo lo que ves; analiza el impacto estratégico
- Tono esperado: "El banner tiene buena intención visual, pero actualmente funciona más como decoración que como herramienta estratégica. Podrías incluir una propuesta de valor clara y elementos que refuercen tu especialidad."
- Si no hay banner o no se puede analizar, indícalo claramente

Reglas para foto y banner:
- Evita comentarios genéricos y halagos vacíos
- Prioriza recomendaciones concretas y accionables
- Enfócate en visibilidad, credibilidad, diferenciación y percepción profesional
- Tono profesional, directo y constructivo

PALABRAS CLAVE:
- Evalúa si el perfil aprovecha palabras clave estratégicas para visibilidad en búsquedas de LinkedIn
- IMPORTANTE: después del análisis de Palabras clave escribe ÚNICAMENTE el ejemplo de optimización. NO escribas "Puntaje final" aquí. El puntaje final va en una línea separada DESPUÉS de todas las secciones.

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
    let finalList = [];
    const knownFields = [
      'receivedRecommendations','recommendationsReceived','recommendations',
      'receivedRecs','recommendationsData',
    ];
    for (const field of knownFields) {
      if (Array.isArray(profile[field]) && profile[field].length > 0) {
        finalList = profile[field]; break;
      }
    }
    if (finalList.length === 0) {
      for (const key of Object.keys(profile)) {
        const lk = key.toLowerCase();
        if (lk.includes('recommend') && !lk.includes('given') && !lk.includes('count') && !lk.includes('num')) {
          if (Array.isArray(profile[key]) && profile[key].length > 0) {
            finalList = profile[key]; break;
          }
        }
      }
    }
    if (finalList.length === 0) return [];
    return finalList.slice(0, max).map((r) => ({
      texto: (r.description || r.text || r.recommendation || r.recommendationText || r.body || r.content || '').slice(0, 500),
    })).filter((r) => r.texto.length > 5);
  }

  try {
    const { runId } = JSON.parse(event.body);

    // Verificar caché primero
    if (resultadoCache[runId]) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(resultadoCache[runId]),
      };
    }

    // El frontend ya verificó que Apify terminó — solo descargamos los datos
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

    // Obtener URLs de foto y banner
    const photoUrl = profile.photo || profile.profilePicture?.url || null;
    const bannerUrl = profile.coverPicture?.url || null;

    // Construir el mensaje con texto e imágenes para Claude
    const userMessage = [];

    // Texto principal
    userMessage.push({
      type: "text",
      text: "Analiza visualmente la foto de perfil y el banner de LinkedIn que te comparto, y luego genera el análisis completo por secciones de este perfil:\n\n" + profileSummary
    });

    // Agregar foto si existe
    if (photoUrl) {
      userMessage.push({ type: "text", text: "\nFoto de perfil:" });
      userMessage.push({ type: "image", source: { type: "url", url: photoUrl } });
    } else {
      userMessage.push({ type: "text", text: "\nFoto de perfil: No disponible" });
    }

    // Agregar banner si existe
    if (bannerUrl) {
      userMessage.push({ type: "text", text: "\nBanner:" });
      userMessage.push({ type: "image", source: { type: "url", url: bannerUrl } });
    } else {
      userMessage.push({ type: "text", text: "\nBanner: No disponible" });
    }

    const diagnosis = await callClaude(SYSTEM_PROMPT, userMessage, 3500);

    const resultado = {
      status: "done",
      name: fullName,
      followers: profile.followerCount || profile.followersCount || "-",
      connections: profile.connectionsCount || profile.connections || "-",
      diagnosis,
    };

    // Guardar en caché para que polls posteriores no llamen a Claude de nuevo
    resultadoCache[runId] = resultado;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(resultado),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
