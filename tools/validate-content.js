#!/usr/bin/env node
/**
 * Valide src/content/modules.json avant déploiement.
 * Objectif : empêcher qu'un contenu rédigé avec l'IA parte en production
 * avec une réponse manquante, un index hors bornes ou une explication absente.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = path.join(root, 'src', 'content', 'modules.json');
const quizFile = path.join(root, 'src', 'content', 'quiz.json');
const recapsFile = path.join(root, 'src', 'content', 'recaps.json');
const errors = [];
const warnings = [];

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error('✕ JSON invalide :', e.message);
  process.exit(1);
}

function readJsonContent(contentPath, label) {
  try { return JSON.parse(fs.readFileSync(contentPath, 'utf8')); }
  catch (e) { errors.push(`${label} : JSON invalide (${e.message}).`); return null; }
}

const quizData = readJsonContent(quizFile, 'Quiz situations');
if (quizData) {
  if (!quizData.id || !Array.isArray(quizData.scenarios) || quizData.scenarios.length < 3) {
    errors.push('Quiz situations : au moins 3 scénarios sont requis.');
  }
  (quizData.scenarios || []).forEach((scenario, i) => {
    if (!scenario.id || !scenario.text || typeof scenario.risk !== 'boolean' || !scenario.explanation) {
      errors.push(`Quiz situations scénario[${i}] : id, texte, risque et explication sont obligatoires.`);
    }
  });
  if (typeof quizData.passScore !== 'number' || quizData.passScore < 0 || quizData.passScore > 100) {
    errors.push('Quiz situations : passScore doit être un nombre entre 0 et 100.');
  }
  const review = quizData.review || {};
  if (!Number.isInteger(review.maxPerSeries) || review.maxPerSeries < 1 || review.maxPerSeries > 10) errors.push('Quiz situations : review.maxPerSeries doit être compris entre 1 et 10.');
  if (!Number.isFinite(review.staleAfterDays) || review.staleAfterDays < 1) errors.push('Quiz situations : review.staleAfterDays doit être positif.');
}

const recapsData = readJsonContent(recapsFile, 'Fiches mémo');
if (recapsData) {
  const defaults = recapsData.defaults || {};
  if (!Array.isArray(defaults.checklist) || defaults.checklist.length < 1) errors.push('Fiches mémo : checklist par défaut manquante.');
  if (!Array.isArray(defaults.lessonIndexes) || defaults.lessonIndexes.length < 1) errors.push('Fiches mémo : lessonIndexes par défaut manquant.');
  Object.entries(recapsData.modules || {}).forEach(([id, recap]) => {
    if (!recap.summary || !Array.isArray(recap.checklist) || recap.checklist.length < 1 || !Array.isArray(recap.lessonSummaries) || recap.lessonSummaries.length < 1) {
      errors.push(`Fiches mémo "${id}" : résumé, synthèses de leçons et checklist obligatoires.`);
    }
  });
}

if (!Array.isArray(data.modules) || data.modules.length === 0) errors.push('Aucun module défini.');

/* ---- Mascotte : les fichiers d'images doivent exister ---- */
const poses = (data.mascot && data.mascot.poses) || {};
['guide', 'bravo', 'oups'].forEach(k => {
  if (!poses[k]) { errors.push(`Mascotte : pose "${k}" non définie.`); return; }
  const p = path.join(root, 'src', poses[k].replace(/^\//, ''));
  if (!fs.existsSync(p)) errors.push(`Mascotte : fichier introuvable pour la pose "${k}" (${poses[k]}).`);
});
if (!(data.mascot && Array.isArray(data.mascot.welcome) && data.mascot.welcome.length)) {
  warnings.push('Mascotte : aucun message d\'accueil défini.');
}

const ids = new Set();
const themeIds = new Set((data.themes || []).map(t => t.id));

(data.modules || []).forEach((m, i) => {
  const tag = `module[${i}] "${m.id || 'sans id'}"`;

  if (!m.id || !/^[a-z0-9-]{3,64}$/.test(m.id)) errors.push(`${tag} : id manquant ou invalide (a-z, 0-9, tirets).`);
  if (ids.has(m.id)) errors.push(`${tag} : id dupliqué.`);
  ids.add(m.id);

  if (!m.title) errors.push(`${tag} : titre manquant.`);
  if (!m.summary) warnings.push(`${tag} : résumé manquant.`);
  if (!themeIds.has(m.themeId)) errors.push(`${tag} : themeId "${m.themeId}" inconnu.`);
  if (typeof m.passScore !== 'number' || m.passScore < 0 || m.passScore > 100) {
    errors.push(`${tag} : passScore doit être un nombre entre 0 et 100.`);
  }

  if (!Array.isArray(m.lessons) || m.lessons.length === 0) errors.push(`${tag} : aucune leçon.`);
  (m.lessons || []).forEach((l, j) => {
    if (!l.title) errors.push(`${tag} leçon[${j}] : titre manquant.`);
    if (!l.body || l.body.length < 80) warnings.push(`${tag} leçon[${j}] : contenu très court.`);
    // La réplique de la mascotte doit rester une accroche, pas un paragraphe.
    if (!l.vigie) warnings.push(`${tag} leçon[${j}] : pas de réplique de mascotte (champ "vigie").`);
    else if (l.vigie.length > 130) errors.push(`${tag} leçon[${j}] : réplique de mascotte trop longue (${l.vigie.length} car., max 130).`);
  });

  if (!Array.isArray(m.quiz) || m.quiz.length < 3) errors.push(`${tag} : le quiz doit comporter au moins 3 questions.`);
  (m.quiz || []).forEach((q, j) => {
    const qtag = `${tag} question[${j}]`;
    if (!q.question) errors.push(`${qtag} : intitulé manquant.`);
    if (!Array.isArray(q.choices) || q.choices.length < 2) errors.push(`${qtag} : au moins 2 propositions requises.`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.choices || []).length) {
      errors.push(`${qtag} : index de réponse hors bornes.`);
    }
    if (!q.explanation) errors.push(`${qtag} : explication manquante (obligatoire, c'est le cœur pédagogique).`);
  });

  const r = m.recommendations || {};
  ['high', 'medium', 'low'].forEach(k => {
    if (!r[k]) errors.push(`${tag} : recommandation "${k}" manquante.`);
  });

  if (m.aiGenerated && !m.reviewedBy) {
    errors.push(`${tag} : contenu marqué "généré par IA" sans relecteur (champ reviewedBy). Relecture humaine obligatoire.`);
  }
});

warnings.forEach(w => console.warn('⚠ ' + w));

if (errors.length) {
  errors.forEach(e => console.error('✕ ' + e));
  console.error(`\n${errors.length} erreur(s). Déploiement interrompu.`);
  process.exit(1);
}

const nbQ = (data.modules || []).reduce((a, m) => a + m.quiz.length, 0);
const nbL = (data.modules || []).reduce((a, m) => a + m.lessons.length, 0);
console.log(`✓ Contenu valide : ${data.modules.length} module(s), ${nbL} leçon(s), ${nbQ} question(s), ${warnings.length} avertissement(s).`);
