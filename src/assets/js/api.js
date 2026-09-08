/**
 * api.js — couche d'accès commune (auth, contenu, progression, mascotte).
 *
 * En production sur Azure Static Web Apps :
 *   - l'identité vient de /.auth/me (EasyAuth / Microsoft Entra ID)
 *   - la progression est stockée via /api/progress (Azure Functions -> Table Storage)
 *
 * En local (fichier ouvert hors SWA CLI), un mode dégradé prend le relais :
 *   - utilisateur fictif
 *   - progression en localStorage
 * Ce mode sert uniquement à travailler le contenu, jamais en production.
 */

const LMS = (() => {
  const LOCAL_KEY = 'lms.local.progress';
  const LOCAL_CONTENT_KEY = 'lms.local.content';
  const LOCAL_QUIZ_KEY = 'lms.local.quiz';
  let _offline = false;
  let _user = null;
  let _content = null;
  let _quizContent = null;
  let _recaps = null;

  /* ---------------- Identité ---------------- */

  async function getUser() {
    if (_user) return _user;
    try {
      const r = await fetch('/.auth/me');
      if (!r.ok) throw new Error('auth indisponible');
      const data = await r.json();
      const p = data.clientPrincipal;
      if (!p) { window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(location.pathname); return null; }
      _user = { id: p.userId, name: p.userDetails, roles: p.userRoles || [], isAdmin: (p.userRoles || []).includes('admin') };
    } catch (e) {
      _offline = true;
      _user = { id: 'local-dev', name: 'mode.local@exemple.fr', roles: ['authenticated', 'admin'], isAdmin: true };
    }
    return _user;
  }

  function isOffline() { return _offline; }

  /* ---------------- Contenu ---------------- */

  async function getContent() {
    if (_content) return _content;
    const r = await fetch('content/modules.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('contenu indisponible (' + r.status + ')');
    _content = await r.json();
    try {
      const remote = await fetch('/api/content', { cache: 'no-store' });
      if (remote.ok) applyContentChanges(await remote.json());
    } catch { /* contenu statique utilisable sans API */ }
    applyLocalContentChanges();
    return _content;
  }

  function applyContentChanges(changes) {
    const overrides = new Map((changes.overrides || []).map(m => [m.id, m]));
    const deleted = new Set(changes.deleted || []);
    _content.modules = _content.modules.filter(m => !deleted.has(m.id)).map(m => overrides.get(m.id) || m);
    (changes.overrides || []).filter(m => !_content.modules.some(current => current.id === m.id) && !deleted.has(m.id))
      .forEach(m => _content.modules.push(m));
  }

  function localContentChanges() {
    try { return JSON.parse(localStorage.getItem(LOCAL_CONTENT_KEY) || '{"overrides":[],"deleted":[]}'); }
    catch { return { overrides: [], deleted: [] }; }
  }

  function applyLocalContentChanges() {
    if (!_offline) return;
    applyContentChanges(localContentChanges());
  }

  async function getModule(id) {
    const c = await getContent();
    return c.modules.find(m => m.id === id) || null;
  }

  async function getQuizContent() {
    if (_quizContent) return _quizContent;
    const r = await fetch('/content/quiz.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('quiz indisponible (' + r.status + ')');
    _quizContent = await r.json();
    return _quizContent;
  }

  async function getRecaps() {
    if (_recaps) return _recaps;
    const r = await fetch('/content/recaps.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('fiches mémo indisponibles (' + r.status + ')');
    _recaps = await r.json();
    return _recaps;
  }

  /* ---------------- Mascotte ---------------- */

  /** Chemin d'une pose : 'guide' | 'bravo' | 'oups'. */
  async function pose(name) {
    const c = await getContent();
    const p = (c.mascot && c.mascot.poses) || {};
    return p[name] || p.guide || '';
  }

  async function mascot() {
    const c = await getContent();
    return c.mascot || { name: 'Vigie', poses: {}, welcome: [] };
  }

  /** Message d'accueil, stable sur une même journée (évite un changement à chaque rechargement). */
  async function welcomeLine() {
    const m = await mascot();
    const list = m.welcome || [];
    if (!list.length) return '';
    const day = Math.floor(Date.now() / 864e5);
    return list[day % list.length];
  }

  /* ---------------- Progression (utilisateur courant) ---------------- */

  function localAll() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch { return {}; }
  }

  async function getMyProgress() {
    if (_offline) return localAll();
    try {
      const r = await fetch('/api/progress');
      if (!r.ok) throw new Error('api progress ' + r.status);
      const rows = await r.json();
      const map = {};
      rows.forEach(x => { map[x.moduleId] = x; });
      return map;
    } catch (e) {
      console.warn('Progression indisponible, bascule locale :', e.message);
      _offline = true;
      return localAll();
    }
  }

  /**
   * Enregistre un résultat de quiz.
   * Données transmises volontairement minimales : module, score, statut, date.
   * Aucune réponse individuelle, aucun temps passé, aucune donnée sensible.
   */
  async function saveResult({ moduleId, score, passed }) {
    const payload = { moduleId, score: Math.round(score), passed: !!passed, completedAt: new Date().toISOString() };

    // Conserve toujours la meilleure tentative, quel que soit le chemin d'enregistrement.
    const localSave = () => {
      const all = localAll();
      const prev = all[moduleId];
      const kept = (prev && prev.score >= payload.score) ? prev : payload;
      all[moduleId] = kept;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      return kept;
    };

    if (_offline) return localSave();

    try {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('api save ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('Enregistrement distant impossible, sauvegarde locale :', e.message);
      _offline = true;
      return localSave();
    }
  }

  function localQuiz() {
    try { return JSON.parse(localStorage.getItem(LOCAL_QUIZ_KEY) || '{}'); }
    catch { return {}; }
  }

  async function saveQuizResult({ quizId, score, total, passScore = 75, categoryStats = {} }) {
    const payload = { quizId, score: Math.round(score), total: Math.round(total), passScore: Math.round(passScore), categoryStats };
    const localSave = () => {
      const all = localQuiz();
      const previous = all[quizId];
      const currentRatio = payload.score / payload.total;
      const previousRatio = previous ? previous.score / previous.total : -1;
      const best = previous && previousRatio >= currentRatio ? previous : {
        quizId,
        score: payload.score,
        total: payload.total,
        passed: currentRatio * 100 >= payload.passScore,
        categoryStats: payload.categoryStats,
        completedAt: new Date().toISOString()
      };
      const categoryStats = { ...((previous && previous.categoryStats) || {}) };
      Object.entries(payload.categoryStats || {}).forEach(([category, current]) => {
        const old = categoryStats[category] || { answered: 0, correct: 0, lastPracticedAt: null, lastErrorAt: null };
        categoryStats[category] = {
          answered: old.answered + current.answered,
          correct: old.correct + current.correct,
          lastPracticedAt: current.lastPracticedAt || old.lastPracticedAt,
          lastErrorAt: current.lastErrorAt || old.lastErrorAt
        };
      });
      all[quizId] = { ...best, categoryStats, lastAttemptAt: new Date().toISOString(), attempts: (previous ? previous.attempts || 1 : 0) + 1 };
      localStorage.setItem(LOCAL_QUIZ_KEY, JSON.stringify(all));
      return all[quizId];
    };
    if (_offline) return localSave();
    try {
      const r = await fetch('/api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('api quiz ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('Résultat du quiz non enregistré à distance :', e.message);
      _offline = true;
      return localSave();
    }
  }

  async function getQuizResult(quizId = 'situations') {
    if (_offline) return localQuiz()[quizId] || null;
    try {
      const r = await fetch('/api/quiz', { cache: 'no-store' });
      if (!r.ok) throw new Error('api quiz ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('Suivi du quiz indisponible :', e.message);
      _offline = true;
      return localQuiz()[quizId] || null;
    }
  }


  /* ---------------- Administration ---------------- */

  async function getAdminOverview() {
    if (_offline) {
      const mine = localAll();
      return { demo: true, users: [{ userId: 'local-dev', name: 'mode.local@exemple.fr', results: Object.values(mine), quizResults: Object.values(localQuiz()) }] };
    }
    const r = await fetch('/api/admin/overview');
    if (r.status === 401 || r.status === 403) throw new Error('forbidden');
    if (!r.ok) throw new Error('api admin ' + r.status);
    return await r.json();
  }

  async function getAdminContent() {
    if (_offline) return localContentChanges().overrides;
    const r = await fetch('/api/admin/content', { cache: 'no-store' });
    if (r.status === 401 || r.status === 403) throw new Error('forbidden');
    if (!r.ok) throw new Error('api content ' + r.status);
    return (await r.json()).modules || [];
  }

  async function saveAdminModule(module) {
    if (_offline) {
      const changes = localContentChanges();
      changes.deleted = (changes.deleted || []).filter(id => id !== module.id);
      const index = changes.overrides.findIndex(m => m.id === module.id);
      if (index >= 0) changes.overrides[index] = module;
      else changes.overrides.push(module);
      localStorage.setItem(LOCAL_CONTENT_KEY, JSON.stringify(changes));
      _content = null;
      return module;
    }
    const r = await fetch('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(module) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'enregistrement impossible');
    _content = null;
    return await r.json();
  }

  async function deleteAdminModule(id) {
    if (_offline) {
      const changes = localContentChanges();
      changes.overrides = changes.overrides.filter(m => m.id !== id);
      changes.deleted = [...new Set([...(changes.deleted || []), id])];
      localStorage.setItem(LOCAL_CONTENT_KEY, JSON.stringify(changes));
      _content = null;
      return;
    }
    const r = await fetch('/api/admin/content?id=' + encodeURIComponent(id), { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'suppression impossible');
    _content = null;
  }

  /* ---------------- Rendu commun ---------------- */

  function initials(name) {
    const base = (name || '?').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return base.split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
  }

  async function renderHeader(active) {
    const u = await getUser();
    if (!u) return null;
    const el = document.getElementById('topbar');
    if (!el) return u;
    const guide = await pose('guide');
    el.innerHTML = `
      <div class="topbar-inner">
        <a class="logo" href="/" aria-label="Reflex7">
          <img src="../assets/img/logo-groupe-mind7.svg" alt="Groupe Mind7">
        </a>        <nav class="nav">
          <a href="/" class="${active === 'home' ? 'active' : ''}">Mes parcours</a>
          ${u.isAdmin ? `<a href="/admin.html" class="${active === 'admin' ? 'active' : ''}">Administration</a>` : ''}
          <div class="user-chip">
            <div class="avatar">${initials(u.name)}</div>
            <span class="hide-xs">${u.name}</span>
            ${_offline ? '' : '<a href="/.auth/logout" title="Se déconnecter" style="padding:4px 8px">Quitter</a>'}
          </div>
        </nav>
      </div>`;
    return u;
  }

  /** Mini-formatage Markdown : **gras**, `code`, listes, paragraphes. */
  function mdToHtml(md) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return md.split('\n\n').map(block => {
      const b = block.trim();
      if (!b) return '';
      if (b.split('\n').every(l => l.trim().startsWith('- '))) {
        return `<ul>${b.split('\n').map(l => `<li>${inline(l.trim().slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
    }).join('');
    function inline(s) {
      const links = [];
      const linkToken = (url, label) => {
        if (!/^https:\/\//i.test(url)) return label;
        links.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`);
        return `__LMS_LINK_${links.length - 1}__`;
      };
      const withTokens = s
        .replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => linkToken(url, label))
        .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/gi, (_, label, url) => linkToken(url, label));
      let result = esc(withTokens)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      links.forEach((link, index) => { result = result.replace(`__LMS_LINK_${index}__`, link); });
      return result;
    }
  }

  function statusBadge(res) {
    if (!res) return '<span class="badge">Non commencé</span>';
    if (res.passed) return `<span class="badge ok">Validé · ${res.score}%</span>`;
    return `<span class="badge warn">À repasser · ${res.score}%</span>`;
  }

  return {
    getUser, isOffline, getContent, getModule, getQuizContent, getRecaps,
    getMyProgress, saveResult, saveQuizResult, getQuizResult, getAdminOverview, getAdminContent, saveAdminModule, deleteAdminModule,
    pose, mascot, welcomeLine,
    renderHeader, mdToHtml, statusBadge, initials
  };
})();
