# Liste d'Améliorations Architecturales et Fonctionnelles - Audiolab v3.0

Après une revue approfondie du code source d'**Audiolab (v3.0)**, nous avons identifié plusieurs axes clés d'amélioration et d'optimisation répartis par couches techniques (IA, UI/UX, Backend et Sécurité). Ces propositions visent à élever la plateforme vers un niveau d'excellence taillé pour la production d'entreprise.

---

## 1. Améliorations de l'Intelligence Artificielle & Résilience

### 1.1 Diarisation Acoustique Émotionnelle (Acoustic Tone & Emotion Diarization)
*   **Problème actuel** : L'analyse est essentiellement basée sur le contenu textuel découlant de la transcription (text-only sentiment), ignorant les attributs vocaux physiques du locuteur. Une phrase comme *"Oui, très bien"* dite sur un ton sarcastique ou frustré est mal classifiée.
*   **Solution proposée** : Exploiter la nature nativement multimodale de Gemini pour analyser directement le signal vocal (fréquence, pauses, volume, intonation). L'API évaluera et injectera des marqueurs émotionnels par tour de parole (ex : `frustration`, `hesitation`, `satisfaction`, `neutral`) ainsi que le ratio de chevauchement de parole (coupures de parole intempestives de l'agent) pour un audit CX d'une précision inédite.

---

## 2. Optimisations UI/UX & Fonctionnalités Client

### 2.1 Rendu interactif de la forme d'onde sans blocage CPU (Real Waveform & Server-Side Peak Extraction)
*   **Problème actuel** : La forme d'onde affichée est factice. Si nous intégrons `wavesurfer.js` pour décoder de gros fichiers de 50 Mo sur des navigateurs mobiles, le décodage PCM local va geler le thread d'affichage (INP élevé).
*   **Solution proposée** : Charger le fichier audio via une balise HTML5 `<audio>` standard en streaming progressif, et faire générer les pics audio (*waveform peaks*) côté serveur Express lors du traitement initial. Le client React reçoit ce mini-tableau JSON de pics pré-calculés et dessine la forme d'onde sur un canevas léger sans décompresser localement le binaire audio.


### 2.2 Lecteur Audio avancé & Contrôle de Vitesse
*   **Problème actuel** : L'élément `<audio>` natif est invisible et l'utilisateur ne dispose que d'un bouton Play/Pause global très simple.
*   **Solution proposée** : Créer un panneau de contrôle audio riche dans le pied de page :
    *   Curseur de vitesse de lecture ajustable (0.75x pour décortiquer les articulations complexes, 1.5x/2.0x pour survoler rapidement les appels longs).
    *   Boutons de saut rapide (Reculer/Avancer de 5 secondes).
    *   Filtre d'atténuation du bruit ambiant côté client en connectant un nœud d'égalisation `BiquadFilterNode` de l'API Web Audio pour clarifier les voix sourdes.

### 2.3 Recherche multicritères dans le dialogue
*   **Problème actuel** : Si une conversation comporte plus de 50 tours de parole, il devient difficile de naviguer manuellement pour localiser un passage précis.
*   **Solution proposée** : Ajouter une barre de recherche au-dessus de `TranscriptList` permettant de filtrer les tours par mot-clé, par locuteur (Agent vs Client), ou par niveau de clarté technique (ex : afficher uniquement les tours ayant une note inférieure à 5/10 pour repérer les anomalies micro).

### 2.4 Exportation des rapports multiformats
*   **Problème actuel** : L'archivage est uniquement disponible en base Firestore. Il est impossible d'envoyer le rapport à un tiers externe.
*   **Solution proposée** : Ajouter un menu "Exporter" proposant :
    *   **PDF** : Un rapport d'audit soigné et imprimable intégrant les graphiques de performances et la liste des manquements CX.
    *   **CSV/Excel** : Pour importer les statistiques vocales et temporelles dans les outils de Business Intelligence de l'entreprise.
    *   **JSON** : Pour interconnecter Audiolab avec d'autres systèmes de gestion d'appels clients.

### 2.5 Carte Thermique Émotionnelle & Saut aux Zones de Friction (Sentiment Heatmap Timeline)
*   **Problème actuel** : Pour identifier les points noirs ou les conflits dans un appel de 45 minutes, un superviseur de centre de contact doit écouter l'intégralité de la bande-son ou faire défiler manuellement de longs transcriptions textuelles.
*   **Solution proposée** : Dessiner une **carte thermique interactive** (Heatmap) superposée à la ligne temporelle du lecteur audio. Les zones de tension (frustration client détectée en 1.4) sont colorées en rouge/orange, tandis que les résolutions ou moments positifs sont colorés en vert. Le superviseur peut d'un simple clic sauter immédiatement à l'instant exact de la friction sonore pour évaluer la réaction de l'agent.

---

## 3. Améliorations Backend & Base de données

### 3.1 Tri direct par Index Firestore
*   **Problème actuel** : Pour s'affranchir de la création préalable d'un index composite complexe en phase de test, la fonction `subscribeToUserAnalyses` filtre par UID propriétaire puis trie les documents côté client :
    `results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());`
    Si un utilisateur cumule plusieurs centaines d'analyses, cette opération client-side pénalise les performances mobiles et consomme inutilement du processeur.
*   **Solution proposée** : Définir un index composite Firestore (`ownerId` ASC, `createdAt` DESC) et modifier le pipeline de requête Firebase pour appliquer le tri nativement sur les serveurs de Google :
    ```typescript
    const q = query(
      collection(db, path),
      where("ownerId", "==", userId),
      orderBy("createdAt", "desc")
    );
    ```

