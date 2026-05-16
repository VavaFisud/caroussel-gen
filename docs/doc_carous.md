# Documentation complete - CarouselGen

Cette documentation explique le logiciel CarouselGen de bout en bout: dashboard admin, bot Telegram VA, generation automatique de carousels Instagram, templates `.template`, Gemini, MCP, Vercel Blob, installation locale/VPS et workflows d'exploitation.

## 1. Objectif du logiciel

CarouselGen sert a automatiser la production de carousels Instagram pour plusieurs comptes.

Le systeme permet de:

- Creer des comptes Instagram dans un dashboard admin.
- Connecter des VA via un bot Telegram.
- Attribuer un ou plusieurs comptes a chaque VA.
- Importer des templates `.template`.
- Generer des carousels depuis un template.
- Regenerer les textes automatiquement avec Gemini.
- Envoyer chaque matin un carousel a chaque VA.
- Demander au VA de confirmer quand le post est publie.
- Suivre dans le dashboard si les posts ont bien ete publies.
- Connecter le logiciel a Claude, Poke, Cursor, ChatGPT ou un autre agent via MCP.

Le bot Telegram ne sert pas a administrer le systeme. Il sert uniquement aux VA.

## 2. Architecture generale

Le projet contient plusieurs blocs:

- Dashboard web admin: interface de gestion des comptes, VA, templates, plannings et posts.
- Bot Telegram VA: envoie les PNG des carousels aux VA et recoit la confirmation `J'ai poste`.
- Scheduler: verifie les jobs quotidiens et genere les posts a l'heure prevue.
- Renderer: transforme un template JSON en slides PNG via HTML/CSS et Puppeteer.
- Vercel Blob: stocke les images, ZIP et etats partages entre Vercel et le bot local/VPS.
- MCP server: donne des outils a une IA pour creer/sauver/generer des templates.
- Gemini: peut reecrire le contenu des posts automatiquement.

URLs importantes:

- Dashboard production: `https://caroussel-gen.vercel.app/login`
- Builder avance: `https://caroussel-gen.vercel.app/builder`
- Doc IA template: `https://caroussel-gen.vercel.app/doc`
- MCP HTTP production: `https://caroussel-gen.vercel.app/mcp`

Le bot Telegram tourne en local ou sur VPS, pas sur Vercel.

## 3. Roles

### Admin

L'admin gere tout depuis le dashboard:

- Cree les comptes Instagram.
- Importe les templates.
- Assigne les VA aux comptes.
- Cree les jobs quotidiens.
- Configure Gemini.
- Lance une generation manuelle.
- Verifie les posts confirmes.

### VA

Le VA utilise uniquement Telegram:

- Il envoie le mot de passe au bot pour connecter son chat.
- Il recoit les carousels a poster.
- Il publie les slides sur Instagram.
- Il clique sur `J'ai poste`.
- Il peut voir ses comptes assignes avec `/mes_comptes`.

Le VA ne cree pas de template, ne configure pas Gemini et ne gere pas le planning.

### Agent IA

Un agent IA compatible MCP peut:

- Lire la documentation des templates.
- Analyser une image de reference envoyee dans le chat.
- Creer un JSON `.template`.
- Sauvegarder le template dans CarouselGen.
- Generer un carousel depuis un prompt ou un template.

Important: le MCP ne voit pas les images tout seul. C'est l'agent IA hote, par exemple Claude, qui analyse l'image, puis appelle les outils MCP avec ses notes.

## 4. Connexion au dashboard admin

Aller sur:

```text
https://caroussel-gen.vercel.app/login
```

Identifiant:

```text
admin
```

Mot de passe:

```text
Demander le mot de passe a l'admin principal.
```

Ne pas partager ce mot de passe avec les VA.

## 5. Dashboard admin

Le dashboard principal est la page d'operation quotidienne.

Il permet de gerer:

