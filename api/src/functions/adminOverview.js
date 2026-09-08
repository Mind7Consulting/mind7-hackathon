const { app } = require('@azure/functions');
const { getTable, getQuizTable, principalFrom, isAdmin, json } = require('../shared/store');

/**
 * /api/admin/overview — vue consolidée pour l'administration.
 * Double contrôle : règle de route (staticwebapp.config.json) + vérification du rôle ici.
 */
app.http('adminOverview', {
  route: 'admin/overview',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) return json(401, { error: 'Non authentifié' });
    if (!isAdmin(principal)) {
      context.log(`refus admin/overview pour ${principal.userDetails}`);
      return json(403, { error: 'Accès réservé aux administrateurs' });
    }

    const table = await getTable();
    const byUser = new Map();

    for await (const e of table.listEntities()) {
      const key = e.partitionKey;
      if (!byUser.has(key)) byUser.set(key, { userId: key, name: e.userName || key, results: [] });
      const u = byUser.get(key);
      if (e.userName) u.name = e.userName;
      u.results.push({ moduleId: e.rowKey, score: e.score, passed: e.passed, completedAt: e.completedAt, attempts: e.attempts || 1 });
    }

    const quizTable = await getQuizTable();
    for await (const e of quizTable.listEntities()) {
      const key = e.partitionKey;
      if (!byUser.has(key)) byUser.set(key, { userId: key, name: e.userName || key, results: [], quizResults: [] });
      const u = byUser.get(key);
      if (e.userName) u.name = e.userName;
      if (!u.quizResults) u.quizResults = [];
      u.quizResults.push({ quizId: e.quizId || e.rowKey.replace(/^quiz:/, ''), score: e.score, total: e.total, passed: e.passed, completedAt: e.completedAt, attempts: e.attempts || 1 });
    }

    for (const user of byUser.values()) user.quizResults = user.quizResults || [];

    const users = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
    context.log(`admin/overview consulté par ${principal.userDetails} — ${users.length} collaborateur(s)`);
    return json(200, { users, generatedAt: new Date().toISOString() });
  }
});
