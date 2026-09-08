const { app } = require('@azure/functions');
const { getContentTable, principalFrom, isAdmin, json } = require('../shared/store');

const PARTITION = 'module';
const MAX_CONTENT_LENGTH = 60000;
const ID_RE = /^[a-z0-9-]{3,64}$/;

function validModule(module) {
  if (!module || typeof module !== 'object') return 'Module invalide';
  if (!ID_RE.test(String(module.id || ''))) return 'Identifiant invalide (a-z, 0-9, tirets)';
  if (!module.themeId || !module.title || !module.summary) return 'themeId, titre et résumé sont obligatoires';
  if (!Number.isFinite(Number(module.duration)) || Number(module.duration) < 1) return 'Durée invalide';
  if (!Number.isFinite(Number(module.passScore)) || Number(module.passScore) < 0 || Number(module.passScore) > 100) return 'Seuil invalide';
  if (!Array.isArray(module.lessons) || module.lessons.length === 0) return 'Au moins une leçon est obligatoire';
  if (module.lessons.some(l => !l || !l.title || !l.body || !l.vigie)) return 'Chaque leçon doit avoir un titre, une accroche et un contenu';
  if (!Array.isArray(module.quiz) || module.quiz.length < 3) return 'Le quiz doit comporter au moins 3 questions';
  if (module.quiz.some(q => !q || !q.question || !Array.isArray(q.choices) || q.choices.length < 2 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length || !q.explanation)) {
    return 'Chaque question doit avoir ses choix, une réponse valide et une explication';
  }
  const recommendations = module.recommendations || {};
  if (!recommendations.high || !recommendations.medium || !recommendations.low) return 'Les trois recommandations sont obligatoires';
  if (module.aiGenerated && !module.reviewedBy) return 'Le relecteur est obligatoire pour un contenu généré avec l\'IA';
  return null;
}

function requireAdmin(request) {
  const principal = principalFrom(request);
  if (!principal) return { response: json(401, { error: 'Non authentifié' }) };
  if (!isAdmin(principal)) return { response: json(403, { error: 'Accès réservé aux administrateurs' }) };
  return { principal };
}

app.http('content', {
  route: 'content',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const principal = principalFrom(request);
    if (!principal) return json(401, { error: 'Non authentifié' });
    const table = await getContentTable();
    const overrides = [];
    const deleted = [];
    for await (const entity of table.listEntities()) {
      if (entity.deleted) deleted.push(entity.rowKey);
      else {
        try { overrides.push(JSON.parse(entity.content)); }
        catch { /* une entrée invalide ne doit pas bloquer tout le catalogue */ }
      }
    }
    return json(200, { overrides, deleted });
  }
});

app.http('adminContent', {
  route: 'admin/content',
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const access = requireAdmin(request);
    if (access.response) return access.response;
    const table = await getContentTable();

    if (request.method === 'GET') {
      const modules = [];
      for await (const entity of table.listEntities()) {
        if (!entity.deleted) {
          try { modules.push(JSON.parse(entity.content)); } catch { /* ignoré, le catalogue statique reste disponible */ }
        }
      }
      return json(200, { modules });
    }

    if (request.method === 'DELETE') {
      const id = String(request.params.id || new URL(request.url).searchParams.get('id') || '').trim();
      if (!ID_RE.test(id)) return json(400, { error: 'Identifiant invalide' });
      await table.upsertEntity({ partitionKey: PARTITION, rowKey: id, deleted: true, updatedAt: new Date().toISOString(), updatedBy: access.principal.userDetails }, 'Replace');
      return json(200, { id, deleted: true });
    }

    let module;
    try { module = await request.json(); } catch { return json(400, { error: 'Corps JSON invalide' }); }
    const error = validModule(module);
    if (error) return json(400, { error });
    const content = JSON.stringify(module);
    if (content.length > MAX_CONTENT_LENGTH) return json(413, { error: `Module trop volumineux (maximum ${MAX_CONTENT_LENGTH} caractères)` });

    await table.upsertEntity({ partitionKey: PARTITION, rowKey: module.id, content, deleted: false, updatedAt: new Date().toISOString(), updatedBy: access.principal.userDetails }, 'Replace');
    context.log(`admin/content enregistré par ${access.principal.userDetails} — ${module.id}`);
    return json(200, module);
  }
});