- Nombre de comptes.
- Nombre de VA connectes.
- Nombre de jobs quotidiens.
- Nombre de posts suivis.
- Connexion Gemini API.
- Creation de comptes Instagram.
- Attribution des VA.
- Import de templates `.template`.
- Creation de posts quotidiens.
- Generation et envoi manuel au VA.
- Suivi des jobs quotidiens.
- Suivi des posts envoyes et confirmes.

### 5.1 Creer un compte Instagram

Dans la section `Compte Instagram`, remplir:

- `Slug`: identifiant technique, par exemple `bebenuitsfaciles`.
- `Nom`: nom lisible, par exemple `Bebe nuits faciles`.
- `@ Instagram`: handle affiche sur les slides, par exemple `@bebenuitsfaciles`.
- `Template par defaut`: template utilise par defaut.
- `Heure quotidienne`: heure a laquelle le post doit etre envoye.
- `Theme quotidien optionnel`: sujet que Gemini doit utiliser.
- `Utiliser Gemini`: active la reecriture quotidienne par Gemini.

Puis cliquer sur `Enregistrer le compte`.

Le slug est important: il sert a lier les templates, les jobs, les VA et les generations.

### 5.2 Connecter un VA Telegram

Etapes:

1. Lancer le bot Telegram sur le VPS ou en local.
2. Le VA ouvre une conversation avec le bot.
3. Le VA envoie le mot de passe Telegram.
4. Le chat apparait dans le dashboard admin dans la section VA.
5. L'admin attribue un ou plusieurs comptes a ce VA.

Le VA n'a pas besoin de `chat_id`. Le systeme memorise automatiquement son chat apres le mot de passe.

### 5.3 Attribuer un VA a un compte

Dans `Attribution Telegram`:

1. Choisir le VA dans la liste.
2. Selectionner un ou plusieurs comptes.
3. Cliquer sur `Attribuer`.

Apres attribution, le VA peut utiliser `/mes_comptes` dans Telegram pour verifier ses comptes.

### 5.4 Importer un template

Dans `Importer un .template`:

1. Choisir le compte cible ou `global`.
2. Donner un nom au template.
3. Selectionner un fichier `.template`.
4. Cliquer sur `Uploader le template`.

Un template global peut etre utilise par tous les comptes.
Un template lie a un compte est range pour ce compte.

### 5.5 Planifier un post quotidien

Dans `Planifier un post quotidien`:

1. Choisir le compte.
2. Choisir le VA destinataire.
3. Choisir le template.
4. Choisir l'heure d'envoi.
5. Donner un theme.
6. Cocher ou decocher Gemini.
7. Cliquer sur `Creer le daily`.

Le scheduler tourne dans le bot local/VPS. Il verifie les jobs toutes les minutes.

Exemple:

- Compte: `bebenuitsfaciles`
- VA: `asky`
- Template: `mediacarous-blue.template`
- Heure: `09:00`
- Theme: `reveils nocturnes bebe 4 semaines`
- Gemini: active

Resultat: chaque matin, le systeme genere un carousel, l'envoie au VA dans Telegram, puis attend la confirmation `J'ai poste`.

### 5.6 Generer et envoyer manuellement

Dans `Generer et envoyer au VA`:

1. Choisir un compte.
2. Choisir un template.
3. Choisir un VA.
4. Cliquer sur `Generer et envoyer`.

Le VA recoit les PNG directement dans Telegram, dans l'ordre, puis un bouton `J'ai poste`.

Si le dashboard est sur Vercel, il ne contacte pas Telegram directement. Il ajoute une demande dans la file `telegram-outbox` stockee sur Vercel Blob. Le bot local/VPS lit cette file toutes les quelques secondes, genere le carousel, puis l'envoie au VA. Il faut donc que le bot tourne pour que l'envoi parte.

### 5.7 Suivi des posts

La section `Posts envoyes` montre les posts envoyes au VA.

