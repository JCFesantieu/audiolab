/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { UploadCloud, FileAudio, Trash2, Cpu, AlertCircle, RefreshCw } from "lucide-react";

interface AudioUploaderProps {
  onFileLoaded: (base64Data: string, file: File, audioUrl: string) => void;
  onClear: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  selectedFile: File | null;
  selectedFileName: string;
}

export default function AudioUploader({
  onFileLoaded,
  onClear,
  onAnalyze,
  analyzing,
  selectedFile,
  selectedFileName
}: AudioUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setErrorMsg(null);
    
    // Validate file type
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "wav" && file.type !== "audio/wav" && file.type !== "audio/x-wav") {
      setErrorMsg("Le format de fichier doit obligatoirement être du .wav pour une analyse optimale.");
      return;
    }

    // Max 40MB limit for safe server-side buffering limit in the sandbox container
    if (file.size > 40 * 1024 * 1024) {
      setErrorMsg("Le fichier est trop volumineux. La limite maximale est fixée à 40 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        const audioUrl = URL.createObjectURL(file);
        onFileLoaded(base64, file, audioUrl);
      }
    };
    reader.onerror = () => {
      setErrorMsg("Impossible de lire ce fichier audio.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 octet(s)";
    const k = 1024;
    const sizes = ["Octets", "Ko", "Mo", "Go"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div id="audio-uploader-wrapper" className="w-full">
      {!selectedFile ? (
        <div
          id="drop-zone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`relative flex flex-col items-center justify-center w-full h-56 border border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${
            dragActive
              ? "border-wheat bg-cream/80 scale-[1.01]"
              : "border-warmgray hover:border-wheat bg-white"
          }`}
        >
          {/* Subtle elegant pattern background */}
          <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            onChange={handleFileInput}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="p-3 mb-3 bg-cream border border-warmgray text-charcoal rounded-none">
              <UploadCloud className="w-8 h-8 opacity-80" />
            </div>
            
            <p className="mb-1 text-sm font-serif italic text-charcoal">
              Glissez-déposez votre enregistrement <span className="text-wheat font-bold">.wav</span> ici
            </p>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              ou cliquez pour parcourir vos dossiers locaux (Max. 40 Mo)
            </p>

            <div className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider bg-cream border border-warmgray text-slate-600">
              Format standard audio non compressé (.wav PCM)
            </div>
          </div>
        </div>
      ) : (
        <div id="file-card" className="w-full bg-white border border-warmgray p-6 relative overflow-hidden">
          {/* Accent strip */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-charcoal via-wheat to-warmgray" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-cream border border-warmgray text-wheat">
                <FileAudio className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-serif font-bold text-charcoal truncate max-w-xs sm:max-w-md">
                  {selectedFileName}
                </h4>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-wheat">WAV Audio</span>
                  <span className="w-1 h-1 bg-warmgray rounded-full" />
                  <span className="text-xs font-mono text-slate-500">{formatSize(selectedFile.size)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                id="btn-delete-file"
                disabled={analyzing}
                onClick={onClear}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-warmgray hover:border-charcoal text-slate-700 hover:text-charcoal font-bold text-2xs uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Retirer</span>
              </button>

              <button
                id="btn-analyze-file"
                disabled={analyzing}
                onClick={onAnalyze}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-charcoal hover:bg-slate-800 text-white font-bold text-2xs uppercase tracking-widest cursor-pointer transition-all disabled:opacity-50 hover:translate-y-[-1px] active:translate-y-[1px]"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyse en cours...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Lancer l'Analyse Gemini</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Simple waveform visualization */}
          <div className="mt-6 pt-5 border-t border-warmgray flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visualiseur</span>
            <div className="flex items-end justify-between flex-1 h-6 px-1">
              {Array.from({ length: 48 }).map((_, i) => {
                const height = analyzing
                  ? Math.sin(i * 0.4 + Date.now() * 0.01) * 10 + 12
                  : Math.abs(Math.sin(i * 0.15)) * 10 + 2;
                return (
                  <div
                    key={i}
                    style={{ height: `${height}px` }}
                    className={`w-[2px] transition-all duration-300 ${
                      analyzing ? "bg-wheat animate-normal" : "bg-warmgray"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div id="error-banner" className="mt-4 p-4 bg-[#FFF5F5] border border-red-200 text-red-800 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <div>
            <span className="font-bold">Erreur :</span> {errorMsg}
          </div>
        </div>
      )}
    </div>
  );
}
