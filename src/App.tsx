/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  Play,
  Pause,
  RefreshCw,
  FileAudio,
  Info,
  Activity,
  Cpu,
  HelpCircle,
  Clock,
  Settings,
  LogIn,
  LogOut,
  History,
  Trash2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FolderOpen,
  Cloud,
  FileText
} from "lucide-react";
import { AudioAnalysis } from "./types";
import { demoAnalysis } from "./utils/demoData";
import { playSynthBeep, stopSynth } from "./utils/audioSynth";
import AudioUploader from "./components/AudioUploader";
import OverviewPanel from "./components/OverviewPanel";
import TranscriptList from "./components/TranscriptList";
import AgentPerformancePanel from "./components/AgentPerformancePanel";
import SentimentHeatmapPlayer from "./components/SentimentHeatmapPlayer";


// Firebase imports
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { 
  saveAnalysisToFirestore, 
  subscribeToUserAnalyses, 
  deleteAnalysisFromFirestore, 
  saveUserProfile,
  SavedAnalysisRecord
} from "./lib/firebaseService";

export default function App() {
  // State for active analysis: defaults to the high-fidelity demo sample on boot
  const [analysis, setAnalysis] = useState<AudioAnalysis>(demoAnalysis);
  const [isDemo, setIsDemo] = useState<boolean>(true);

  // Uploaded files and status states
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<number>(0);
  const [analysisElapsedTime, setAnalysisElapsedTime] = useState<number>(0);
  const [backendProgress, setBackendProgress] = useState<number>(0);
  const [backendStatus, setBackendStatus] = useState<string>("pending");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  const analysisSteps = [
    "Connexion au serveur et initialisation du pipeline acoustique...",
    "Lecture et décodage du signal binaire WAV (extraction de la bande PCM)...",
    "Transmission sécurisée et traitement par le serveur d'analyse...",
    "Reconnaissance vocale intelligente et diarisation par Gemini (identification des locuteurs)...",
    "Traitement technique des segments : filtrage des fréquences et calcul du rapport signal/bruit...",
    "Finalisation de l'analyse, compilation des scores et archivage cloud..."
  ];

  useEffect(() => {
    let stepInterval: NodeJS.Timeout | null = null;
    if (isAnalyzing) {
      setAnalysisStep(0);
      stepInterval = setInterval(() => {
        setAnalysisStep((prev) => Math.min(5, prev + 1));
      }, 5000);
    } else {
      setAnalysisStep(0);
    }
    return () => {
      if (stepInterval) clearInterval(stepInterval);
    };
  }, [isAnalyzing]);

  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    if (isAnalyzing) {
      setAnalysisElapsedTime(0);
      timerInterval = setInterval(() => {
        setAnalysisElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      setAnalysisElapsedTime(0);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isAnalyzing]);

  // Playback configuration states
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null);
  const [playProgress, setPlayProgress] = useState<number>(0);
  const [isGlobalPlaying, setIsGlobalPlaying] = useState<boolean>(false);
  const [globalTime, setGlobalTime] = useState<number>(0);
  const [globalDuration, setGlobalDuration] = useState<number>(0);

  // Firebase auth & history state
  const [user, setUser] = useState<User | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysisRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [cloudStatusMsg, setCloudStatusMsg] = useState<string | null>(null);
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);

  // Audio elements references
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // States for advanced audio controls & isolated GCS storage
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [noiseClarifierActive, setNoiseClarifierActive] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const highpassFilterRef = useRef<BiquadFilterNode | null>(null);
  const lowpassFilterRef = useRef<BiquadFilterNode | null>(null);

  // Timer references for animating fallback synthesised demo playback
  const demoIntervalRef = useRef<any>(null);
  const activeSegmentEndRef = useRef<number>(0);

  // 1a. Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setSavedAnalyses([]);
        setSelectedHistoryId(null);
      }
    });
    return unsubscribe;
  }, []);

  // 1b. Load active user's saved analyses from Firestore
  const userId = user?.uid || null;
  useEffect(() => {
    if (userId) {
      const unsubscribe = subscribeToUserAnalyses(
        userId,
        (analyses) => {
          setSavedAnalyses(analyses);
        },
        (err) => {
          console.error("Firestore history load failed:", err);
          setErrorText("Impossible de charger votre historique d'analyses : " + err.message);
        }
      );
      return unsubscribe;
    }
  }, [userId]);

  // 1c. Core clean up on unmount or file swap
  useEffect(() => {
    return () => {
      stopAnyPlayback();
    };
  }, []);

  const stopAnyPlayback = () => {
    // Stop native audio element
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // Stop synthesize beeper
    stopSynth();
    // Stop fallback animations loops
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
    setActiveTurnIndex(null);
    setPlayProgress(0);
    setIsGlobalPlaying(false);
  };

  const handleSeek = (time: number) => {
    setGlobalTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleNoiseClarifier = () => {
    if (!audioRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          alert("L'API Web Audio n'est pas supportée sur ce navigateur.");
          return;
        }
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;

        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 250;
        highpassFilterRef.current = hp;

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3200;
        lowpassFilterRef.current = lp;

        // Chain: source -> highpass -> lowpass -> destination
        source.connect(hp);
        hp.connect(lp);
        lp.connect(ctx.destination);
      }

      const hp = highpassFilterRef.current;
      const lp = lowpassFilterRef.current;
      const ctx = audioCtxRef.current;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      if (!noiseClarifierActive) {
        // Activer le filtre de clarté (bandpass 250Hz - 3200Hz pour isoler la voix humaine)
        hp!.frequency.value = 250;
        lp!.frequency.value = 3200;
        setNoiseClarifierActive(true);
      } else {
        // Désactiver / court-circuiter le filtre
        hp!.frequency.value = 0;
        lp!.frequency.value = 20000;
        setNoiseClarifierActive(false);
      }
    } catch (err) {
      console.error("Web Audio configuration failed:", err);
    }
  };


  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setErrorText(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await saveUserProfile(
          result.user.uid,
          result.user.displayName || "Utilisateur Audiolab",
          result.user.photoURL
        );
        showCloudNotice(`Bienvenue, ${result.user.displayName || "Utilisateur"} !`);
      }
    } catch (err: any) {
      console.error("Google Authentication error:", err);
      // Fail silently unless critical
      setErrorText("Échec de la connexion avec Google. " + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      handleReloadDemo();
      showCloudNotice("Session cloud déconnectée.");
    } catch (err: any) {
      console.error("Sign Out error:", err);
    }
  };

  const uploadAudioToGcs = async (
    fileName: string, 
    file: File | null, 
    base64: string | null
  ): Promise<{ analysisId: string; gcsUri: string } | null> => {
    if (!file && !base64) return null;

    const headers: any = { "Content-Type": "application/json" };
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }

    const signedRes = await fetch("/api/analyses/signed-upload-url", {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName: fileName || "enregistrement.wav" })
    });

    if (!signedRes.ok) {
      throw new Error("Impossible de générer l'URL de téléversement signée.");
    }

    const { signedUrl, gcsUri, analysisId } = await signedRes.json();

    let audioBlob: Blob;
    if (file) {
      audioBlob = file;
    } else {
      const response = await fetch(`data:audio/wav;base64,${base64}`);
      audioBlob = await response.blob();
    }

    const gcsUploadRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/wav" },
      body: audioBlob
    });

    if (!gcsUploadRes.ok) {
      throw new Error("Échec du téléversement du binaire vers GCS.");
    }

    return { analysisId, gcsUri };
  };

  // Manual save for existing results
  const handleSaveReportToCloud = async () => {
    if (!user) return;
    setIsSavingManual(true);
    setErrorText(null);
    try {
      let customDocId = activeAnalysisId || undefined;
      
      if (!customDocId) {
        try {
          const uploadResult = await uploadAudioToGcs(
            selectedFileName || "Rapport_Analysé.wav",
            selectedFile,
            base64Data
          );
          if (uploadResult) {
            customDocId = uploadResult.analysisId;
            setActiveAnalysisId(customDocId);
          }
        } catch (uploadErr: any) {
          console.warn("GCS upload during manual save failed:", uploadErr);
        }
      }

      const docId = await saveAnalysisToFirestore(
        user.uid,
        selectedFileName || "Rapport_Analysé.wav",
        selectedFile?.size || 409600,
        analysis,
        customDocId
      );
      if (docId) {
        setSelectedHistoryId(docId);
        showCloudNotice("Rapport d'analyse archivé avec succès dans le cloud !");
      }
    } catch (err: any) {
      console.error("Firestore manual save failed:", err);
      setErrorText("Échec de l'enregistrement dans le cloud : " + err.message);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Switch/Load History Report Row
  const handleLoadHistoryRecord = async (record: SavedAnalysisRecord) => {
    stopAnyPlayback();
    setAnalysis({
      turns: record.turns,
      overallQuality: record.overallQuality
    });
    setIsDemo(false);
    setSelectedHistoryId(record.id);
    setActiveAnalysisId(record.id);
    setSelectedFileName(record.fileName);
    setBase64Data(null);
    setSelectedFile(null);
    setErrorText(null);

    // Charger l'URL de lecture signée de GCS (accessible en mode connecté ou anonyme)
    if (record.id) {
      try {
        const headers: any = {};
        if (user) {
          const token = await user.getIdToken();
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(`/api/analyses/${record.id}/audio-url`, { headers });
        if (res.ok) {
          const { signedUrl } = await res.json();
          setAudioUrl(signedUrl);
          showCloudNotice(`Chargé : ${record.fileName} (Audio GCS Sécurisé)`);
        } else {
          setAudioUrl(null);
          showCloudNotice(`Chargé : ${record.fileName} (Audio non archivé)`);
        }
      } catch (err) {
        console.error("Failed to get playback GCS signed URL:", err);
        setAudioUrl(null);
        showCloudNotice(`Chargé : ${record.fileName} (Audio non disponible)`);
      }
    } else {
      setAudioUrl(null);
      showCloudNotice(`Chargé : ${record.fileName}`);
    }
  };

  // Delete History Row
  const handleDeleteHistoryRecord = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    if (confirm("Voulez-vous vraiment supprimer définitivement cette analyse de votre historique cloud ?")) {
      try {
        await deleteAnalysisFromFirestore(recordId);
        if (selectedHistoryId === recordId) {
          handleReloadDemo();
          setSelectedHistoryId(null);
        }
        showCloudNotice("Rapport supprimé de votre cloud.");
      } catch (err: any) {
        console.error("Firestore delete failed:", err);
        setErrorText("Impossible de supprimer le document d'analyse : " + err.message);
      }
    }
  };

  const showCloudNotice = (msg: string) => {
    setCloudStatusMsg(msg);
    setTimeout(() => {
      setCloudStatusMsg(null);
    }, 4500);
  };

  // Audio file upload handler
  const handleFileLoaded = (base64: string, file: File, url: string) => {
    stopAnyPlayback();
    setBase64Data(base64);
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setAudioUrl(url);
    setErrorText(null);
    setSelectedHistoryId(null);
    setActiveAnalysisId(null);
  };

  const handleClearFile = () => {
    stopAnyPlayback();
    setBase64Data(null);
    setSelectedFile(null);
    setSelectedFileName("");
    setAudioUrl(null);
    setErrorText(null);
    setSelectedHistoryId(null);
    setActiveAnalysisId(null);
    // Return to showing demo analysis data to avoid a blank display
    setAnalysis(demoAnalysis);
    setIsDemo(true);
  };

  // 3. Initiate analysis request targeting our server with asynchronous task polling
  const handleAnalyzeFile = async () => {
    if (!base64Data) return;
    
    stopAnyPlayback();
    setIsAnalyzing(true);
    setBackendProgress(5);
    setBackendStatus("pending");
    setErrorText(null);
    setSelectedHistoryId(null);
    setActiveModel(null);
    setRetryStatus(null);

    try {
      let uploadPayload: any = { fileName: selectedFileName };
      let userToken: string | null = null;
      let customDocId: string | undefined = undefined;

      // Toujours tenter l'upload direct vers GCS en flux binaire pour éviter la limite HTTP 32Mo de Cloud Run
      try {
        setBackendProgress(8);
        setBackendStatus("uploading");
        if (user) {
          userToken = await user.getIdToken();
        }
        
        const uploadResult = await uploadAudioToGcs(selectedFileName, selectedFile, base64Data);
        if (uploadResult) {
          customDocId = uploadResult.analysisId;
          setActiveAnalysisId(customDocId);
          uploadPayload.gcsUri = uploadResult.gcsUri;
          console.log("Direct client GCS upload succeeded!");
        } else {
          uploadPayload.audioData = base64Data;
        }
      } catch (uploadErr: any) {
        console.warn("GCS direct upload failed, falling back to base64 payload transit:", uploadErr);
        uploadPayload.audioData = base64Data;
      }

      setBackendProgress(20);
      const headers: any = { "Content-Type": "application/json" };
      if (userToken) {
        headers["Authorization"] = `Bearer ${userToken}`;
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(uploadPayload)
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `L'analyse a échoué (Status ${response.status}).`);
        } else {
          const rawText = await response.text();
          if (response.status === 413) {
            throw new Error("Le fichier est trop volumineux pour être analysé directement.");
          }
          throw new Error(`Erreur serveur (${response.status}) : ${rawText.substring(0, 150)}...`);
        }
      }

      const bodyData = await response.json();
      const taskId = bodyData.taskId;
      if (!taskId) {
        throw new Error("L'identifiant de la tâche d'analyse est manquant.");
      }

      // Établir la boucle de polling pour récupérer la progression et le résultat final
      const checkStatus = (): Promise<AudioAnalysis & { waveformPeaks?: number[] }> => {
        return new Promise((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/analyze/status/${taskId}`);
              if (!statusRes.ok) {
                clearInterval(pollInterval);
                const contentType = statusRes.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                  const errorData = await statusRes.json();
                  reject(new Error(errorData.error || `Erreur de polling (Status ${statusRes.status})`));
                } else {
                  reject(new Error(`Le serveur de statut a renvoyé une erreur ${statusRes.status}.`));
                }
                return;
              }

              const task = await statusRes.json();
              
              if (task.progress !== undefined) {
                setBackendProgress(task.progress);
                if (task.progress >= 50) {
                  setAnalysisStep(3);
                } else if (task.progress >= 30) {
                  setAnalysisStep(2);
                } else if (task.progress >= 20) {
                  setAnalysisStep(1);
                }
              }
              if (task.status !== undefined) {
                setBackendStatus(task.status);
              }

              if (task.currentModel !== undefined) {
                setActiveModel(task.currentModel);
              } else {
                setActiveModel(null);
              }

              if (task.retryStatus !== undefined) {
                setRetryStatus(task.retryStatus);
              } else {
                setRetryStatus(null);
              }

              if (task.status === "completed") {
                clearInterval(pollInterval);
                // Fusionner les pics d'amplitude retournés par le serveur
                const finalRes = {
                  ...task.result,
                  waveformPeaks: task.waveformPeaks
                };
                resolve(finalRes);
              } else if (task.status === "failed") {
                clearInterval(pollInterval);
                reject(new Error(task.error || "L'analyse a échoué pendant le traitement en arrière-plan."));
              }
            } catch (pollErr) {
              clearInterval(pollInterval);
              reject(pollErr);
            }
          }, 3000);
        });
      };

      const result = await checkStatus();
      
      if (!result.turns || !result.overallQuality) {
        throw new Error("Les données de retour de l'analyse ne correspondent pas au format attendu.");
      }

      setIsAnalyzing(false);
      setAnalysis(result);
      setIsDemo(false);

      // Sauvegarde automatique dans Firebase si connecté
      if (auth.currentUser) {
        saveAnalysisToFirestore(
          auth.currentUser.uid,
          selectedFileName,
          selectedFile?.size || 0,
          result,
          customDocId
        ).then((docId) => {
          if (docId) {
            setSelectedHistoryId(docId);
            showCloudNotice("Analyse terminée ! Rapport sauvegardé automatiquement.");
          }
        }).catch((saveErr) => {
          console.error("Failed to auto-save to Firestore:", saveErr);
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Une erreur s'est produite lors de l'analyse.");
      setIsAnalyzing(false);
    }
  };

  // 4. Force reloading the initial mock example conversation
  const handleReloadDemo = () => {
    stopAnyPlayback();
    setAnalysis(demoAnalysis);
    setIsDemo(true);
    setBase64Data(null);
    setSelectedFile(null);
    setSelectedFileName("");
    setAudioUrl(null);
    setErrorText(null);
    setSelectedHistoryId(null);
    setActiveAnalysisId(null);
  };

  // 5. Segment timing controller hooks and audio listeners
  const handlePlaySpecificTurn = (index: number) => {
    stopAnyPlayback();
    const turn = analysis.turns[index];
    if (!turn) return;

    setActiveTurnIndex(index);
    setPlayProgress(0);

    if (audioUrl) {
      // Direct actual audio playback
      const audio = audioRef.current;
      if (audio) {
        let hasSeeked = false;
        let ticks = 0;

        audio.currentTime = turn.startTime;
        activeSegmentEndRef.current = turn.endTime;
        audio.play().then(() => {
          // Monitor timing bound
          if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
          demoIntervalRef.current = setInterval(() => {
            const now = audio.currentTime;
            ticks++;

            if (!hasSeeked) {
              if (Math.abs(now - turn.startTime) < 2.5) {
                hasSeeked = true;
              } else if (ticks > 30) {
                stopAnyPlayback();
                return;
              } else {
                return;
              }
            }

            const segmentSecondsTotal = Math.max(0.1, turn.endTime - turn.startTime);
            const currentOffsetSec = now - turn.startTime;
            const progress = (currentOffsetSec / segmentSecondsTotal) * 100;
            setPlayProgress(Math.min(100, Math.max(0, progress)));
            setGlobalTime(now);

            if (now >= turn.endTime) {
              stopAnyPlayback();
            }
          }, 100);
        }).catch(err => {
          console.warn("Échec de la lecture.", err);
        });
      }
    } else {
      // Interactive simulated playback synth
      const durationSeconds = turn.endTime - turn.startTime;
      playSynthBeep(turn.speaker, durationSeconds * 1000);

      const startTimeMarker = Date.now();
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeMarker) / 1000;
        const percent = (elapsed / durationSeconds) * 100;
        setPlayProgress(Math.min(100, percent));

        if (percent >= 100) {
          stopAnyPlayback();
        }
      }, 50);
    }
  };

  // 6. Global Conversation playback
  const handlePlayGlobal = () => {
    stopAnyPlayback();
    
    if (audioUrl) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().then(() => {
          setIsGlobalPlaying(true);
        }).catch(err => {
          console.warn("Échec de lecture.", err);
        });
      }
    } else {
      // Demo sequence playback (plays sequence turns step by step)
      let turnIdx = 0;
      setIsGlobalPlaying(true);

      const playNextTurnSequencer = () => {
        if (turnIdx >= analysis.turns.length) {
          stopAnyPlayback();
          return;
        }

        const turn = analysis.turns[turnIdx];
        setActiveTurnIndex(turnIdx);
        setPlayProgress(0);

        const durationSec = turn.endTime - turn.startTime;
        playSynthBeep(turn.speaker, durationSec * 1000);

        const turnStartTimeMarker = Date.now();
        if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
        
        demoIntervalRef.current = setInterval(() => {
          const elapsed = (Date.now() - turnStartTimeMarker) / 1000;
          const percent = (elapsed / durationSec) * 100;
          setPlayProgress(Math.min(100, percent));
          setGlobalTime(turn.startTime + elapsed);

          if (percent >= 100) {
            clearInterval(demoIntervalRef.current);
            turnIdx++;
            setTimeout(playNextTurnSequencer, 400);
          }
        }, 50);
      };

      playNextTurnSequencer();
    }
  };

  // 7. Handle global state updates from the audio tag
  const onAudioTimeUpdate = () => {
    if (!audioRef.current) return;
    const now = audioRef.current.currentTime;
    setGlobalTime(now);

    if (isGlobalPlaying) {
      const matchingTurnIndex = analysis.turns.findIndex(
        t => now >= t.startTime && now <= t.endTime
      );
      if (matchingTurnIndex !== -1) {
        setActiveTurnIndex(matchingTurnIndex);
        const t = analysis.turns[matchingTurnIndex];
        const percent = ((now - t.startTime) / (t.endTime - t.startTime)) * 100;
        setPlayProgress(percent);
      } else {
        setActiveTurnIndex(null);
        setPlayProgress(0);
      }
    }
  };

  const onAudioLoadedMetadata = () => {
    if (!audioRef.current) return;
    setGlobalDuration(audioRef.current.duration);
  };

  const onAudioEnded = () => {
    stopAnyPlayback();
  };

  // Display duration helper
  const formatTimeSeconds = (timeSec: number) => {
    const mins = Math.floor(timeSec / 60);
    const secs = Math.floor(timeSec % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Octet";
    const k = 1024;
    const sizes = ["Octets", "Ko", "Mo"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-cream text-charcoal antialiased selection:bg-wheat/30 selection:text-charcoal font-sans">
      
      {/* Background delicate paper grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

      {/* Header Bar conforme à l'esthétique Éditoriale */}
      <header className="border-b border-warmgray bg-white/85 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <h1 className="text-3xl font-serif font-black uppercase tracking-tighter leading-none text-charcoal">
              Audiolab<span className="text-wheat">.</span>
            </h1>
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-500 hidden sm:inline">
              Gemini Analysis Engine & Database v3.0
            </span>
          </div>

          <div className="flex items-center gap-5">
            {/* Active file tracker metadata */}
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#C4A484]">Fichier Actif</span>
              <span className="text-xs font-serif italic text-charcoal max-w-[150px] lg:max-w-xs truncate">
                {selectedFileName || "demo_entretien_diarisation.wav"}
              </span>
            </div>
            
            {/* User Identity Widget using Google Auth */}
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-warmgray">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || "Avatar"} 
                    className="w-9 h-9 rounded-full border border-warmgray shadow-sm" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-charcoal text-wheat flex items-center justify-center font-serif font-bold text-sm uppercase">
                    {user.displayName?.charAt(0) || "U"}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold text-charcoal leading-none truncate max-w-[100px]">{user.displayName || "Anonyme"}</span>
                  <button 
                    onClick={handleSignOut} 
                    className="text-[9px] text-[#A67C52] hover:text-charcoal uppercase tracking-widest font-black text-left mt-1 cursor-pointer transition-colors"
                  >
                    Déconnecter
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="px-3 py-2 bg-charcoal hover:bg-[#2A2A2A] text-white text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 border border-charcoal"
              >
                <LogIn className="w-3.5 h-3.5 text-wheat" />
                <span>Se connecter</span>
              </button>
            )}

            {!isDemo && (
              <button
                onClick={handleReloadDemo}
                className="px-3 py-2 bg-white border border-warmgray text-charcoal text-[10px] font-black uppercase tracking-widest hover:bg-cream transition-colors"
              >
                Nouvel Upload
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Cloud Alerts / Notifications banner */}
      {cloudStatusMsg && (
        <div className="bg-[#EAF5EE] border-b border-emerald-200 text-[#015C29] px-6 py-2.5 text-xs text-center font-bold tracking-wide animate-pulse flex items-center justify-center gap-2 relative z-40">
          <CheckCircle2 className="w-4 h-4 text-[#009639]" />
          <span>{cloudStatusMsg}</span>
        </div>
      )}

      {/* Main Responsive Grid Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* ===================== SIDEBAR: HISTORIQUE / CLOUD OPERATIONS ===================== */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Cloud Sync State Card */}
            <div className="bg-white border border-warmgray p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cream rounded-full translate-x-12 -translate-y-12 opacity-50" />
              <div className="relative">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#009639] flex items-center gap-1.5 md:mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Audiolab Cloud</span>
                </h3>
                
                {user ? (
                  <div className="mt-3 space-y-3">
                    {/* Manual Save Trigger if not yet saved */}
                    {!selectedHistoryId && !isDemo && (
                      <button
                        onClick={handleSaveReportToCloud}
                        disabled={isSavingManual}
                        className="w-full py-2 bg-cream hover:bg-wheat hover:text-white border border-[#A3DDAF] text-charcoal text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {isSavingManual ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-[#009639]" />
                        ) : (
                          <Cloud className="w-3.5 h-3.5 text-wheat" />
                        )}
                        <span>Sauvegarder dans le Cloud</span>
                      </button>
                    )}

                    {selectedHistoryId && (
                      <div className="p-2 bg-emerald-50 border border-emerald-100/80 rounded flex items-center justify-center gap-1.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Rapport Cloud Synchrone</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full py-2 bg-[#F9F7F5] hover:bg-cream border border-warmgray text-charcoal text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5 text-[#009639]" />
                      <span>Activer l'archivage</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Historical list Panel */}
            <div className="bg-white border border-warmgray p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-cream pb-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#2A2A2A] flex items-center gap-1.5">
                  <History className="w-4 h-4 text-wheat" />
                  <span>Historique des conversation</span>
                </h3>
                {user && (
                  <span className="text-[10px] font-mono font-bold bg-[#EAF5EE] text-[#009639] px-2 py-0.5 rounded-full">
                    {savedAnalyses.length}
                  </span>
                )}
              </div>

              {!user ? (
                <div className="py-4 text-center space-y-2">
                  <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Aucun historique disponible</p>
                  <p className="text-[11px] font-serif text-slate-500 italic max-w-[180px] mx-auto leading-relaxed">
                    Identifiez-vous pour restaurer vos analyses audio.
                  </p>
                </div>
              ) : savedAnalyses.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <FileText className="w-8 h-8 text-[#EADEC9] mx-auto opacity-70" />
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Aucun rapport sauvegardé</p>
                  <p className="text-[11px] font-serif text-slate-500 italic leading-relaxed">
                    Téléversez un fichier audio .wav et lancez l'analyse acoustique. Le rapport s'affichera ici instantanément.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {savedAnalyses.map((rec) => {
                    const isSelected = selectedHistoryId === rec.id;
                    const score = rec.overallQuality?.score || 10;
                    return (
                      <div
                        key={rec.id}
                        onClick={() => handleLoadHistoryRecord(rec)}
                        className={`group p-2.5 border transition-all duration-200 cursor-pointer text-left relative flex flex-col gap-1.5 ${
                          isSelected
                            ? "bg-[#EAF5EE] border-[#A3DDAF] shadow-sm"
                            : "bg-white border-cream hover:border-warmgray"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="text-xs font-serif font-black text-charcoal truncate flex-1 leading-tight group-hover:text-[#009639] transition-colors">
                            {rec.fileName}
                          </span>
                          
                          {/* Rating score marker */}
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 leading-none bg-charcoal text-white`}>
                            {score.toFixed(1)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                          <span>{formatBytes(rec.fileSize)}</span>
                          <span>•</span>
                          <span>
                            {new Date(rec.createdAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short"
                            })}
                          </span>
                        </div>

                        {/* Slide-in delete handle */}
                        <button
                          onClick={(e) => handleDeleteHistoryRecord(e, rec.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-neutral-100 text-red-500 rounded transition-all cursor-pointer"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Informational Box */}
            <div className="bg-[#EAF5EE]/40 border border-[#D2D7D2] p-4 text-left">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#015C29] mb-1.5 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#009639]" />
                <span>Normes de service</span>
              </h4>
            </div>

          </div>

          {/* ===================== MAIN CONTENTS workspace (3 Columns) ===================== */}
          <div className="lg:col-span-3 space-y-8">
            
            {/* Real HTML5 Hidden Audio Tag for uploaded media */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={onAudioTimeUpdate}
                onLoadedMetadata={onAudioLoadedMetadata}
                onEnded={onAudioEnded}
                className="hidden"
              />
            )}

            {/* 1. File Upload / Control Center Section */}
            <section id="uploader-section" className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-warmgray pb-1.5">
                <h2 className="text-xs font-black uppercase tracking-widest text-charcoal flex items-center gap-2">
                  <Activity className="w-4 h-4 text-wheat" />
                  <span>Chargement du Signal d'Entrée</span>
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PCM WAVE requis</span>
              </div>

              <AudioUploader
                onFileLoaded={handleFileLoaded}
                onClear={handleClearFile}
                onAnalyze={handleAnalyzeFile}
                analyzing={isAnalyzing}
                selectedFile={selectedFile}
                selectedFileName={selectedFileName}
              />
            </section>

            {errorText && (
              <div className="p-4 bg-[#FFF5F5] border border-red-200 text-red-800 text-sm">
                <p className="font-bold">Message du Système d'analyse :</p>
                <p className="mt-1 font-serif italic">{errorText}</p>
                <p className="mt-3 text-[11px] text-slate-500 uppercase tracking-wide">
                  Assurez-vous qu'un enregistrement WAV valide est sélectionné ou retentez l'analyse. Vérifiez que la clé d'API a été configurée dans l'onglet des secrets.
                </p>
              </div>
            )}

            {/* Loading overlay simulated block during API requests */}
            {isAnalyzing && (
              <div className="bg-white border border-warmgray p-10 flex flex-col items-center text-center justify-center space-y-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" />
                
                <div className="p-4 bg-cream border border-warmgray text-wheat relative">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                </div>
                
                <div className="w-full max-w-md">
                  <h3 className="text-md font-serif font-bold text-charcoal">Analyse de filtrage et segmentation en cours...</h3>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 h-2 mt-4 relative overflow-hidden rounded-full border border-warmgray">
                    <div 
                      className="bg-wheat h-full transition-all duration-500 rounded-full"
                      style={{ width: `${backendProgress || 10}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center mt-2 text-[10px] text-slate-500 font-mono">
                    <span>PROGRESS : {backendProgress || 10}%</span>
                    <span className="uppercase tracking-widest text-wheat font-bold font-mono">
                      Étape {analysisStep + 1} sur 6
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-slate-500 font-mono mt-1 font-bold">
                    Temps écoulé : {analysisElapsedTime}s
                  </p>
                </div>
                
                <div className="flex flex-col space-y-2 max-w-lg min-h-[50px] justify-center items-center">
                  <p className="text-xs text-slate-700 font-serif italic transition-all duration-300">
                    {analysisSteps[analysisStep]}
                  </p>
                  {backendProgress >= 50 && (
                    <p className="text-[10.5px] text-amber-700/80 font-serif font-medium mt-1 leading-relaxed max-w-md">
                      Remarque : Le fichier WAV a été correctement transmis à Gemini. Le modèle analyse actuellement la transcription et identifie les locuteurs. Cette étape finale intelligente peut prendre de 30 secondes à 3 minutes.
                    </p>
                  )}
                </div>

                {/* Active Model & Retry status info */}
                {(activeModel || retryStatus) && (
                  <div className="mt-4 p-3.5 bg-amber-50/80 border border-amber-200/85 max-w-lg w-full text-left space-y-2 rounded-sm select-none">
                    {activeModel && (
                      <div className="flex justify-between items-center text-[10.5px] font-mono">
                        <span className="text-amber-800 font-bold uppercase tracking-wider">Modèle Interrogé :</span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 uppercase font-black">{activeModel}</span>
                      </div>
                    )}
                    {retryStatus && (
                      <div className="text-[11px] text-slate-700 font-serif leading-relaxed">
                        <span className="font-sans font-bold text-amber-800 uppercase tracking-wide text-[10px]">Suivi des essais : </span>
                        {retryStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2. Lecteur de Carte Thermique Émotionnelle Interactif (Heatmap Player) */}
            {!isAnalyzing && (
              <SentimentHeatmapPlayer
                audioUrl={audioUrl}
                turns={analysis.turns}
                waveformPeaks={(analysis as any).waveformPeaks}
                currentTime={globalTime}
                duration={audioUrl ? globalDuration : (analysis.turns.length > 0 ? analysis.turns[analysis.turns.length - 1].endTime : 10)}
                isPlaying={isGlobalPlaying}
                onPlayToggle={isGlobalPlaying ? stopAnyPlayback : handlePlayGlobal}
                onSeek={handleSeek}
                playbackRate={playbackRate}
                onPlaybackRateChange={handlePlaybackRateChange}
                noiseClarifierActive={noiseClarifierActive}
                onNoiseClarifierToggle={toggleNoiseClarifier}
              />
            )}

            {/* 3. Output Panels layout Grid */}
            {!isAnalyzing && (
              <div className="grid grid-cols-1 gap-8">
                
                {/* Overview Diagnostics Dashboard Header */}
                <div className="border-b border-warmgray pb-2 flex items-baseline justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-charcoal flex items-center gap-2">
                    <Settings className="w-4 h-4 text-wheat" />
                    <span>Rapport d'Analyse Acoustique Globale</span>
                  </h2>
                  <span className="text-[9px] font-black uppercase tracking-wider text-wheat font-mono">
                    Model: Gemini AI & Firestore
                  </span>
                </div>

                {/* Overall quality analysis */}
                <OverviewPanel overallData={analysis.overallQuality} />

                {/* Performance Statistics of Agent */}
                <AgentPerformancePanel turns={analysis.turns} overallQuality={analysis.overallQuality} />

                {/* Transcript flow Section */}
                <div className="pt-4">
                  <TranscriptList
                    turns={analysis.turns}
                    activeTurnIndex={activeTurnIndex}
                    onPlayTurn={handlePlaySpecificTurn}
                    onPauseTurn={stopAnyPlayback}
                    playProgress={playProgress}
                  />
                </div>

              </div>
            )}
          </div>

        </div>
      </main>

      {/* Custom Editorial Footer Block */}
      <footer className="border-t border-warmgray bg-white/50 py-10 mt-20 relative">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-3">
          <div className="inline-flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
            <span>Diarisation Acoustique v3.0.0</span>
            <span>•</span>
            <span>PCM RAW WAV Audio Codec</span>
            <span>•</span>
            <span>Firebase Firestore Backend</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