Un post reste a verifier tant que le VA n'a pas clique sur `J'ai poste`.
Quand le VA clique, le statut passe en confirme dans le dashboard.

## 6. Bot Telegram VA

Le bot Telegram est volontairement simple.

Il sert uniquement a:

- Autoriser un VA via mot de passe.
- Afficher les comptes assignes au VA.
- Envoyer les carousels a publier.
- Recevoir la confirmation de publication.

Commandes disponibles:

```text
/start
/menu
/mes_comptes
/my_accounts
/comptes
/aide
/help
/logout
```

### 6.1 Premiere connexion VA

Le VA ouvre le bot et envoie le mot de passe Telegram.

Si le mot de passe est correct:

- Le chat est autorise.
- Le dashboard admin voit le VA.
- L'admin peut lui attribuer des comptes.

### 6.2 Recevoir un post

Quand un daily job ou une generation manuelle est lancee, le VA recoit:

- Les slides PNG envoyees une par une dans l'ordre.
- Le nom du compte.
- Le nombre de slides.
- Un bouton `J'ai poste`.

Le VA doit:

1. Recuperer les PNG recus dans Telegram.
2. Publier les slides dans l'ordre sur Instagram.
3. Cliquer sur `J'ai poste`.

### 6.3 Confirmation

Quand le VA clique sur `J'ai poste`:

- Le bouton devient `Post confirme`.
- Le dashboard admin voit que le post est publie.
- Le suivi est enregistre.

## 7. Installation locale

Pre-requis:

- Node.js 20 ou plus.
- npm.
- Chromium ou Chrome pour Puppeteer.
- Un token bot Telegram.
- Optionnel: Gemini CLI.

Installation:

```bash
cd /Users/valerian/Documents/caroussel-gen
npm install
cp .env.example .env
```

Lancer le dashboard local:

```bash
npm start
```

Dashboard local:

```text
http://localhost:3000
```

Lancer le bot Telegram local:

```bash
npm run bot
```

Tester un rendu:

```bash
npm run test:render
```

## 8. Installation VPS

Sur le VPS:

```bash
git clone <repo-ou-copie-du-projet>
cd caroussel-gen
npm install
cp .env.example .env
```

Installer Chromium si necessaire:

```bash
sudo apt-get update
sudo apt-get install chromium-browser
```

Configurer `.env`, puis lancer:

```bash
npm run bot
```

Pour que le bot reste allume, utiliser PM2:

```bash
npm install -g pm2
pm2 start npm --name carousel-va-bot -- run bot
pm2 save
pm2 startup
```

Le dashboard peut rester sur Vercel. Le bot doit tourner sur VPS/local parce que Telegram polling et Gemini CLI ont besoin d'un process long-running.

## 9. Variables d'environnement

Fichier `.env` principal:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_AUTH_PASSWORD=change_me
TELEGRAM_AUTH_PATH=./data/telegram-auth.json
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
STATE_STORE=blob

ADMIN_USER=admin
ADMIN_PASSWORD=change_me
ADMIN_SESSION_SECRET=replace_with_a_long_random_string

PORT=3000
APP_TIME_ZONE=Europe/Paris
START_DAILY_SCHEDULER=false

OUTPUT_DIR=./output
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
DB_PATH=./data/carousel-gen.sqlite

ENABLE_DAILY_GENERATION=false
DAILY_GENERATION_TIME=09:00
DAILY_TEMPLATE_PATH=./templates/daily.template
DAILY_ACCOUNT_SLUG=account-1
DAILY_TOPIC=
DAILY_USE_GEMINI=false
DAILY_SEND_TELEGRAM=true
DAILY_TELEGRAM_CHAT_ID=
DAILY_JOBS_PATH=./data/daily-jobs.json
POST_TRACKING_PATH=./data/post-tracking.json

ENABLE_GEMINI_CLI=false
GEMINI_CLI_COMMAND=gemini
GEMINI_CLI_ARGS=-p
GEMINI_CLI_TIMEOUT_MS=120000

