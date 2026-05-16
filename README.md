# Carousel Generator

MVP Node.js pour generer des carousels Instagram a partir de templates HTML/CSS fixes. Le rendu passe par Puppeteer, produit des PNG finaux 1080x1080, puis cree un ZIP par compte.

Documentation complete du logiciel: [docs/doc_carous.md](docs/doc_carous.md)

## Stack

- Node.js 20+
- Puppeteer
- Express
- better-sqlite3
- node-telegram-bot-api
- archiver
- dotenv
- sharp

## Installation locale

```bash
npm install
cp .env.example .env
npm start
```

Dashboard: `http://localhost:3000`

La page principale sert au pilotage simple: comptes Instagram, VA Telegram, jobs quotidiens, generation + envoi au bot et suivi des posts confirmes. Le builder avance est sur `/builder`, et la doc JSON pour agents IA est sur `/doc`.

Le dashboard local ne lance pas l'automation quotidienne par defaut. Pour Telegram et les daily jobs, lance aussi `npm run bot`.

Le dashboard est protege par login admin. Configure:

```env
ADMIN_USER=admin
ADMIN_PASSWORD=change_me
ADMIN_SESSION_SECRET=long_random_secret
```

Dashboard Vercel:

```text
https://caroussel-gen.vercel.app/
```

Pour tester une generation sans passer par le dashboard:

```bash
npm run test:render
```

## Configuration

Edite `.env`:

```bash
# Local/VPS only. Do not configure these on Vercel.
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_AUTH_PASSWORD=change_me
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
JSON_STORE_USE_BLOB=false
PORT=3000
OUTPUT_DIR=./output
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
DB_PATH=./data/carousel-gen.sqlite
ENABLE_DAILY_GENERATION=false
DAILY_GENERATION_TIME=09:00
DAILY_TEMPLATE_PATH=./templates/daily.template
DAILY_ACCOUNT_SLUG=account-1
DAILY_USE_GEMINI=false
DAILY_SEND_TELEGRAM=true
ENABLE_GEMINI_CLI=false
GEMINI_CLI_COMMAND=gemini
GEMINI_CLI_ARGS=-p
PUPPETEER_NAVIGATION_TIMEOUT_MS=60000
```

Edite les comptes dans `accounts/account-1.json` et `accounts/account-2.json`:

- `slug`: identifiant technique du compte
- `name`: nom lisible
- `handle`: handle affiche en bas des slides
- `telegram_chat_id`: optionnel, seulement si tu veux encore forcer une destination Telegram par compte
- `da`: couleurs, police, Google Fonts et symboles decoratifs

## Personnalisation dashboard

Le dashboard permet maintenant de modifier avant generation:

- couleurs de fond, couleur CTA, accent, texte
- police parmi les presets fournis
- tailles de texte: titre, sous-titre, corps, handle
- bullet decoratif
- override du handle affiche en bas des slides
- image de cover, image par slide, image CTA
- position d'image et mode `cover` ou `contain`
- elements decoratifs JSON: fleches, cercles, lignes, texte

Les images peuvent etre ajoutees par URL ou par upload local.

Quand `BLOB_READ_WRITE_TOKEN` est defini, les images uploades et les fichiers generes sont aussi publies sur Vercel Blob et les resultats MCP renvoient des URLs Blob publiques.

L'aperçu live du dashboard se met a jour pendant la saisie. Il est indicatif pour travailler vite; le rendu final reste celui des templates HTML dans `templates/`.

## Templates exportables

Le bouton `Export .template` telecharge un JSON complet avec contenu, DA et images:

```text
mon-carousel.template
```

Le bouton `Import .template` recharge ce fichier dans le formulaire. Le format est volontairement du JSON lisible pour pouvoir le versionner ou l'editer a la main.

Trois templates proches de la reference `mediacarous.jpg` sont fournis:

- `saved-templates/global/mediacarous-blue.template`
- `saved-templates/global/mediacarous-sage.template`
- `saved-templates/global/mediacarous-rose.template`

## Annotations manuscrites

Dans les champs texte, deux syntaxes sont supportees:

