# Reflex7 — LMS interne sur Azure Static Web Apps

Plateforme légère de sensibilisation : micro-cours guidés par une mascotte, quiz avec explications,
suivi de progression côté collaborateur, tableau de bord côté administrateur.

Authentification Microsoft Entra ID, hébergement Azure Static Web Apps, API serverless Azure Functions,
stockage des résultats en Azure Table Storage. Aucun serveur à administrer, aucun système à patcher.

---

## 1. Ce que fait la plateforme

**Côté collaborateur** (`/`)
- Bandeau d'accueil animé par la mascotte, dont le message s'adapte à l'avancement réel
- Catalogue des modules avec statut (Non commencé / À repasser / Validé)
- Page Modules avec navigation latérale et filtres par statut
- Page Fiches mémo avec filtres Toutes / Débloquées / Verrouillées
- Quiz situations avec correction immédiate, explications et score de session
- Micro-cours découpé en étapes courtes, chaque étape introduite par une réplique de la mascotte
- Quiz interactif : correction immédiate, **explication après chaque réponse**, réaction de la mascotte
- Score final, seuil de réussite paramétrable, recommandation personnalisée
- Compteurs personnels : modules validés, score moyen, modules restants

**Côté administrateur** (`/admin.html`, réservé au rôle `admin`)
- Taux de complétion global, score moyen, nombre de collaborateurs n'ayant pas commencé
- Reporting des quiz de situations : participants, meilleur score moyen, taux de réussite et tentatives
- Complétion et score moyen par module
- Tableau détaillé par collaborateur, avec recherche et filtre par statut
- Export CSV (séparateur `;`, BOM UTF-8, ouvrable directement dans Excel)

**Contenu livré** : 4 modules, 14 leçons, 21 questions — toutes avec explication.

| Module | Durée | Niveau |
|---|---|---|
| Hygiène informatique et bonnes pratiques | 7 min | Essentiel |
| Le phishing sur mobile | 6 min | Essentiel |
| Mots de passe et MFA | 5 min | Essentiel |
| Données clients et confidentialité | 6 min | Intermédiaire |

---

## 2. La mascotte « Vigie »

Le parti pris pédagogique : un fil conducteur incarné plutôt qu'un empilement de pages de texte.

**Trois poses seulement**, ce qui suffit à couvrir tous les cas et garde le système simple :

| Pose | Fichier | Usage |
|---|---|---|
| `guide` | `vigie-guide.png` | Logo, accueil, réplique en tête de chaque leçon |
| `bravo` | `vigie-bravo.png` | Bonne réponse, module validé, parcours complet |
| `oups` | `vigie-oups.png` | Réponse incorrecte, page d'erreur, accès refusé |

**Poids total : 36 Ko** pour les trois images (PNG palettisés, fond détouré). Aucune dépendance externe.

**Comment Vigie s'exprime**
- Une réplique par leçon, dans le champ `vigie` du JSON — une accroche mémorisable, jamais un paragraphe.
  Le validateur refuse toute réplique de plus de 130 caractères.
- Réaction après chaque réponse : « Bien vu ! » ou « Pas tout à fait ». **Jamais de formulation
  culpabilisante** — le ton reste encourageant, y compris en cas d'échec, ce qui est un choix
  délibéré : la sensibilisation fonctionne mieux sans mise en faute.
- Message d'accueil variable mais **stable sur une même journée** (indexé sur la date, pas aléatoire),
  pour éviter un changement à chaque rechargement de page.
- Sur l'accueil, Vigie passe en pose `bravo` dès que le parcours est complet.

**Accessibilité** : l'animation d'apparition est désactivée si le navigateur signale
`prefers-reduced-motion`. Les images décoratives ont un `alt` vide, les images porteuses de sens
sont décrites.

**Changer de mascotte** : remplacez les trois PNG dans `src/assets/img/` en conservant les noms.
Aucun code à modifier. Les chemins sont déclarés dans `mascot.poses` du JSON.

---

## 3. Structure du dépôt

```
.
├── src/                            # front-end statique (app_location)
│   ├── index.html                  # accueil + catalogue + progression
│   ├── fiches.html                 # bibliothèque filtrable des fiches mémo
│   ├── quiz.html                   # quiz de mises en situation
│   ├── leaderboard.html            # classement XP des quiz
│   ├── cours.html                  # lecteur de micro-cours + moteur de quiz
│   ├── recap.html                  # fiche mémo d'un module validé
│   ├── admin.html                  # tableau de bord d'administration
│   ├── 403.html / 404.html
│   ├── staticwebapp.config.json    # routes, authentification, en-têtes de sécurité
│   ├── assets/css/style.css
│   ├── assets/js/api.js            # identité, contenu, progression, mascotte
│   ├── assets/img/vigie-*.png      # les 3 poses (36 Ko au total)
│   └── content/                    # contenus pédagogiques éditables
│       ├── modules.json             # modules, leçons et quiz de cours
│       ├── quiz.json                # scénarios du Quiz situations
│       └── recaps.json              # textes et checklists des fiches mémo
├── api/                            # Azure Functions Node.js v4 (api_location)
│   ├── src/functions/progress.js       # GET/POST progression du collaborateur
│   ├── src/functions/adminOverview.js  # GET vue consolidée (rôle admin)
│   ├── src/functions/content.js        # GET catalogue + CRUD modules admin
│   ├── src/functions/getRoles.js       # attribution du rôle admin à la connexion
│   ├── src/functions/purgeRetention.js # purge automatique (rétention RGPD)
│   └── src/shared/store.js             # Tables Storage + décodage d'identité
├── tools/validate-content.js       # contrôle qualité du contenu avant déploiement
└── .github/workflows/              # CI/CD GitHub Actions
```