MCP_FORCE_ASYNC_GENERATION=false
PUPPETEER_NAVIGATION_TIMEOUT_MS=60000
```

### Variables importantes

`TELEGRAM_BOT_TOKEN`

Token du bot Telegram. A mettre uniquement sur local/VPS, pas sur Vercel.

`TELEGRAM_AUTH_PASSWORD`

Mot de passe que les VA envoient au bot pour activer leur chat.

`BLOB_READ_WRITE_TOKEN`

Token Vercel Blob. Permet de partager les images, ZIP, jobs, posts et chats entre Vercel et le bot local/VPS.

`STATE_STORE=blob`

Force le stockage d'etat dans Vercel Blob. Recommande si le dashboard est sur Vercel et le bot sur VPS.

`ADMIN_USER`, `ADMIN_PASSWORD`

Identifiants du dashboard admin.

`APP_TIME_ZONE`

Fuseau horaire du scheduler. Garder `Europe/Paris` si les jobs sont planifies en heure francaise.

`PUPPETEER_EXECUTABLE_PATH`

Chemin vers Chromium sur VPS.

`ENABLE_GEMINI_CLI`

Active l'utilisation de Gemini CLI pour generer les textes si le mode Gemini est CLI.

## 10. Vercel et Vercel Blob

Vercel sert le dashboard et le MCP HTTP.

Vercel Blob sert a stocker:

- Images uploadees.
- ZIP generes.
- PNG generes.
- Chats Telegram autorises.
- Comptes Instagram crees depuis le dashboard.
- Templates uploades depuis le dashboard.
- Jobs quotidiens.
- Suivi des posts.
- File d'envoi Telegram `telegram-outbox`.
- Configuration Gemini.

Le bot local/VPS et le dashboard Vercel doivent utiliser le meme `BLOB_READ_WRITE_TOKEN`.

Important:

- Ne pas mettre le bot Telegram sur Vercel.
- Ne pas mettre `TELEGRAM_BOT_TOKEN` sur Vercel si le bot tourne sur VPS.
- Le webhook Telegram Vercel est desactive.
- Le bot doit tourner en polling sur VPS/local.
- Le dashboard Vercel peut quand meme declencher un envoi manuel: il cree une demande dans Blob, puis le bot VPS/local l'execute.

## 11. Gemini

Gemini sert a reecrire les textes d'un carousel a partir d'un template.

Le template conserve:

- La DA.
- Les couleurs.
- Les polices.
- Les positions.
- Les annotations adaptatives.
- Les images si elles ne sont pas remplacees.

Gemini change surtout:

- Le titre.
- Le texte des slides.
- Le CTA.
- Les phrases entourees/soulignees si elles ont des tokens.

### 11.1 Gemini API dans le dashboard

Dans le dashboard admin, section `Generation IA`:

1. Coller une cle API Gemini.
2. Choisir le modele.
3. Cliquer sur `Connecter API`.

C'est le mode le plus simple pour Vercel.

### 11.2 Gemini CLI sur local/VPS

Sur la machine qui fait tourner le bot:

```bash
npm install -g @google/gemini-cli
gemini
```

Puis dans `.env`:

```env
GEMINI_MODE=cli
GEMINI_CLI_COMMAND=gemini
GEMINI_CLI_ARGS=-p
```

Le bot ne connecte pas Gemini lui-meme. Il utilise la session CLI deja connectee sur la machine.

Pourquoi?

- Gemini CLI a besoin d'un login OAuth terminal/navigateur.
- Telegram ne peut pas faire ce login a la place du serveur.
- Une fois le login Google termine dans `gemini` sur le VPS, les generations peuvent utiliser ce compte.

### 11.3 Quand utiliser API vs CLI

Utiliser Gemini API si:

- Le dashboard tourne sur Vercel.
- On veut une config simple.
- On a une cle API Google AI Studio.

Utiliser Gemini CLI si:

- Le bot tourne sur VPS/local.
- On veut utiliser le compte Gemini connecte en CLI.
- On accepte de lancer `gemini` une fois en terminal et de choisir `Login with Google`.

## 12. Templates `.template`

Un fichier `.template` est un JSON qui decrit:

- Les textes du carousel.
- Les slides.
- Les couleurs.
- Les polices.
- Les images.
- Les annotations.
- Les fleches et elements decoratifs.
- La DA du compte.

Exemple minimal:

```json
{
  "cover_title": "Un bebe epuise avec [[pain|pleurs constants]] au moment des siestes",
  "cover_subtitle": " ",
  "account_handle_override": "@bebenuitsfaciles",
  "da": {
    "background_color": "#87A8BC",
    "text_color": "#FFFFFF",
    "handle_color": "rgba(255,255,255,0.75)",
    "badge_bg": "#4A6270",
    "annotation_color": "#344146",
    "arrow_color": "#FFFFFF",
    "font_family": "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    "font_body": "'DM Sans', Arial, sans-serif",
    "title_font_size": "70px",
    "body_font_size": "66px",
    "handle_font_size": "30px",
    "line_height": "1.24"
  },
  "cover_marks": [
    {
      "kind": "circle",
      "token": "pain",
      "field": "cover_title",
      "text": "pleurs constants",
      "color": "#344146",
      "strokeWidth": 5,
      "rotation": -3,
      "opacity": 0.95
    }
  ],
  "slides": [
    {
      "title": "",
      "body": "Le probleme n'est pas toujours la routine. C'est souvent la dette de sommeil.",
      "marks": [],
      "elements": []
    }
  ],
  "cta_text": "Lis le guide complet",
  "cta_sub": "L'ebook sommeil bebe est dans la bio",
  "decorative_elements": [
    {
      "type": "arrow",
      "x": 50,
      "y": 84,
      "width": 135,
      "height": 28,
      "color": "#FFFFFF",
      "strokeWidth": 3,
      "opacity": 0.9
    }
  ]
}
```

### 12.1 Champs principaux

`cover_title`

Texte principal de la premiere slide.

`cover_subtitle`

Sous-titre de la premiere slide. Mettre `" "` si aucun sous-titre.

`slides`

Liste des slides de contenu.

`cta_text`

Titre de la derniere slide.

`cta_sub`

Sous-texte de la derniere slide.

`account_handle_override`

Handle affiche sur les slides, par exemple `@bebenuitsfaciles`.

`da`

Objet de direction artistique: couleurs, polices, tailles, etc.

### 12.2 Direction artistique `da`

Champs utiles:

```json
{
  "background_color": "#87A8BC",
  "cta_background_color": "#87A8BC",
  "accent_color": "#4A6270",
  "text_color": "#FFFFFF",
  "handle_color": "rgba(255,255,255,0.75)",
  "badge_bg": "#4A6270",
  "annotation_color": "#344146",
  "decoration_color": "rgba(157,189,202,0.45)",
  "arrow_color": "#FFFFFF",
  "font_family": "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
  "font_body": "'DM Sans', Arial, sans-serif",
  "google_fonts_url": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap",
  "title_font_size": "70px",
  "subtitle_font_size": "34px",
  "body_font_size": "66px",
  "content_title_font_size": "46px",
  "handle_font_size": "30px",
  "line_height": "1.24"
}
```

### 12.3 Annotations adaptatives

Les annotations adaptatives sont essentielles.

Elles permettent d'entourer ou souligner un mot, et si Gemini remplace ce mot par un segment plus long, le cercle/soulignement s'adapte automatiquement.

Syntaxes:

```text
[[token|texte visible]]
__token|texte visible__
```

Exemple:

```text
"Un bebe avec [[pain_point|pleurs constants]] et __goal|plus longtemps__."
```

Marks associes:

```json
[
  {
    "kind": "circle",
    "token": "pain_point",
    "field": "cover_title",
    "text": "pleurs constants",
    "color": "#344146",
    "strokeWidth": 5,
    "rotation": -3
  },
  {
    "kind": "underline",
    "token": "goal",
    "field": "cover_title",
    "text": "plus longtemps",
    "color": "#2D3134",
    "strokeWidth": 6,
    "rotation": -1.5
  }
]
```

Regle:

- Utiliser `marks` pour les annotations liees au texte.
- Utiliser `elements` seulement pour les dessins libres non lies a un mot.

### 12.4 Elements decoratifs

Elements supportes:

- `arrow`
- `circle`
- `ellipse`
- `line`
- `underline`
- `text`

Exemple:

```json
[
  {
    "type": "arrow",
    "x": 50,
    "y": 84,
    "width": 135,
    "height": 28,
    "color": "#FFFFFF",
    "strokeWidth": 3
  },
  {
    "type": "circle",
    "x": 75,
    "y": 18,
    "width": 180,
    "height": 90,
    "color": "#344146",
    "strokeWidth": 4,
    "rotation": -8,
    "opacity": 0.42
  }
]
```

`x` et `y` sont en pourcentage de la slide.
`width` et `height` sont en pixels.

### 12.5 Images dans les slides

Chaque slide peut avoir:

```json
{
  "image_url": "https://...",
  "image_position": "center",
  "image_frame": {
    "x": 50,
    "y": 32,
    "width": 80,
    "height": 28,
    "opacity": 0.32,
    "radius": 32
  }
}
```

`image_frame` controle la position exacte:

- `x`: centre horizontal en pourcentage.
- `y`: centre vertical en pourcentage.
- `width`: largeur en pourcentage de la slide.
- `height`: hauteur en pourcentage de la slide.
- `opacity`: transparence.
- `radius`: arrondi en pixels.

Le builder web permet de drag/resize les images dans l'aperçu.

## 13. Builder avance

URL:

```text
https://caroussel-gen.vercel.app/builder
```

Le builder sert a creer ou modifier un template de facon visuelle.

Il permet de:

- Modifier les textes.
- Modifier les couleurs.
- Choisir les polices.
- Regler les tailles de police.
- Ajouter des images.
- Deplacer/redimensionner les images.
- Ajouter des annotations.
- Ajouter des elements decoratifs.
- Importer/exporter un `.template`.

Le builder est plus puissant mais plus technique que le dashboard principal.
Le dashboard principal doit rester l'outil d'exploitation quotidien.

## 14. Doc IA

URL:

```text
https://caroussel-gen.vercel.app/doc
```

Cette page contient la specification complete des templates pour agents IA.

Elle explique:

- Les champs obligatoires.
- Les champs recommandes.
- Les annotations adaptatives.
- Les elements decoratifs.
- Les images.
- Le format legacy `canvas/elements`.
- Le workflow image concurrente.
- Les contraintes qualite.

Quand un agent IA doit creer un template, il doit suivre cette doc.

## 15. MCP

Le MCP permet a un agent IA d'utiliser CarouselGen comme outil.

Commande locale:

```bash
npm run mcp
```

Configuration MCP locale exemple:

```json
{
  "mcpServers": {
    "carousel-gen": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/Users/valerian/Documents/caroussel-gen"
    }
  }
}
```

Serveur MCP HTTP:

```bash
npm run mcp:http
```

URL MCP HTTP production:

```text
https://caroussel-gen.vercel.app/mcp
```

### 15.1 Outils MCP disponibles

`get_template_documentation`

Retourne la doc complete des `.template`. L'agent doit l'appeler avant de creer un template.

`draft_template_from_prompt`

Cree un brouillon de template depuis un prompt texte.

`create_template_from_reference`

Cree un template depuis une analyse d'image faite par l'agent IA.

`save_template`

Sauvegarde un template dans `saved-templates`.

`list_saved_templates`

Liste les templates sauvegardes.

`save_account_da`

Sauvegarde la direction artistique d'un compte.

`generate_carousel`

Genere un carousel depuis un template complet ou un prompt.

`generate_carousel_from_template`

Genere un carousel depuis un fichier `.template`.

`get_generation_job`

Recupere le resultat d'une generation asynchrone.

`list_generation_jobs`

Liste les jobs MCP recents.

`generate_many_carousels`

Genere plusieurs carousels en un seul appel.

### 15.2 Workflow MCP avec une image concurrente

Dans Claude, Poke ou un agent compatible vision + MCP:

1. Envoyer l'image concurrente a l'agent.
2. Demander a l'agent d'appeler `get_template_documentation`.
3. Demander a l'agent d'analyser l'image:
   - fond,
   - couleurs,
   - typo,
   - tailles,
   - placements,
   - annotations,
   - fleches,
   - handle,
   - images,
   - style global.
4. Demander a l'agent de creer un JSON `.template`.
5. Soit l'agent renvoie le JSON dans le chat.
6. Soit l'agent appelle `save_template` pour l'enregistrer.
7. Importer le `.template` dans le dashboard si besoin.
8. L'attribuer a un compte ou a un job quotidien.

Prompt exemple:

```text
Utilise le MCP CarouselGen.
Appelle d'abord get_template_documentation.
Analyse l'image que je viens d'envoyer.
Cree un template .template qui reprend fortement la DA, mais sans copier exactement.
Le compte cible est bebenuitsfaciles.
Le handle doit etre @bebenuitsfaciles.
Retourne le JSON seulement.
```

### 15.3 Timeout MCP

Si un client MCP timeout pendant une generation locale/VPS, utiliser:

```json
{
  "async_generation": true
}
```

L'outil renvoie un `job_id`.
L'agent doit ensuite appeler:

```text
get_generation_job
```

jusqu'a `status: done`.

Sur Vercel, l'async est ignore car les fonctions serverless ne garantissent pas les jobs en arriere-plan.

## 16. Generation quotidienne automatique

Le workflow normal:

1. Un compte existe dans le dashboard.
2. Un VA est connecte au bot.
3. Le VA est assigne au compte.
4. Un template est importe.
5. Un daily job est cree.
6. Le bot tourne sur VPS/local.
7. A l'heure prevue, le scheduler genere le carousel.
8. Le bot envoie les PNG au VA dans l'ordre.
9. Le VA poste sur Instagram.
10. Le VA clique `J'ai poste`.
11. Le dashboard affiche la confirmation.