- `[[texte]]` entoure le texte avec une ellipse manuscrite.
- `__texte__` souligne le texte avec un trait epais manuscrit.
- `[[token|texte]]` et `__token|texte__` font la meme chose en liant l'annotation a un token stable. C'est le format le plus robuste pour l'IA: elle peut remplacer `texte` par un segment plus long tout en gardant le meme style.

Exemple:

```text
Stop [[constant crying]] before bedtime __tonight__
```

## Elements decoratifs

Ajoute des elements globaux avec le champ `decorative_elements`. Ils sont ajoutes sur toutes les slides.
Les memes objets peuvent aussi etre mis dans `cover_elements`, `cta_elements` ou `slides[n].elements`.

```json
[
  {
    "type": "arrow",
    "x": 50,
    "y": 82,
    "width": 140,
    "height": 28,
    "rotation": 0,
    "color": "#FFFFFF",
    "opacity": 1
  },
  {
    "type": "circle",
    "x": 50,
    "y": 51,
    "width": 280,
    "height": 90,
    "rotation": -3,
    "color": "#3D2B1F",
    "opacity": 0.9
  }
]
```

Types supportes:

- `arrow`: fleche horizontale vers la droite
- `circle`: ellipse manuscrite
- `line` ou `underline`: trait epais
- `text`: petit texte libre avec `label`

Les champs `x` et `y` sont en pourcentage de la slide. `width` et `height` sont en pixels.

## API REST

`GET /api/carousels`

Liste les 20 derniers carousels generes.

`GET /api/carousels/:id/download`

Telecharge le ZIP du carousel.

`POST /api/generate`

Genere un carousel pour tous les comptes.

```json
{
  "cover_title": "Sommeil de bebe",
  "cover_subtitle": "3 reperes simples pour des nuits plus calmes",
  "account_handle_override": "@beatrice.bebe",
  "image_fit": "cover",
  "da": {
    "background_color": "#7A9BAD",
    "cta_background_color": "#7A9BAD",
    "accent_color": "#4A6270",
    "text_color": "#FFFFFF",
    "handle_color": "rgba(255,255,255,0.75)",
    "badge_bg": "#4A6270",
    "annotation_color": "#3D2B1F",
    "decoration_color": "rgba(157,189,202,0.45)",
    "arrow_color": "#FFFFFF",
    "bullet_icon": "✦",
    "font_family": "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    "font_body": "'DM Sans', Arial, sans-serif",
    "google_fonts_url": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap",
    "font_size_main": "72px",
    "line_height": "1.28"
  },
  "decorative_elements": [
    { "type": "arrow", "x": 50, "y": 82, "width": 140, "height": 28, "color": "#FFFFFF" }
  ],
  "cover_image_url": "",
  "cover_image_position": "center",
  "slides": [
    {
      "title": "Un rythme lisible",
      "body": "Garde des heures proches chaque jour.",
      "image_url": "",
      "image_position": "center"
    }
  ],
  "cta_text": "Lis le guide complet",
  "cta_sub": "Le lien de l ebook sommeil bebe est dans la bio",
  "cta_image_url": "",
  "cta_image_position": "center"
}
```

`GET /api/status`

Retourne les stats globales et le dernier run.

`GET /api/scheduler/status`

Retourne l'etat du scheduler quotidien.

## Serveur MCP

Le projet expose un serveur MCP pour permettre a une IA compatible MCP de generer des carousels directement.

Commande:

```bash
npm run mcp
```

Exemple de configuration MCP:

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

Tools MCP exposes:

- `draft_template_from_prompt`: transforme un brief en JSON `.template` sans rendre les images.
- `create_template_from_reference`: cree un template depuis l'analyse visuelle d'une image concurrente faite par l'IA hote, et peut le sauvegarder.
- `save_template`: sauvegarde un template dans `saved-templates/{account_slug}/`.
- `list_saved_templates`: liste les templates sauvegardes.
- `save_account_da`: enregistre la DA d'un compte dans `accounts/{account_slug}.json`.
- `generate_carousel`: genere depuis un `template` complet ou depuis `prompt` + `overrides`.
- `generate_carousel_from_template`: lit un fichier `.template` local et genere les PNG + ZIP.
- `get_generation_job`: recupere le resultat d'une generation lancee avec `async_generation: true`.
- `list_generation_jobs`: liste les jobs MCP recents.
- `generate_many_carousels`: genere plusieurs posts en une seule demande.

