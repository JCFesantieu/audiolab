# ==========================================
# Étape 1 : Phase de Construction (Builder)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copie des fichiers de configuration des dépendances
COPY package*.json ./

# Installation complète des dépendances (y compris de développement)
RUN npm ci

# Copie de l'intégralité du code source requis pour le build
COPY tsconfig.json vite.config.ts server.ts index.html ./
COPY src/ ./src/
COPY assets/ ./assets/
COPY firebase-applet-config.json ./

# Compilation de l'interface client (Vite) et bundling du serveur Express (esbuild)
RUN npm run build

# ==========================================
# Étape 2 : Phase d'Exécution de Production
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Définition de l'environnement de production
ENV NODE_ENV=production
ENV PORT=3000

# Copie du dossier compilé issu du builder
COPY --from=builder /app/dist ./dist

# Copie des fichiers package pour réinstaller uniquement les dépendances de production
COPY package*.json ./

# Installation stricte des dépendances de production requis par le serveur CJS
RUN npm ci --only=production && npm cache clean --force

# Exposition du port applicatif
EXPOSE 3000

# Lancement de l'application via le serveur bundlé
CMD ["node", "dist/server.cjs"]