Le scheduler evite de lancer le meme job plusieurs fois le meme jour grace au champ `last_date`.

## 17. Fichiers et dossiers importants

`src/telegram-bot.js`

Bot VA Telegram.

`src/scheduler.js`

Scheduler des jobs quotidiens.

`src/dashboard-app.js`

Serveur Express du dashboard.

`src/mcp-tools.js`

Liste des outils MCP.

`src/template-doc.js`

Doc template retournee au MCP et a `/doc`.

`src/renderer.js`

Rendu HTML/CSS vers PNG.

`dashboard/index.html`

Dashboard admin principal.

`dashboard/builder.html`

Builder avance.

`saved-templates/`

Templates sauvegardes.

`accounts/`

Comptes Instagram.

`output/`

Sorties locales de generation.

`data/`

Base SQLite et fichiers JSON locaux si Blob n'est pas utilise.

## 18. Templates fournis

Trois templates proches du style `mediacarous` sont inclus:

```text
saved-templates/global/mediacarous-blue.template
saved-templates/global/mediacarous-sage.template
saved-templates/global/mediacarous-rose.template
```

Ils reprennent:

- Fond doux.
- Grande typo serif.
- Texte blanc.
- Annotations manuscrites.
- Fleche basse.
- Handle discret.
- Variantes de couleurs et dessins.

