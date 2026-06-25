const url = process.env.CRON_TARGET_URL;
const secret = process.env.CRON_SECRET;

if (!url || !secret) {
  console.error("CRON_TARGET_URL ou CRON_SECRET não configurado.");
  process.exit(1);
}

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
    signal: AbortSignal.timeout(120000),
  });

  const body = await response.text();

  console.log(`HTTP ${response.status}`);
  console.log(body);

  if (!response.ok) {
    process.exit(1);
  }

  console.log("Ciclo diário de cobrança concluído com sucesso.");
} catch (error) {
  console.error("Falha ao executar o ciclo diário de cobrança:", error);
  process.exit(1);
}