Le contenu initial est livré dans `src/content/modules.json`. Les administrateurs peuvent ensuite
créer, modifier ou retirer les modules depuis `/admin.html`. Les changements sont enregistrés dans
la table Azure Table Storage `lmsContent` et fusionnés avec le contenu statique initial.

---

## 4. Déploiement

### 4.1 Prérequis

- Un abonnement Azure et un dépôt GitHub
- Un compte de stockage Azure (Table Storage)
- Les droits pour créer une inscription d'application dans Microsoft Entra ID

### 4.2 Inscription d'application Entra ID

Le fournisseur Entra ID **préconfiguré** de Static Web Apps accepte n'importe quel compte Microsoft.
Pour restreindre l'accès à votre seul tenant, il faut une **inscription personnalisée**, ce qui impose
le **plan Standard** (le plan Free ne permet pas les inscriptions personnalisées).

1. Portail Azure → Microsoft Entra ID → Inscriptions d'applications → Nouvelle inscription
2. Comptes pris en charge : **Comptes dans cet annuaire d'organisation uniquement**
3. URI de redirection (Web) : `https://<votre-app>.azurestaticapps.net/.auth/login/aad/callback`
4. Créer un secret client, noter la valeur
5. Dans `src/staticwebapp.config.json`, remplacer `<TENANT_ID>` par l'identifiant de votre tenant

### 4.3 Création de la Static Web App

Portail Azure → Créer une ressource → Static Web App :
- Plan : **Standard**
- Source : GitHub, branche `main`
- Préréglage de build : Custom — `app_location` = `src`, `api_location` = `api`, `output_location` = vide

### 4.4 Variables d'application

Static Web App → Paramètres → Variables d'environnement :

| Variable | Valeur | Rôle |
|---|---|---|
| `AAD_CLIENT_ID` | ID d'application de l'inscription Entra | Authentification |
| `AAD_CLIENT_SECRET` | Secret client | Authentification |
| `STORAGE_CONNECTION` | Chaîne de connexion du compte de stockage | Stockage des résultats |
| `TABLE_NAME` | `lmsProgress` | Nom de la table |
| `CONTENT_TABLE_NAME` | `lmsContent` | Surcharges des modules gérées depuis l'administration |
| `QUIZ_TABLE_NAME` | `lmsQuiz` | Résultats des quiz de situations |
| `ADMIN_UPNS` | `prenom.nom@domaine.fr,autre@domaine.fr` | Attribution du rôle `admin` |
| `RETENTION_MONTHS` | `24` | Durée de conservation avant purge |

> En production, préférez l'**identité managée** à la chaîne de connexion : renseignez
> `STORAGE_ACCOUNT_URL` au lieu de `STORAGE_CONNECTION`, activez l'identité managée sur la Static Web App
> et attribuez-lui le rôle *Contributeur de données de table du stockage*. Le code gère les deux modes.

### 4.5 Développement local

```bash
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4
cd api && npm install && cp local.settings.json.example local.settings.json && cd ..
swa start src --api-location api
```

Sans SWA CLI, un simple `python -m http.server` dans `src/` suffit pour travailler le contenu :
l'application bascule automatiquement en **mode local** (utilisateur fictif, progression en
`localStorage`, bannière d'avertissement visible). Ce mode ne doit jamais servir en production.

---

## 5. Ajouter ou modifier un module

Depuis l'interface admin, utiliser **Nouveau module**, **Modifier** ou **Supprimer**. L'éditeur
attend le même format JSON que le fichier source et l'API refuse les modules incomplets (leçons,
quiz, explications et recommandations obligatoires). En local, les changements sont conservés
dans `localStorage`.

Pour une modification versionnée ou un changement initial, éditer `src/content/modules.json`,
puis valider avant de pousser :

```bash
node tools/validate-content.js
```

Le validateur bloque le déploiement si : un identifiant est dupliqué, un index de bonne réponse
est hors bornes, **une explication de réponse est absente**, une recommandation manque, une réplique
de mascotte dépasse 130 caractères, un fichier d'image de mascotte est introuvable, ou si un
module marqué `aiGenerated` n'a pas de relecteur renseigné dans `reviewedBy`.

Ce dernier contrôle est volontaire : il rend la **relecture humaine des contenus générés par l'IA
techniquement obligatoire** avant mise en ligne, ce qui constitue une preuve exploitable en audit.

Squelette minimal d'un module :