## 19. Rendu et fichiers generes

Chaque generation cree:

- Des PNG: `slide-01.png`, `slide-02.png`, etc.
- Un ZIP: `carousel.zip`.

Si Vercel Blob est configure, les resultats ont aussi:

- `download_url`: lien direct vers le ZIP.
- `slide_urls`: liens directs vers les PNG.

Les fichiers locaux sont ranges dans:

```text
output/{timestamp}_{slug_du_titre}/{account_slug}/
```

## 20. Operations quotidiennes recommandees

Chaque matin:

1. Verifier que le bot VPS tourne.
2. Ouvrir le dashboard.
3. Regarder `Posts envoyes`.
4. Verifier quels VA ont clique `J'ai poste`.
5. Relancer manuellement si un post n'a pas ete envoye.

Chaque semaine:

1. Ajouter ou modifier les themes.
2. Importer de nouveaux templates.
3. Verifier les comptes assignes aux VA.
4. Tester une generation manuelle.

## 21. Troubleshooting

### Le VA ne recoit rien

Verifier:

- Le bot tourne bien avec `npm run bot`.
- Le VA a envoye le bon mot de passe.
- Le VA apparait dans le dashboard.
- Le VA est assigne au compte.
- Le daily job a un compte, un template et une heure.
- Le token Telegram est correct.

