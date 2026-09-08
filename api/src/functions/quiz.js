const { app } = require('@azure/functions');
const { getQuizTable, principalFrom, isAdmin, json } = require('../shared/store');

const QUIZ_ID = 'situations';
const ROW_KEY = `quiz:${QUIZ_ID}`;

function quizResult(entity) {
  return {
    quizId: entity.quizId || entity.rowKey.replace(/^quiz:/, ''),
    score: entity.score,
    total: entity.total,
    passed: entity.passed,
    attempts: entity.attempts || 1,
    categoryStats: parseCategoryStats(entity.categoryStats),
    completedAt: entity.completedAt,
    lastAttemptAt: entity.lastAttemptAt || entity.completedAt
  };
}

function parseCategoryStats(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

app.http('quiz', {
  route: 'quiz',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) return json(401, { error: 'Non authentifié' });
    const table = await getQuizTable();

    if (request.method === 'GET') {
      let entity;
      try { entity = await table.getEntity(principal.userId, ROW_KEY); }
      catch { return json(200, null); }
      return json(200, {
        ...quizResult(entity)
      });
    }

    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: 'Corps JSON invalide' }); }
    const quizId = String(body.quizId || '').trim();
    const score = Number(body.score);
    const total = Number(body.total);
    const passScore = Number(body.passScore || 75);
    const categoryStats = body.categoryStats && typeof body.categoryStats === 'object' ? body.categoryStats : {};
    if (quizId !== QUIZ_ID || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total || !Number.isFinite(passScore) || passScore < 0 || passScore > 100) {
      return json(400, { error: 'Résultat de quiz invalide' });
    }

    let previous = null;
    try { previous = await table.getEntity(principal.userId, ROW_KEY); } catch { /* première tentative */ }
    const attempts = previous ? (previous.attempts || 1) + 1 : 1;
    const previousRatio = previous ? previous.score / previous.total : -1;
    const currentRatio = score / total;
    const keepPrevious = previous && previousRatio >= currentRatio;
    const mergedStats = parseCategoryStats(previous && previous.categoryStats);
    Object.entries(categoryStats).forEach(([category, current]) => {
      if (!/^[a-z0-9-]{2,40}$/.test(category) || !current || !Number.isInteger(current.answered) || !Number.isInteger(current.correct)) return;
      const old = mergedStats[category] || { answered: 0, correct: 0, errors: 0, lastPracticedAt: null, lastErrorAt: null };
      mergedStats[category] = {
        answered: old.answered + current.answered,
        correct: old.correct + current.correct,
        errors: old.errors + Math.max(0, current.answered - current.correct),
        lastPracticedAt: current.lastPracticedAt || old.lastPracticedAt,
        lastErrorAt: current.lastErrorAt || old.lastErrorAt
      };
    });
    const entity = {
      partitionKey: principal.userId,
      rowKey: ROW_KEY,
      userName: principal.userDetails,
      quizId,
      score: keepPrevious ? previous.score : score,
      total: keepPrevious ? previous.total : total,
      passed: keepPrevious ? previous.passed : currentRatio * 100 >= passScore,
      completedAt: keepPrevious ? previous.completedAt : new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      categoryStats: JSON.stringify(mergedStats),
      attempts
    };
    await table.upsertEntity(entity, 'Replace');
    context.log(`quiz enregistré user=${principal.userId} quiz=${quizId} score=${entity.score}/${entity.total} attempt=${attempts}`);
    return json(200, { ...quizResult(entity) });
  }
});