```json
{
  "id": "cyber-nouveau-sujet",
  "themeId": "cyber",
  "title": "Titre du module",
  "summary": "Une phrase de présentation.",
  "duration": 5,
  "level": "Essentiel",
  "passScore": 80,
  "aiGenerated": true,
  "reviewedBy": "Équipe Sécurité",
  "lessons": [{
    "title": "…",
    "vigie": "Accroche courte dite par la mascotte (130 caractères max).",
    "body": "Markdown léger : **gras**, `code`, listes."
  }],
  "quiz": [{
    "question": "…",
    "choices": ["…", "…"],
    "answer": 0,
    "explanation": "Obligatoire : c'est le cœur pédagogique."
  }],
  "recommendations": { "high": "…", "medium": "…", "low": "…" }
}
```

**Ajouter un thème** (autre que la cybersécurité) : ajouter une entrée dans `themes`, puis
référencer son `id` dans `themeId`. Le modèle de données est déjà multi-thèmes.

---

## 6. Sécurité et protection des données

**Contrôle d'accès**
- Toutes les routes exigent le rôle `authenticated` : aucune page n'est publique
- `/admin.html` et `/api/admin/*` exigent le rôle `admin`, contrôlé **deux fois** :
  par la règle de route et par une vérification explicite dans la fonction
- Les fournisseurs GitHub et X sont explicitement neutralisés (`statusCode: 404`)
- Chaque collaborateur ne peut lire que sa propre partition (clé = son `userId`)

**En-têtes** — CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`
sont définis dans `staticwebapp.config.json`. Toutes les réponses API sont en `Cache-Control: no-store`.

> Point d'amélioration connu : la CSP autorise `'unsafe-inline'` pour les scripts, car les pages
> utilisent des scripts inline. Pour durcir, externaliser ces scripts dans `assets/js/` et retirer
> la directive.

**Minimisation des données** — seuls sont enregistrés : identifiant utilisateur, UPN, identifiant de
module, score, statut, dates, nombre de tentatives.
Ne sont **pas** collectés : les réponses individuelles, le temps passé par question, l'adresse IP,
le terminal, le navigateur.

**Conservation** — purge automatique mensuelle au-delà de `RETENTION_MONTHS` (24 par défaut),
via une fonction planifiée. La suppression est journalisée.

**Finalité** — usage pédagogique et preuve de conformité uniquement. **L'usage disciplinaire ou
d'évaluation individuelle doit être exclu par écrit** et communiqué aux collaborateurs. C'est le
principal point de friction potentiel avec les représentants du personnel : traitez-le en amont.

**IA** — l'IA n'intervient qu'à la rédaction des contenus et à la production des illustrations, hors
ligne, côté auteur. Aucun appel à un service d'IA au moment de l'exécution, aucune donnée de
collaborateur transmise à un modèle. Les modules rédigés avec assistance IA portent le marqueur
`aiGenerated` et un relecteur identifié.

---

## 7. Recette fonctionnelle

| # | Test | Attendu | Statut |
|---|---|---|---|
| 1 | Accès non authentifié | Redirection vers la connexion Entra ID | À tester en production |
| 2 | Connexion avec un compte d'un autre tenant | Refusée (inscription personnalisée) | À tester en production |
| 3 | Collaborateur standard sur `/admin.html` | 403, page dédiée | ✓ |
| 4 | Collaborateur standard sur `/api/admin/overview` | 403 | ✓ |
| 5 | Parcours complet d'un module | Score, explications, recommandation | ✓ |
| 6 | Quiz repassé avec un score inférieur | Le **meilleur** score est conservé | ✓ |
| 7 | Affichage sur smartphone | Aucun débordement horizontal | ✓ |
| 8 | Export CSV | Ouverture correcte dans Excel, accents préservés | ✓ |
| 9 | Contenu invalide poussé | Déploiement bloqué par le validateur | ✓ |
| 10 | Mascotte : poses, réactions, adaptation à l'avancement | Cohérentes | ✓ |

---

## 8. Limites assumées

Cette plateforme est un MVP volontairement simple. Ne sont **pas** couverts nativement :

- Relances automatiques par mail ou Teams (à ajouter via Power Automate sur la table)
- Gamification, classement, badges
- SCORM / xAPI, certificats nominatifs opposables
- Parcours différenciés par population (consultant / fonction support)
- Anti-triche : les bonnes réponses sont présentes dans le JSON côté client, donc
  **lisibles par un utilisateur curieux**. Acceptable pour de la sensibilisation, rédhibitoire
  pour un examen certifiant — dans ce cas, la correction doit passer côté API.

Ces éléments sont des évolutions, pas des correctifs : ils supposent un arbitrage préalable.

---

## 9. Licence et dépendances

Code applicatif : à définir selon votre politique interne.
Illustrations de la mascotte : générées par IA pour ce projet, libres d'usage interne.
Dépendances runtime : `@azure/functions`, `@azure/data-tables`, `@azure/identity` (MIT, Microsoft).
Aucune dépendance front-end : ni framework, ni CDN externe, ni police distante.
