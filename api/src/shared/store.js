const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = process.env.TABLE_NAME || 'lmsProgress';
const CONTENT_TABLE_NAME = process.env.CONTENT_TABLE_NAME || 'lmsContent';
const QUIZ_TABLE_NAME = process.env.QUIZ_TABLE_NAME || 'lmsQuiz';
let _client = null;
let _contentClient = null;
let _quizClient = null;

/**
 * Client Table Storage.
 * Connexion via chaîne de connexion (STORAGE_CONNECTION) ou, recommandé en production,
 * via identité managée (STORAGE_ACCOUNT_URL + DefaultAzureCredential).
 */
async function getTable() {
  if (_client) return _client;
  const conn = process.env.STORAGE_CONNECTION;
  const accountUrl = process.env.STORAGE_ACCOUNT_URL;

  if (conn) {
    _client = TableClient.fromConnectionString(conn, TABLE_NAME, { allowInsecureConnection: !!process.env.AZURITE });
  } else if (accountUrl) {
    const { DefaultAzureCredential } = require('@azure/identity');
    _client = new TableClient(accountUrl, TABLE_NAME, new DefaultAzureCredential());
  } else {
    throw new Error('Configurer STORAGE_CONNECTION ou STORAGE_ACCOUNT_URL');
  }
  try { await _client.createTable(); } catch { /* déjà existante */ }
  return _client;
}

async function getContentTable() {
  if (_contentClient) return _contentClient;
  const conn = process.env.STORAGE_CONNECTION;
  const accountUrl = process.env.STORAGE_ACCOUNT_URL;

  if (conn) {
    _contentClient = TableClient.fromConnectionString(conn, CONTENT_TABLE_NAME, { allowInsecureConnection: !!process.env.AZURITE });
  } else if (accountUrl) {
    const { DefaultAzureCredential } = require('@azure/identity');
    _contentClient = new TableClient(accountUrl, CONTENT_TABLE_NAME, new DefaultAzureCredential());
  } else {
    throw new Error('Configurer STORAGE_CONNECTION ou STORAGE_ACCOUNT_URL');
  }
  try { await _contentClient.createTable(); } catch { /* déjà existante */ }
  return _contentClient;
}

async function getQuizTable() {
  if (_quizClient) return _quizClient;
  const conn = process.env.STORAGE_CONNECTION;
  const accountUrl = process.env.STORAGE_ACCOUNT_URL;

  if (conn) {
    _quizClient = TableClient.fromConnectionString(conn, QUIZ_TABLE_NAME, { allowInsecureConnection: !!process.env.AZURITE });
  } else if (accountUrl) {
    const { DefaultAzureCredential } = require('@azure/identity');
    _quizClient = new TableClient(accountUrl, QUIZ_TABLE_NAME, new DefaultAzureCredential());
  } else {
    throw new Error('Configurer STORAGE_CONNECTION ou STORAGE_ACCOUNT_URL');
  }
  try { await _quizClient.createTable(); } catch { /* déjà existante */ }
  return _quizClient;
}

/** Décode l'identité injectée par Static Web Apps (en-tête x-ms-client-principal). */
function principalFrom(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const p = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    if (!p || !p.userId) return null;
    return { userId: p.userId, userDetails: p.userDetails, roles: p.userRoles || [] };
  } catch { return null; }
}

function isAdmin(principal) {
  return !!principal && (principal.roles || []).includes('admin');
}

function json(status, body) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

module.exports = { getTable, getContentTable, getQuizTable, principalFrom, isAdmin, json, TABLE_NAME, CONTENT_TABLE_NAME, QUIZ_TABLE_NAME };