### 3.2 Téléversement Streamé par tranches (Chunked Uploads)
*   **Problème actuel** : La transmission de l'audio s'effectue en une seule requête POST massive via une chaîne JSON Base64 (`audioData`). Sur des connexions mobiles instables, cela peut causer des pannes de mémoire réseau (Erreurs HTTP 413 ou timeouts).
*   **Solution proposée** : Configurer un endpoint de téléversement multipart (via un middleware Node comme `multer`). L'audio est alors découpé en flux binaire de streaming vers le serveur Express qui l'écrit directement sur le disque, garantissant une empreinte mémoire constante et la possibilité de reprendre un upload interrompu.

### 3.3 Persistance des tâches & Gestion du Cycle de vie Serverless (GCP Cloud Tasks integration)
*   **Problème actuel** : Gérer les processus d'analyse en mémoire vive via une `Map` locale expose aux pertes de tâches en cas de crash. Cependant, faire tourner des threads asynchrones longs en tâche de fond sur Cloud Run échouera, car GCP **coupe et gèle instantanément les instances** dès qu'aucune requête HTTP n'est activement en attente de réponse (Scale-to-Zero).
*   **Solution proposée** : Persister le statut des tâches dans une collection Firestore `/tasks` et déléguer l'exécution de fond à **Google Cloud Tasks**. Le serveur Express envoie une tâche asynchrone dans la file d'attente Cloud Tasks et répond `202 Accepted`. Cloud Tasks appelle ensuite un endpoint de traitement dédié (`POST /api/process`) sur Cloud Run, maintenant la connexion HTTP active durant tout le travail de l'IA et évitant le gel de l'instance.

### 3.4 Archivage et Stockage Sécurisé des Fichiers Audio (Secure User-Isolated Cloud Storage)
*   **Problème actuel** : Les fichiers audio WAV ne sont pas archivés de manière persistante pour l'utilisateur. Ils transitent temporairement par la RAM/disque du serveur ou les serveurs de Gemini et sont détruits post-analyse. L'utilisateur ne peut pas ré-écouter son appel plus tard ou télécharger le fichier source lié au rapport d'audit.
*   **Solution proposée** : Mettre en place un bucket privé **Google Cloud Storage (GCS)** structuré selon l'identité de l'utilisateur : `gs://audiolab-archives/{ownerId}/{analysisId}.wav`. 
    *   Le bucket est configuré avec des règles d'accès privées strictes (aucun accès public).
    *   Pour lire ou ré-écouter l'audio sur le client React, l'API Express génère une **URL signée GCS temporaire** (expire après 15 minutes) après avoir formellement vérifié le jeton JWT Firebase Auth de l'utilisateur et validé que celui-ci est bien le propriétaire du rapport dans Firestore (`ownerId == request.auth.uid`). Cela garantit que **seul l'utilisateur propriétaire** peut un jour accéder au fichier binaire audio.

---

## 4. Sécurité & Robustesse Applicative

### 4.1 Validation binaire des fichiers WAV
*   **Problème actuel** : Le serveur Express fait confiance à l'extension déclarée ou au type MIME client, et convertit tout flux Base64 en fichier `.wav`. Un fichier malveillant masqué pourrait être téléversé et exécuté en tant que faille de dépassement de tampon ou empoisonner les serveurs temporaires de Gemini.
*   **Solution proposée** : Analyser les premiers octets (Magic Bytes) du binaire reçu côté serveur pour s'assurer de la présence de la signature standard de l'en-tête WAV PCM (`"RIFF"` à l'offset 0 et `"WAVE"` à l'offset 8).

### 4.2 Limitation du débit d'appels (Rate Limiting)
*   **Problème actuel** : L'API `/api/analyze` n'est pas protégée contre les attaques par force brute ou d'inondation de requêtes (DDoS), ce qui peut faire exploser la facturation de l'API Gemini.
*   **Solution proposée** : Installer le middleware `express-rate-limit` et limiter l'accès à un quota raisonnable par adresse IP (ex : maximum 5 analyses par tranche de 15 minutes) :
    ```typescript
    import rateLimit from 'express-rate-limit';
    
    const analyzeLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: "Trop de requêtes d'analyse. Veuillez réessayer dans 15 minutes." }
    });
    app.use('/api/analyze', analyzeLimiter);
    ```

### 4.3 Nettoyage automatique de l'API Gemini Files (Files API Garbage Collector)
*   **Problème actuel** : L'application supprime le fichier binaire WAV sur l'API Files de Gemini (`ai.files.delete`) uniquement dans la clause `finally` de `server.ts`. Si l'instance subit un crash inopiné ou un redémarrage durant le traitement, cette clause de nettoyage n'est pas appelée. Les fichiers confidentiels des clients restent stockés de manière permanente dans le cloud temporaire de Google.
*   **Solution proposée** : Mettre en place une tâche cron automatisée (via GCP Cloud Scheduler ou un script d'initialisation) qui liste périodiquement les fichiers du projet dans l'API Gemini Files et supprime systématiquement tout binaire présent depuis plus de 2 heures pour garantir une confidentialité absolue.

### 4.4 Lissage de Charge et Résilience face aux Quotas (Gemini Rate Limit Backoff)
*   **Problème actuel** : En cas de charge soudaine ou de pic d'appels, le plan API de Gemini peut lever des erreurs `429 Too Many Requests`, provoquant l'échec immédiat de l'analyse pour l'utilisateur.
*   **Solution proposée** : Implémenter un algorithme de retry automatique avec **Backoff Exponentiel** et Gigue (jitter) dans le wrapper de requêtes IA de `server.ts`, permettant de temporiser intelligemment les requêtes rejetées et d'offrir une résilience optimale face aux limites de quotas de l'API.
