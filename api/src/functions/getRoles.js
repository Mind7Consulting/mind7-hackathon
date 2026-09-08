const { app } = require('@azure/functions');

/**
 * /api/getroles — fonction "rolesSource" appelée par Static Web Apps à chaque connexion.
 * Attribue le rôle "admin" aux UPN listés dans ADMIN_UPNS (séparés par des virgules).
 *
 * Alternative recommandée à l'échelle : vérifier l'appartenance à un groupe Entra ID
 * via Microsoft Graph, en utilisant l'accessToken fourni dans le corps de la requête.
 */
app.http('getRoles', {
  route: 'getroles',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let payload = {};
    try { payload = await request.json(); } catch { /* corps vide */ }

    const upn = (payload.userDetails || '').toLowerCase().trim();
    const admins = (process.env.ADMIN_UPNS || '').split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
    const roles = admins.includes(upn) ? ['admin'] : [];

    context.log(`getroles: ${upn || '(inconnu)'} -> [${roles.join(', ')}]`);
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roles }) };
  }
});
