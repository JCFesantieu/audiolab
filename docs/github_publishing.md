# Guide de Publication Publique sur GitHub - Audiolab v3.0

Ce guide regroupe les meilleures pratiques de sécurité et d'hygiène de code pour publier le dépôt **Audiolab** sur **GitHub** de manière publique en évitant toute fuite d'identifiants ou usurpation de ressources.

---

## 1. Hygiène des Secrets : Ce qu'il ne faut JAMAIS commettre

Avant de rendre votre dépôt public sur GitHub, assurez-vous qu'aucun fichier sensible ne fasse partie de l'historique Git.

### 1.1 Fichiers bloqués par `.gitignore`
Vérifiez que les fichiers suivants sont bien ignorés (notre fichier `.gitignore` a été pré-configuré pour cela) :
*   `.env` : Contient votre clé d'API Gemini locale.
*   `dist/` et `node_modules/` : Code compilé et paquets locaux.
*   `server.log` et `*.log` : Journaux d'exécution pouvant contenir des traces de requêtes et de données utilisateurs.

---

## 2. Gestion de la Configuration Firebase

### 2.1 Les clés d'API Firebase sont-elles sensibles ?
Les clés de configuration contenues dans `firebase-applet-config.json` (comme l'API Key Firebase ou l'App ID) ne sont pas des secrets de sécurité critiques. Elles sont conçues pour être chargées publiquement dans le navigateur de l'utilisateur afin d'établir la connexion avec les serveurs Cloud de Google Firebase. 

> [!CAUTION]
> **Le Risque d'Usurpation de Base de Données :**
> Si vous publiez le fichier `firebase-applet-config.json` tel quel sur GitHub, n'importe quel développeur qui clone votre projet écrira et lira directement sur **votre** base de données Firestore. Cela peut saturer vos quotas d'utilisation et corrompre vos données d'analyse historique.

### 2.2 Recommandation pour la Publication Publique :
1.  **Utiliser le Gabarit** : Nous avons créé le fichier gabarit [firebase-applet-config.json.example](file:///Users/jcfesantieu/devlocal/Remix/firebase-applet-config.json.example).
2.  **Ignorer le fichier de configuration local** : Ajoutez `firebase-applet-config.json` à votre fichier `.gitignore` personnel si vous souhaitez que vos identifiants Firebase restent privés. Les utilisateurs clonant votre projet devront simplement copier le gabarit et renseigner leurs propres clés.
3.  **Garantir la sécurité par les Règles Firestore** : Nos règles de sécurité durcies répertoriées dans [firestore.rules](file:///Users/jcfesantieu/devlocal/Remix/firestore.rules) (email vérifié requis, vérification stricte de l'identité du propriétaire sur chaque document) garantissent qu'aucun utilisateur externe ne pourra corrompre les données historiques d'un autre utilisateur, même s'ils partagent la même base Firestore de démonstration.

---

## 3. Purger les secrets de l'Historique Git (Si nécessaire)

Si vous avez accidentellement validé une clé d'API (comme `GEMINI_API_KEY`) dans un commit antérieur, changer simplement le fichier et refaire un commit **ne suffit pas**. Le secret reste visible dans l'historique des commits.

### Procédure de purge complète (Git Filter-Repo) :
1.  Installez l'outil officiel recommandé par GitHub, `git-filter-repo` (exige Python) :
    ```bash
    brew install git-filter-repo
    ```
2.  Purgez toute mention de votre clé d'API de l'historique de l'ensemble de vos branches :
    ```bash
    git filter-repo --invert-paths --path .env
    ```
3.  Si vous devez réécrire du texte spécifique (comme une clé en clair insérée dans un code TS) :
    Créez un fichier `expressions.txt` contenant la clé à effacer, puis lancez :
    ```bash
    git filter-repo --replace-text expressions.txt
    ```
4.  Forcez la mise à jour de votre dépôt distant (Attention : cela réécrit l'historique des commits) :
    ```bash
    git push origin --force --all
    ```

---

## 4. Protection Continue : Outils de Scan de Secrets

### 4.1 Prévention Locale : Gitleaks en Pré-Commit
Pour éviter d'insérer par mégarde un secret dans le futur, configurez un scan automatique local avant chaque commit :
1.  Installez **Gitleaks** sur votre machine :
    ```bash
    brew install gitleaks
    ```
2.  Activez le hook de pre-commit dans votre dépôt :
    ```bash
    gitleaks detect --verbose
    ```

### 4.2 Automatisation GitHub : Actions & Push Protection
1.  **CI Pipeline de Sécurité** : Nous avons configuré un workflow GitHub Actions à l'adresse [.github/workflows/security.yml](file:///Users/jcfesantieu/devlocal/Remix/.github/workflows/security.yml). Il exécutera automatiquement un scan Gitleaks complet sur chaque Push ou Pull Request.
2.  **Activer la "Push Protection" de GitHub** :
    *   Rendez-vous sur votre dépôt GitHub public.
    *   Allez dans **Settings > Code security and analysis**.
    *   Activez **Secret scanning** et cochez **Push protection**.
    *   *Effet* : Si vous tentez de pousser un commit contenant un secret en clair (clé AWS, clé Gemini, clé Firebase), GitHub bloquera immédiatement le push et vous demandera de corriger le code avant acceptation.

---

## 5. Rendre le Dépôt Public sur GitHub

Une fois l'historique nettoyé et validé par notre pipeline de build local, suivez ces étapes :
1.  Créez un nouveau dépôt public sur GitHub sans l'initialiser (pas de README, pas de LICENSE).
2.  Liez votre dépôt local au dépôt distant :
    ```bash
    git remote add origin https://github.com/VOTRE_NOM_UTILISATEUR/audiolab.git
    git branch -M main
    git push -u origin main
    ```
3.  Configurez les **Branch Protection Rules** sur la branche `main` dans les réglages GitHub pour exiger que le workflow `Security & Build Verification` s'exécute avec succès avant toute fusion de code.