### Le dashboard ne voit pas le VA

Verifier:

- `BLOB_READ_WRITE_TOKEN` est le meme sur Vercel et sur le VPS/local.
- `STATE_STORE=blob` est actif.
- Le bot a ete redemarre apres modification du `.env`.

### Le bot ne demarre pas

Verifier:

```bash
TELEGRAM_BOT_TOKEN
```

Verifier qu'il n'y a pas deja une autre instance du bot:

```bash
pkill -f "src/telegram-bot.js"
npm run bot
```

Telegram n'autorise qu'un seul polling actif par bot.

### Gemini CLI ne marche pas

Verifier:

```bash
gemini --version
gemini
```

Puis verifier `.env`:

```env
ENABLE_GEMINI_CLI=true
GEMINI_CLI_COMMAND=gemini
GEMINI_CLI_ARGS=-p
```

### Puppeteer ne rend pas les slides sur VPS

Verifier Chromium:

```bash
which chromium-browser
```

Puis `.env`:

```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Le MCP timeout

Utiliser `async_generation=true` en local/VPS, puis `get_generation_job`.

### Le template ne s'affiche pas bien

Verifier:

- Les champs `cover_title`, `slides`, `cta_text`.
- Les tailles de police.
- Les couleurs.
- Les `marks`.
- Les `image_frame`.
- Les elements decoratifs.

Utiliser `/builder` pour inspecter visuellement.

## 22. Regles d'exploitation

- Les VA ne doivent pas avoir le login admin.
- Le bot Telegram ne doit pas gerer Gemini, templates ou jobs.
- Les templates doivent etre testes avant d'etre mis en daily.
- Les annotations liees au texte doivent utiliser `marks`, pas des cercles fixes.
- Le bot doit tourner sur un process long-running.
- Vercel sert le dashboard/MCP, pas le bot.
- Les secrets ne doivent pas etre colles dans des conversations publiques.

## 23. Resume rapide pour un collegue

1. Va sur le dashboard admin.
2. Connecte-toi avec le login admin.
3. Verifie que le VA est connecte au bot.
4. Cree ou selectionne un compte Instagram.
5. Attribue le VA au compte.
6. Importe un `.template`.
7. Cree un daily job avec compte + VA + template + heure + theme.
8. Laisse le bot tourner sur VPS.
9. Le VA recoit les PNG chaque jour.
10. Le VA poste sur Instagram et clique `J'ai poste`.
11. Tu verifies la confirmation dans le dashboard.