Les tools de generation renvoient maintenant:

- `download_url`: URL HTTP directe vers le ZIP.
- `slide_urls`: URLs HTTP directes vers les PNG.
- `zip_file_id` et `slide_file_ids`: IDs internes pour `/files/:id`.

Exemple:

```json
{
  "download_url": "https://caroussel-gen.vercel.app/files/...",
  "slide_urls": [
    "https://caroussel-gen.vercel.app/files/..."
  ]
}
```

En local ou sur un serveur Node long-running, si un client MCP timeout pendant la generation, appelle les tools avec:

```json
{
  "async_generation": true
}
```

Le tool repond vite avec un `job_id`. Poll ensuite `get_generation_job` jusqu'a `status: "done"`.

Sur Vercel, `async_generation` est ignore volontairement: le runtime serverless ne garantit pas les jobs en arriere-plan apres la reponse HTTP. La prod utilise plutot le rendu optimise et `maxDuration: 300`.

Exemple de prompt cote IA:

```text
Utilise l'outil generate_carousel avec ce prompt:
Carousel sur les reveils nocturnes bebe
Point 1: Pourquoi le soir declenche plus de pleurs
Point 2: Le signal a observer avant les pleurs
Point 3: Le rituel court a tester
```

### Workflow image concurrente

Dans Claude ou une autre IA compatible vision + MCP:

1. Envoie l'image du post concurrent.
2. Demande a l'IA d'analyser le style: couleurs, typo, placements, annotations, formes, fleches.
3. Demande-lui d'appeler `create_template_from_reference` avec:
   - `prompt`: le sujet du nouveau post
   - `reference_notes`: son analyse de l'image
   - `account_slug`: le compte cible
   - `save: true`
4. L'outil renvoie le JSON `.template` dans le chat et le sauvegarde localement.
5. Demande ensuite `generate_carousel_from_template` ou `generate_many_carousels`.

Le MCP ne fait pas lui-meme la vision: Claude/GPT analyse l'image, puis transmet les notes visuelles a l'outil.

### MCP HTTP / Vercel

Un serveur Streamable HTTP est aussi disponible:

```bash
npm run mcp:http
```

URL locale: `http://localhost:3333/mcp`

Le projet est deployee sur Vercel ici:

```text
https://caroussel-gen.vercel.app/mcp
```

Les fichiers generes sont servis ici:

```text
https://caroussel-gen.vercel.app/files/{file_id}
```

Healthcheck:

```bash
curl https://caroussel-gen.vercel.app/health
```

Important: sur Vercel, les PNG/ZIP generes sont stockes sur Vercel Blob quand `BLOB_READ_WRITE_TOKEN` est configure. Les comptes crees depuis le dashboard, les templates uploades, les chats VA, les jobs quotidiens, le suivi des posts et la file d'envoi Telegram sont aussi persistes via Blob quand `STATE_STORE=blob`.

## Generation quotidienne

Le scheduler peut generer un post par jour a partir d'un fichier `.template`, pour un compte precis ou tous les comptes.

1. Exporte un template depuis le dashboard.
2. Place-le par exemple dans `templates/daily.template`.
3. Active dans `.env`:

```bash
ENABLE_DAILY_GENERATION=true
DAILY_GENERATION_TIME=09:00
DAILY_TEMPLATE_PATH=./templates/daily.template
DAILY_ACCOUNT_SLUG=account-1
```

Au lancement du serveur ou du bot Telegram, le scheduler verifie l'heure toutes les minutes et genere une seule fois par date.

Pour utiliser Gemini CLI comme source de textes:

```bash
npm install -g @google/gemini-cli
gemini
GEMINI_MODE=cli
DAILY_USE_GEMINI=true
DAILY_TOPIC="Sommeil bebe: reveils nocturnes"
```

Puis dans Telegram:

```text
Le bot Telegram ne sert pas a configurer Gemini.
Configure Gemini dans le dashboard admin ou dans .env.
```

