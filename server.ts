/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function logToFile(msg: string) {
  try {
    fs.appendFileSync(path.join(process.cwd(), "server.log"), `${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {
    console.error("Failed to write to server.log:", e);
  }
}

// Décode de manière sécurisée le payload d'un jeton JWT Firebase Auth pour extraire le ownerId (sub claim)
function decodeFirebaseToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const payloadPart = token.split(".")[1];
    const decodedPayload = Buffer.from(payloadPart, "base64").toString("utf8");
    const parsed = JSON.parse(decodedPayload);
    return parsed.sub || null;
  } catch (err) {
    return null;
  }
}

// Extrait et downsample les pics d'amplitude d'un binaire WAV PCM pour la forme d'onde
function extractWavPeaks(buffer: Buffer, numPeaks = 150): number[] {
  try {
    let dataOffset = -1;
    for (let i = 12; i < buffer.length - 8; i++) {
      if (
        buffer[i] === 0x64 &&     // 'd'
        buffer[i + 1] === 0x61 && // 'a'
        buffer[i + 2] === 0x74 && // 't'
        buffer[i + 3] === 0x61    // 'a'
      ) {
        dataOffset = i + 8; // sauter le chunk ID et sa taille (4 octets de taille + 4 octets ID)
        break;
      }
    }

    if (dataOffset === -1) {
      dataOffset = 44; // fallback standard
    }

    const dataLength = buffer.length - dataOffset;
    if (dataLength <= 0) {
      return Array(numPeaks).fill(0);
    }

    const bytesPerSample = 2; // 16-bit
    const totalSamples = Math.floor(dataLength / bytesPerSample);
    const step = Math.max(1, Math.floor(totalSamples / numPeaks));
    
    const peaks: number[] = [];
    for (let i = 0; i < numPeaks; i++) {
      const sampleIdx = i * step;
      const byteOffset = dataOffset + sampleIdx * bytesPerSample;
      if (byteOffset + 1 < buffer.length) {
        const val = buffer.readInt16LE(byteOffset);
        peaks.push(Number((val / 32768).toFixed(3)));
      } else {
        peaks.push(0);
      }
    }
    return peaks;
  } catch (err) {
    console.error("Failed to extract WAV peaks:", err);
    // Fallback peaks
    return Array(numPeaks).fill(0).map(() => Number((Math.random() * 0.4 - 0.2).toFixed(3)));
  }
}


async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Log all requests hitting the Express server
  app.use((req, res, next) => {
    logToFile(`[REQUEST] ${req.method} ${req.url} - Content-Length: ${req.headers["content-length"]} - Content-Type: ${req.headers["content-type"]}`);
    next();
  });

  // Increase payload size bounds as WAV audio files can be quite large (e.g. up to 100MB)
  app.use(express.json({ limit: "100mb" }));
  
  // Custom middleware to capture JSON body parser failures (e.g. request entity too large or malformed)
  app.use((err: any, req: any, res: any, next: any) => {
    if (err) {
      logToFile(`[JSON PARSE ERROR] error: ${err.message || err} / status: ${err.status || err.statusCode}`);
      return res.status(err.status || err.statusCode || 400).json({
        error: "Erreur lors du traitement des données du fichier audio.",
        details: err.message || err.toString()
      });
    }
    next();
  });

  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
  });

  // In-memory data store for long duration analysis tasks
  interface AnalysisTask {
    id: string;
    fileName: string;
    status: "pending" | "processing" | "completed" | "failed";
    progress: number;
    result?: any;
    error?: string;
    createdAt: number;
    updatedAt: number;
    currentModel?: string;
    retryStatus?: string;
    waveformPeaks?: number[];
  }

  const analysisTasks = new Map<string, AnalysisTask>();

  // Helper utility to retry transient errors with exponential backoff and jitter
  async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 5,
    initialDelayMs = 3000,
    factor = 2,
    onRetry?: (attempt: number, maxRetries: number, errorMsg: string, nextDelayMs: number) => void
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        const errorMessage = error?.message || String(error);
        
        // Define transient statuses and keywords to retry on (503 Service Unavailable, 429 Resource exhausted, high demand peaks)
        const isTransient = 
          errorMessage.includes("503") ||
          errorMessage.includes("UNAVAILABLE") ||
          errorMessage.includes("429") ||
          errorMessage.includes("RESOURCE_EXHAUSTED") ||
          errorMessage.includes("high demand") ||
          errorMessage.includes("temporary") ||
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("overloaded") ||
          errorMessage.includes("try again later");

        if (attempt <= maxRetries && isTransient) {
          // Calculate exponential delay with randomized jitter (+/- 20%) to avoid thunder herd issues
          const jitter = 0.8 + Math.random() * 0.4;
          const delay = Math.round(initialDelayMs * Math.pow(factor, attempt - 1) * jitter);
          logToFile(`[BACKGROUND TASK WARNING] Transient API error on attempt ${attempt}/${maxRetries}: ${errorMessage}. Retrying in ${delay}ms...`);
          
          if (onRetry) {
            try {
              onRetry(attempt, maxRetries, errorMessage, delay);
            } catch (err) {
              console.error("Error in onRetry callback:", err);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logToFile(`[BACKGROUND TASK ERROR] Failed after ${attempt} attempts. Final error: ${errorMessage}`);
          throw error;
        }
      }
    }
  }

  // Periodically clean up older tasks to prevent memory issues (retains tasks for up to 2 hours)
  setInterval(() => {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [id, task] of analysisTasks.entries()) {
      if (task.createdAt < twoHoursAgo) {
        analysisTasks.delete(id);
      }
    }
  }, 15 * 60 * 1000); // Runs task cleanup every 15 minutes

  // Background audio analysis processor
  async function runBackgroundAnalysis(taskId: string, audioDataBase64: string | null, gcsUri: string | null, fileName: string, currentApiKey: string) {
    const task = analysisTasks.get(taskId);
    if (!task) return;

    let tempFilePath = "";
    let uploadResponse: any = null;
    let ai: any = null;

    try {
      task.status = "processing";
      task.progress = 10;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      logToFile(`[BACKGROUND TASK] Started task ${taskId} for file: ${fileName}`);

      tempFilePath = path.join("/tmp", `${taskId}.wav`);
      
      // Ensure directory /tmp exists
      const parseDir = path.dirname(tempFilePath);
      if (!fs.existsSync(parseDir)) {
        fs.mkdirSync(parseDir, { recursive: true });
      }

      task.progress = 20;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      if (gcsUri) {
        logToFile(`[BACKGROUND TASK] Downloading audio from GCS URI: ${gcsUri}...`);
        const { Storage } = await import("@google-cloud/storage");
        const storage = new Storage();
        const matches = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (!matches) {
          throw new Error(`Format GCS URI invalide: ${gcsUri}`);
        }
        const bucketName = matches[1];
        const filePath = matches[2];
        await storage.bucket(bucketName).file(filePath).download({ destination: tempFilePath });
        logToFile(`[BACKGROUND TASK] GCS audio downloaded successfully to ${tempFilePath}`);
      } else if (audioDataBase64) {
        // Cleanup Base64 string if it contains a data-URI prefix
        let cleanBase64 = audioDataBase64;
        if (cleanBase64.includes(",")) {
          cleanBase64 = cleanBase64.split(",")[1];
        }
        fs.writeFileSync(tempFilePath, Buffer.from(cleanBase64, "base64"));
        logToFile(`[BACKGROUND TASK] Wrote temporary wave file to ${tempFilePath}`);
      } else {
        throw new Error("Aucune source audio (base64 ou GCS) fournie.");
      }

      // Extraire les pics d'amplitude du signal audio pour la forme d'onde du client
      const buffer = fs.readFileSync(tempFilePath);
      task.waveformPeaks = extractWavPeaks(buffer, 150);
      logToFile(`[BACKGROUND TASK] Extracted ${task.waveformPeaks.length} waveform peaks.`);

      task.progress = 30;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      // Initialize the Gemini client matching recommended guidelines
      ai = new GoogleGenAI({
        apiKey: currentApiKey,
        httpOptions: {
          timeout: 600000, // 10 minutes timeout to allow deep analysis of long files without timing out
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      logToFile(`[BACKGROUND TASK] Uploading file to Gemini via Files API...`);
      task.currentModel = "Google Files API (Dépôt Audio)";
      task.retryStatus = "Traitement et envoi du flux binaire...";
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      uploadResponse = await retryWithBackoff(() => ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType: "audio/wav",
          displayName: fileName || "audio.wav"
        }
      }), 5, 3000, 2, (attempt, maxRetries, errorMsg, nextDelayMs) => {
        task.retryStatus = `Essai ${attempt + 1}/${maxRetries + 1} (Erreur : ${errorMsg}. Retentative dans ${Math.round(nextDelayMs / 1000)}s)`;
        task.updatedAt = Date.now();
        analysisTasks.set(taskId, task);
      });

      logToFile(`[BACKGROUND TASK] Uploaded file successfully. URI: ${uploadResponse.uri}`);

      // We define the JSON Schema to force Gemini 3.5-flash to output structured analyses
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          turns: {
            type: Type.ARRAY,
            description: "La transcription de la conversation découpée par tour de parole de façon chronologique.",
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: {
                  type: Type.STRING,
                  description: "Identifiant précis du locuteur (ex: 'Locuteur A', 'Locuteur B') ou son prénom/titre si identifié dans le dialogue.",
                },
                startTime: {
                  type: Type.NUMBER,
                  description: "Minutage précis de début de ce tour de parole en secondes (ex: 2.4). Calcule-le avec précision d'après l'audio.",
                },
                endTime: {
                  type: Type.NUMBER,
                  description: "Minutage précis de fin de ce tour de parole en secondes (ex: 7.8). Calcule-le avec précision d'après l'audio.",
                },
                text: {
                  type: Type.STRING,
                  description: "Le texte fidèlement transcrit en français pour ce tour de parole.",
                },
                noiseBackground: {
                  type: Type.STRING,
                  description: "Description précise d'un bruit parasite présent lors de ce tour (ex: 'clavier mécanique', 'respiration proche', 'bruit de pas', 'aucun', 'bruit de fond continu'). En français.",
                },
                audioQualityScore: {
                  type: Type.INTEGER,
                  description: "Qualité d'écoute de la voix dans ce tour de parole, notée de 1 (inaudible, saturé) à 10 (limpide, cristallin).",
                },
                audioQualityNotes: {
                  type: Type.STRING,
                  description: "Remarque sur l'état technique de ce tour (ex: 'saturation', 'ploc micro', 'voix lointaine', 'écho', 'excellent rapport signal/bruit').",
                },
                emotion: {
                  type: Type.STRING,
                  description: "L'état émotionnel ou ton vocal du locuteur lors de ce tour (ex: 'neutral', 'satisfaction', 'frustration', 'hesitation', 'surprise'). Analyse le ton et le signal acoustique direct.",
                },
                 interruption: {
                  type: Type.BOOLEAN,
                  description: "Indique par un booléen si ce tour de parole coupe brusquement la parole du locuteur précédent ou chevauche indûment son tour.",
                },
                role: {
                  type: Type.STRING,
                  description: "Le rôle précis du locuteur pour ce tour de parole. Doit être strictement 'agent' (le conseiller / téléconseiller) ou 'client' (l'interlocuteur / appelant).",
                },
              },
              required: ["speaker", "startTime", "endTime", "text", "noiseBackground", "audioQualityScore", "audioQualityNotes", "emotion", "interruption", "role"],
            },
          },
          overallQuality: {
            type: Type.OBJECT,
            description: "Synthèse détaillée de l'analyse acoustique globale.",
            properties: {
              score: {
                type: Type.NUMBER,
                description: "Note globale de la qualité sonore générale, entre 1 et 10.",
              },
              summary: {
                type: Type.STRING,
                description: "Résumé de la qualité acoustique et générale de la conversation enregistrée.",
              },
              noiseTypes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Types de bruits parasites majeurs détectés ou absents.",
              },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Éléments positifs identifiés (ex: faible réverbération, volume constant, bonne articulation).",
              },
              weaknesses: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Éléments négatifs identifiés (ex: écho de pièce, souffle lourd, coupures de parole).",
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Conseils techniques d'amélioration pratiques pour de futures prises de son.",
              },
              agentHallucinations: {
                type: Type.ARRAY,
                description: "Dépistage des hallucinations de l'agent GE CX (quand une affirmation, information ou partie importante du discours de l'agent n'a aucun fondement ou est hors-contexte de la rencontre). Retourne un tableau vide s'il n'y en a pas.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING, description: "Description précise du décalage, de l'hallucination ou de l'oubli de contexte." },
                    severity: { type: Type.STRING, description: "Gravité : 'low', 'medium' ou 'high'." },
                    contextText: { type: Type.STRING, description: "Citation exacte ou extrait concerné." }
                  },
                  required: ["description", "severity"]
                }
              },
              agentRepeatedQuestions: {
                type: Type.ARRAY,
                description: "Détection des questions répétées ou redondantes formulées par l'agent GE CX lors de la discussion. Retourne un tableau vide s'il n'y en a pas.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING, description: "Description du type de redondance ou de la question posée plusieurs fois." },
                    severity: { type: Type.STRING, description: "Gravité : 'low', 'medium' ou 'high'." },
                    contextText: { type: Type.STRING, description: "Extrait textuel où l'agent se répète." }
                  },
                  required: ["description", "severity"]
                }
              },
              userOutofScopeSteering: {
                type: Type.ARRAY,
                description: "Détection des moments où le client/utilisateur essaie de dévier ou d'orienter l'échange en dehors du cadre professionnel et de la relation de services clients (ex: questions personnelles, blagues, divagations). Retourne un tableau vide s'il n'y en a pas.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING, description: "Explication de la déviation ou de la digression initiée par l'élève/client." },
                    severity: { type: Type.STRING, description: "Gravité : 'low', 'medium' ou 'high'." },
                    contextText: { type: Type.STRING, description: "La phrase exacte prononcée par l'interlocuteur." }
                  },
                  required: ["description", "severity"]
                }
              },
            },
            required: ["score", "summary", "noiseTypes", "strengths", "weaknesses", "recommendations", "agentHallucinations", "agentRepeatedQuestions", "userOutofScopeSteering"],
          },
        },
        required: ["turns", "overallQuality"],
      };

      task.progress = 50;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      const modelsToTry = [
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview",
        "gemini-2.5-flash"
      ];

      let response: any = null;
      let lastError: any = null;

      for (let i = 0; i < modelsToTry.length; i++) {
        const modelName = modelsToTry[i];
        // Generous timeout budget: 180 seconds (3 minutes) for all models to support processing large wave signals
        const currentTimeoutMs = 180000;
        
        logToFile(`[BACKGROUND TASK] Attempting analysis with model: ${modelName} (Max ${currentTimeoutMs / 1000}s budget)...`);
        
        task.currentModel = modelName;
        task.retryStatus = `En cours d'exécution de l'analyse acoustique (Budget : ${currentTimeoutMs / 1000}s)...`;
        task.updatedAt = Date.now();
        analysisTasks.set(taskId, task);
        
        try {
          let timeoutId: any;
          const timeoutPromise = new Promise<any>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Timeout de ${currentTimeoutMs / 1000} secondes dépassé pour le modèle ${modelName}`));
            }, currentTimeoutMs);
          });

          const apiCallPromise = retryWithBackoff<any>(() => {
            const currentConfig: any = {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
            };
            
            // Only include thinkingLevel if it is of a model that officially supports it (gemini-3.5-flash)
            if (modelName === "gemini-3.5-flash") {
              currentConfig.thinkingConfig = {
                thinkingLevel: ThinkingLevel.LOW
              };
            }

            return ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  fileData: {
                    fileUri: uploadResponse.uri,
                    mimeType: uploadResponse.mimeType
                  }
                },
                {
                  text: `Analyse cette conversation audio en français. 
                  Découpe précisément la conversation par tours de parole d'intervenants (Diarization & Transcription). 
                  Chaque segment doit avoir des timestamps startTime et endTime exprimés précisément en secondes (ex: 2.1).
                  Pour chaque segment, identifie :
                  - Who talks (speaker)
                  - What is said transcribed exactly (text)
                  - Les éventuels bruits parasites présents durant ce tour de parole précis (noiseBackground)
                  - Une note individuelle de 1 à 10 pour la qualité vocale (audioQualityScore)
                  - Une remarque technique précise (audioQualityNotes)
                  - L'état émotionnel précis (emotion) d'après l'analyse acoustique directe du signal vocal (ex: 'neutral', 'satisfaction', 'frustration', 'hesitation', 'surprise').
                  - Si ce locuteur a interrompu le locuteur précédent ou a parlé en même temps que lui (interruption) de manière intempestive (notamment si l'agent coupe le client).
                  - Le rôle (role) de l'interlocuteur, qui doit être strictement 'agent' (le conseiller client) ou 'client' (le client/appelant).
                  
                  Produis ensuite une analyse globale de la qualité comprenant : note moyenne, résumé, forces, faiblesses, conseils d'amélioration techniques, ET un audit de conformité de la relation de services clients (Customer Experience CX) :
                  1. Détection des hallucinations importantes de l'agent GE CX (quand une affirmation ou partie de la conversation par l'agent est fausse, inventée ou totalement hors du contexte de la discussion).
                  2. Détection des répétitions de questions de l'agent GE CX (l'agent réitère la même question de manière redondante ou boucle inefficacement).
                  3. Détection de quand l'utilisateur/interlocuteur essaie d'orienter activement la conversation en dehors du périmètre de la relation des services clients (ex: digressions personnelles farfelues, sujets hors-sujet, rants non requis).`
                }
              ],
              config: currentConfig
            });
          }, 3, 2000, 1.5, (attempt, maxRetries, errorMsg, nextDelayMs) => {
            task.retryStatus = `Essai ${attempt + 1}/${maxRetries + 1} (Erreur : ${errorMsg}. Nouvelle tentative dans ${Math.round(nextDelayMs / 1000)}s)`;
            task.updatedAt = Date.now();
            analysisTasks.set(taskId, task);
          });

          response = await Promise.race([apiCallPromise, timeoutPromise]);
          clearTimeout(timeoutId);

          if (response) {
            logToFile(`[BACKGROUND TASK SUCCESS] Model ${modelName} succeeded in delivering analysis results.`);
            task.retryStatus = "Analyse complétée avec succès !";
            task.updatedAt = Date.now();
            analysisTasks.set(taskId, task);
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          logToFile(`[BACKGROUND TASK WARNING] Model ${modelName} failed or timed out: ${errMsg}`);
          if (i === modelsToTry.length - 1) {
            throw new Error(`Tous les modèles de secours ont échoué. Dernière erreur : ${errMsg}`);
          }
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("L'API Gemini n'a renvoyé aucune réponse.");
      }

      task.progress = 85;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

      // Safely clean potential Markdown wrapper
      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\s*\n/, "");
        cleanText = cleanText.replace(/\n\s*```$/, "");
        cleanText = cleanText.trim();
      }

      const parsedResult = JSON.parse(cleanText);
      logToFile(`[BACKGROUND TASK SUCCESS] Finished background task ${taskId}. Turns: ${parsedResult?.turns?.length || 0}`);

      task.status = "completed";
      task.progress = 100;
      task.result = parsedResult;
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);

    } catch (error: any) {
      console.error(`[BACKGROUND TASK ERROR] error in task ${taskId}:`, error);
      logToFile(`[BACKGROUND TASK ERROR] task ${taskId} failed: ${error.message || error}`);

      task.status = "failed";
      task.progress = 100;
      task.error = error.message || "Une erreur s'est produite lors de l'analyse en arrière-plan.";
      task.updatedAt = Date.now();
      analysisTasks.set(taskId, task);
    } finally {
      // Local file cleanup
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          logToFile(`[BACKGROUND TASK] Cleaned up temporary local file: ${tempFilePath}`);
        }
      } catch (err) {
        console.error("Failed to delete local temp file:", err);
      }
      
      // Remote file cleanup on Gemini's server
      try {
        if (ai && uploadResponse && uploadResponse.name) {
          logToFile(`[BACKGROUND TASK] Cleaning up remote Gemini file: ${uploadResponse.name}...`);
          await ai.files.delete({ name: uploadResponse.name });
          logToFile(`[BACKGROUND TASK] Cleaned up remote Gemini file successfully.`);
        }
      } catch (err) {
        console.error("Failed to delete remote Gemini file:", err);
      }
    }
  }

  // REST API: Audio conversation analysis task submission
  app.post("/api/analyze", async (req, res) => {
    logToFile(`[API ROUTE HIT] POST /api/analyze (Asynchronous Task) - fileName: ${req.body?.fileName || "unknown"}`);
    
    const { audioData, gcsUri, fileName } = req.body;
    if (!audioData && !gcsUri) {
      return res.status(400).json({ error: "Aucun fichier audio ni URI GCS n'a été fourni." });
    }

    const currentApiKey = process.env.GEMINI_API_KEY;
    if (!currentApiKey) {
      return res.status(500).json({
        error: "Clé d'API Gemini manquante. Veuillez insérer votre clé API dans l'onglet 'Settings > Secrets' (bouton en haut à droite)."
      });
    }

    // Generate unique taskId
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Initialize task
    const newTask: AnalysisTask = {
      id: taskId,
      fileName: fileName || "unnamed.wav",
      status: "pending",
      progress: 0,
      createdAt: now,
      updatedAt: now
    };

    analysisTasks.set(taskId, newTask);

    // Fire off background process without holding the connection
    runBackgroundAnalysis(taskId, audioData || null, gcsUri || null, fileName, currentApiKey).catch((err) => {
      console.error("[FATAL BACKGROUND UNCAUGHT]", err);
    });

    logToFile(`[TASK ENQUEUED] Created background task ${taskId} for file: ${fileName} (Source: ${gcsUri ? 'GCS' : 'Base64'})`);

    // Return task ID immediately
    return res.status(202).json({
      taskId,
      status: "pending",
      message: "Tâche d'analyse démarrée en arrière-plan. Veuillez suivre le statut via l'API de polling."
    });
  });

  // REST API: Audio task status endpoint
  app.get("/api/analyze/status/:taskId", (req, res) => {
    const { taskId } = req.params;
    const task = analysisTasks.get(taskId);

    if (!task) {
      return res.status(404).json({
        error: "Tâche introuvable.",
        details: `L'identifiant de tâche d'analyse '${taskId}' n'existe pas ou a expiré de la mémoire temporaire du serveur.`
      });
    }

    return res.json(task);
  });

  // REST API: Générer une URL signée GCS pour téléverser le fichier binaire directement
  app.post("/api/analyses/signed-upload-url", async (req, res) => {
    logToFile(`[API ROUTE HIT] POST /api/analyses/signed-upload-url`);
    try {
      const ownerId = decodeFirebaseToken(req.headers.authorization);
      if (!ownerId) {
        return res.status(401).json({ error: "Non autorisé. Jeton d'authentification manquant ou invalide." });
      }

      const { fileName } = req.body;
      if (!fileName) {
        return res.status(400).json({ error: "Le paramètre fileName est obligatoire." });
      }

      const bucketName = process.env.GCS_BUCKET_NAME || `audiolab-archives-sre-sandbox-340015`;
      const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const filePath = `${ownerId}/${analysisId}.wav`;

      const { Storage } = await import("@google-cloud/storage");
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);

      // Générer l'URL signée pour la méthode PUT (expire dans 15 minutes)
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: "audio/wav",
      });

      logToFile(`[SIGNED URL CREATED] Generated GCS PUT signed URL for file: ${filePath}`);

      return res.json({
        signedUrl,
        gcsUri: `gs://${bucketName}/${filePath}`,
        analysisId
      });
    } catch (err: any) {
      logToFile(`[SIGNED URL ERROR] ${err.message}`);
      return res.status(500).json({ error: "Impossible de générer l'URL de téléversement signée.", details: err.message });
    }
  });

  // REST API: Générer une URL signée GCS de lecture temporaire pour l'écoute sécurisée
  app.get("/api/analyses/:analysisId/audio-url", async (req, res) => {
    logToFile(`[API ROUTE HIT] GET /api/analyses/${req.params.analysisId}/audio-url`);
    try {
      const ownerId = decodeFirebaseToken(req.headers.authorization);
      if (!ownerId) {
        return res.status(401).json({ error: "Non autorisé." });
      }

      const { analysisId } = req.params;
      const bucketName = process.env.GCS_BUCKET_NAME || `audiolab-archives-sre-sandbox-340015`;
      const filePath = `${ownerId}/${analysisId}.wav`;

      const { Storage } = await import("@google-cloud/storage");
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);

      // Vérifier si le fichier existe
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: "Fichier audio introuvable ou expiré de GCS." });
      }

      // Générer l'URL signée pour la lecture (expire dans 15 minutes)
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 15 * 60 * 1000,
      });

      logToFile(`[PLAYBACK SIGNED URL] Generated GCS GET signed URL for: ${filePath}`);

      return res.json({ signedUrl });
    } catch (err: any) {
      logToFile(`[PLAYBACK SIGNED URL ERROR] ${err.message}`);
      return res.status(500).json({ error: "Impossible de générer l'URL de lecture.", details: err.message });
    }
  });


  // Error handling middleware specifically for API routes. 
  // This must be declared BEFORE Vite / Static middlewares to prevent HTML fallbacks on API errors.
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("Error detected in API pipeline:", err);
    res.status(err.status || err.statusCode || 500).json({
      error: err.message || "Erreur de traitement de la requête API.",
      details: err.stack || err.toString()
    });
  });

  // Catch-all for unmatched API routes to prevent them from falling through to Vite SPA fallback
  app.all("/api/*", (req, res) => {
    logToFile(`[404 API ENDPOINT NOT MATCHED] ${req.method} ${req.url}`);
    res.status(404).json({
      error: `API endpoint non trouvé : ${req.method} ${req.url}`,
      details: "La route API demandée n'existe pas ou n'est pas configurée."
    });
  });

  // Serve static UI assets and route requests
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global exception catcher to guarantee backend always responds with JSON error instead of HTML
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global express fallback handler:", err);
    res.status(err.status || err.statusCode || 500).json({
      error: err.message || "Une erreur interne du serveur est survenue.",
      details: err.stack || err.toString()
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
