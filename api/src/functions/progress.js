const { app } = require('@azure/functions');
const { getTable, principalFrom, json } = require('../shared/store');

/**
 * /api/progress
 *   GET  -> résultats du collaborateur connecté
 *   POST -> enregistre un résultat de quiz (meilleur score conservé)
 *
 * Minimisation : uniquement moduleId, score, passed, dates, tentatives.
 * Aucune réponse individuelle, aucun temps passé, aucune IP, aucun terminal.
 */
app.http('progress', {
  route: 'progress',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous', // filtré par staticwebapp.config.json (rôle authenticated)
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) return json(401, { error: 'Non authentifié' });

    const table = await getTable();
    const pk = principal.userId;

    if (request.method === 'GET') {
      const rows = [];
      const iter = table.listEntities({
        queryOptions: { filter: `PartitionKey eq '${pk.replace(/'/g, "''")}'` }
      });
      for await (const e of iter) {
        rows.push({ moduleId: e.rowKey, score: e.score, passed: e.passed, completedAt: e.completedAt, attempts: e.attempts || 1 });
      }
      return json(200, rows);
    }

    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: 'Corps JSON invalide' }); }

    const moduleId = String(body.moduleId || '').trim();
    const score = Number(body.score);
    if (!moduleId || !/^[a-z0-9-]{3,64}$/i.test(moduleId)) return json(400, { error: 'moduleId invalide' });
    if (!Number.isFinite(score) || score < 0 || score > 100) return json(400, { error: 'score invalide' });

    let previous = null;
    try { previous = await table.getEntity(pk, moduleId); } catch { /* première tentative */ }

    const attempts = previous ? (previous.attempts || 1) + 1 : 1;
    const keepPrevious = previous && previous.score >= score;

    const entity = {
      partitionKey: pk,
      rowKey: moduleId,
      userName: principal.userDetails,
      score: keepPrevious ? previous.score : Math.round(score),
      passed: keepPrevious ? previous.passed : !!body.passed,
      completedAt: keepPrevious ? previous.completedAt : new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      attempts
    };

    await table.upsertEntity(entity, 'Replace');
    context.log(`progress upsert user=${pk} module=${moduleId} score=${entity.score} attempt=${attempts}`);

    return json(200, { moduleId, score: entity.score, passed: entity.passed, completedAt: entity.completedAt, attempts });
  }
});
