const { app } = require('@azure/functions');
const { getTable } = require('../shared/store');

/**
 * Purge automatique des résultats au-delà de la durée de conservation.
 * Exécution mensuelle (1er du mois à 03:00). Durée pilotée par RETENTION_MONTHS (défaut : 24).
 * Répond à l'exigence de limitation de conservation (RGPD) et fournit une preuve d'automatisation.
 */
app.timer('purgeRetention', {
  schedule: '0 0 3 1 * *',
  handler: async (myTimer, context) => {
    const months = parseInt(process.env.RETENTION_MONTHS || '24', 10);
    const limit = new Date();
    limit.setMonth(limit.getMonth() - months);

    const table = await getTable();
    let deleted = 0, scanned = 0;

    for await (const e of table.listEntities()) {
      scanned++;
      const ref = e.lastAttemptAt || e.completedAt;
      if (ref && new Date(ref) < limit) {
        await table.deleteEntity(e.partitionKey, e.rowKey);
        deleted++;
      }
    }
    context.log(`purge: ${deleted} entrée(s) supprimée(s) sur ${scanned} (antérieures au ${limit.toISOString().slice(0,10)}, rétention ${months} mois)`);
  }
});
