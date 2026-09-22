Deno.serve(async () => { await new Promise((r) => setTimeout(r, 40)); return Response.json({ ok: true }); });
