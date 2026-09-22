// 最小のメインサービス: /<name> を functions/<name> のユーザーワーカーへ転送する
Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.split('/')[1];
  const worker = await EdgeRuntime.userWorkers.create({
    servicePath: `/home/deno/functions/${name}`,
    memoryLimitMb: 150,
    workerTimeoutMs: 60_000,
    noModuleCache: false,
    importMapPath: null,
    envVars: Object.entries(Deno.env.toObject()),
    forceCreate: new URL(req.url).searchParams.get("fresh") === "1",
    cpuTimeSoftLimitMs: 10_000,
    cpuTimeHardLimitMs: 20_000,
  });
  return await worker.fetch(req);
});
