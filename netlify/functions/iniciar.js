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

  try {
    const { linkedinUrl } = JSON.parse(event.body);

    const runRes = await fetch(
      `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: [linkedinUrl],
          profileScraperMode: "Profile details no email ($4 per 1k)"
        }),
      }
    );

    if (!runRes.ok) throw new Error("Error al iniciar Apify: " + await runRes.text());

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error("No se recibio ID de ejecucion.");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ runId }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