Le code appelle `gemini -p "<prompt>"` par defaut. Si ton CLI a une syntaxe differente, ajuste `GEMINI_CLI_COMMAND` et `GEMINI_CLI_ARGS`. Exemple avec placeholder:

```bash
GEMINI_CLI_ARGS='--prompt "{prompt}"'
```

Sur Vercel, le login CLI interactif n'est pas fiable car les fonctions serverless ne gardent pas une session shell persistante. Utilise une cle API Google AI Studio via le dashboard ou `GEMINI_API_KEY` si tu veux Gemini cote dashboard/MCP. Pour utiliser ton compte Gemini connecte en CLI, lance le dashboard et le bot sur ton Mac/VPS.

## Telegram local/VPS

Telegram ne tourne plus sur Vercel: pas de webhook `/api/telegram/webhook`, pas de cron Telegram, et pas besoin de `TELEGRAM_BOT_TOKEN` dans les variables Vercel. Lance le bot sur ta machine ou sur un VPS long-running:

```bash
npm run bot
```

Au premier contact avec le bot, envoie le mot de passe configure dans `TELEGRAM_AUTH_PASSWORD`.
Le chat est ensuite memorise dans `data/telegram-auth.json`; plus besoin de `telegram_chat_id` dans les comptes.

Le scheduler quotidien tourne dans ce processus Node avec `setInterval` et verifie les jobs toutes les minutes. Garde donc `npm run bot` actif via PM2/systemd sur VPS pour les automatisations Telegram.

Si tu veux lancer le scheduler depuis le dashboard sans Telegram, mets `START_DAILY_SCHEDULER=true`; evite de l'activer en meme temps que `npm run bot`.

Le dashboard et le MCP peuvent rester sur Vercel sans Telegram; ils continuent d'utiliser `/api/app` et `/api/mcp`.
Si tu veux que le dashboard Vercel lise les memes comptes/templates/chats/jobs/posts que le bot local/VPS, mets le meme `BLOB_READ_WRITE_TOKEN` dans les deux environnements et `STATE_STORE=blob` cote local/VPS.
Par defaut, si `BLOB_READ_WRITE_TOKEN` existe, les etats JSON du bot utilisent Blob. Mets `STATE_STORE=local` seulement si tu veux forcer le stockage local.

Quand le dashboard Vercel lance `Generer et envoyer`, il n'appelle pas Telegram directement. Il cree une demande dans la file Blob `telegram-outbox`; le bot local/VPS la recupere, genere le carousel, envoie les PNG au VA dans l'ordre, puis cree la tache de suivi avec le bouton `J'ai poste`.

Le bot Telegram est volontairement limite au role VA. Toute la configuration admin se fait dans le dashboard.

Commandes VA:

- `/start` ou `/menu`: affiche le menu VA.
- `/mes_comptes`, `/my_accounts` ou `/comptes`: liste les comptes attribues au VA.
- `/aide` ou `/help`: explique le workflow VA.
- `/logout`: retire l'autorisation du chat.

Chaque carousel envoye par le bot contient les PNG dans l'ordre puis un bouton `J'ai poste`. Quand le VA clique dessus, le dashboard passe le post en statut `posted`.

Les generations manuelles, les jobs quotidiens, les templates et Gemini se pilotent depuis le dashboard admin.

## Installation VPS

1. Installer Node.js 20+.
2. Installer les dependances:

```bash
npm install
```

3. Installer Chromium si necessaire:

```bash
sudo apt-get update
sudo apt-get install chromium-browser
```

4. Copier la configuration:

```bash
cp .env.example .env
```

5. Remplir `.env`, notamment `TELEGRAM_BOT_TOKEN` et `PUPPETEER_EXECUTABLE_PATH`.
6. Adapter `accounts/account-1.json` et `accounts/account-2.json`.
7. Lancer le dashboard et le bot:

```bash
node src/dashboard.js
npm run bot
```

## PM2

Le fichier `ecosystem.config.js` est fourni.

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Sorties

Chaque generation cree un dossier:

```text
output/{timestamp}_{cover_title_slug}/{account_slug}/
```

Il contient:

- `slide-01.png`, `slide-02.png`, etc.
- `carousel.zip`

La base SQLite est creee automatiquement dans `data/carousel-gen.sqlite`.
