/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AudioTurn } from "../types";
import { Play, Pause, Volume2, Sparkles, AlertCircle, AlertTriangle, HeartHandshake } from "lucide-react";

interface TranscriptListProps {
  turns: AudioTurn[];
  activeTurnIndex: number | null;
  onPlayTurn: (index: number) => void;
  onPauseTurn: () => void;
  playProgress: number; // 0 to 100
}

export default function TranscriptList({
  turns,
  activeTurnIndex,
  onPlayTurn,
  onPauseTurn,
  playProgress
}: TranscriptListProps) {

  // Formatter for seconds (e.g., 6.2 -> "00:06.2")
  const formatTimecode = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms}`;
  };

  // Get speaker color values to separate participants with Editorial tone
  const getSpeakerColorClasses = (isFirstSpeaker: boolean) => {
    if (isFirstSpeaker) {
      return {
        text: "text-wheat",
        dot: "bg-wheat",
        borderColor: "border-r-wheat border-r-4 border-l-warmgray",
        label: "Agent GE CX",
        badgeBg: "bg-cream text-wheat border-warmgray",
      };
    }
    return {
      text: "text-charcoal",
      dot: "bg-charcoal",
      borderColor: "border-l-charcoal border-l-4 border-r-warmgray",
      label: "Client",
      badgeBg: "bg-cream text-charcoal border-warmgray",
    };
  };

  // Editorial pill quality styling
  const getQualityPillClass = (score: number) => {
    if (score >= 8) return "bg-[#F9F7F2] text-emerald-800 border-emerald-200";
    if (score >= 6) return "bg-[#F9F7F2] text-slate-800 border-warmgray";
    if (score >= 4) return "bg-[#F9F7F2] text-amber-800 border-amber-200";
    return "bg-[#FFF5F5] text-red-800 border-red-200";
  };

  return (
    <div id="transcript-dialogue-section" className="space-y-4">
      <div className="flex items-center justify-between mb-4 px-1 border-b border-warmgray pb-2">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-wheat" />
          <span>Transcription Intuitive Tour par Tour</span>
        </h4>
        <div className="hidden sm:flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-[#C4A484] font-sans">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-wheat" /> Agent GE CX (À Droite)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-charcoal" /> Client (À Gauche)
          </div>
        </div>
      </div>

      <div id="dialogue-scroll" className="space-y-6 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
        {(() => {
          const firstSpeakerName = turns[0]?.speaker || "";
          
          return turns.map((turn, idx) => {
            const isPlaying = activeTurnIndex === idx;
            const isFirstSpeaker = turn.speaker === firstSpeakerName;
            const colors = getSpeakerColorClasses(isFirstSpeaker);
            const hasNoise = turn.noiseBackground && turn.noiseBackground.toLowerCase() !== "aucun" && turn.noiseBackground.toLowerCase() !== "aucun bruit";

            return (
              <div 
                key={idx} 
                className={`flex w-full ${isFirstSpeaker ? "justify-end" : "justify-start"}`}
              >
                <div
                  id={`turn-block-${idx}`}
                  className={`group relative p-6 bg-white border border-warmgray transition-all duration-200 cursor-pointer w-full max-w-[88%] md:max-w-[78%] ${
                    isFirstSpeaker 
                      ? "border-r-4 border-r-wheat border-l-warmgray" 
                      : "border-l-4 border-l-charcoal border-r-warmgray"
                  } ${
                    isPlaying ? "bg-[#FAF9F6] shadow-md transform translate-y-[-1px]" : "hover:bg-[#FAF9F6]/40"
                  }`}
                  onClick={() => isPlaying ? onPauseTurn() : onPlayTurn(idx)}
                >
                  {/* Tour Stamp & Turn metadata header */}
                  <div className="flex items-center justify-between mb-3 border-b border-cream pb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-charcoal text-cream font-mono text-[9px] font-black uppercase tracking-widest leading-none rounded-none">
                        TOUR - {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${colors.text}`}>
                        {colors.label} — {formatTimecode(turn.startTime)}
                      </span>
                    </div>
                    
                    {/* Listening context links instead of ugly hover overlay elements */}
                    <div className="flex gap-3">
                      {isPlaying ? (
                        <button
                          id={`btn-pause-turn-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPauseTurn();
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-[#C4A484] underline flex items-center gap-1 cursor-pointer"
                        >
                          <Pause className="w-3 h-3 fill-current" />
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          id={`btn-play-turn-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayTurn(idx);
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-charcoal underline flex items-center gap-1 cursor-pointer hover:text-wheat"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Écouter ce tour</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Serif Quote Text */}
                  <p className={`font-serif text-base leading-relaxed text-[#2D2D2D] pr-4 select-text ${isPlaying ? "text-[#1A1A1A] font-medium" : ""}`}>
                    "{turn.text}"
                  </p>

                  {/* Audio warning info micro-table */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-cream">
                    
                    {/* Acoustic noise indicator */}
                    <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                      hasNoise
                        ? "bg-red-50 text-red-850 border-red-200"
                        : "bg-cream text-slate-600 border-warmgray"
                    }`}>
                      {hasNoise ? (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-red-650" />
                          <span>Bruit : {turn.noiseBackground}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-wheat" />
                          <span>Qualité : Optimale</span>
                        </span>
                      )}
                    </div>

                    {/* Score rating marker */}
                    <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${getQualityPillClass(turn.audioQualityScore)}`}>
                      Clarté: {turn.audioQualityScore}/10
                    </div>

                    {/* Emotion Diarization Badge */}
                    {turn.emotion && (
                      <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                        (() => {
                          const emo = turn.emotion.toLowerCase();
                          if (emo.includes("frustr") || emo.includes("colèr") || emo.includes("anger") || emo.includes("irrit")) return "bg-red-50 text-red-800 border-red-200";
                          if (emo.includes("satisf") || emo.includes("joie") || emo.includes("resol") || emo.includes("happy")) return "bg-emerald-50 text-emerald-800 border-emerald-200";
                          if (emo.includes("hesit") || emo.includes("dout") || emo.includes("anx")) return "bg-amber-50 text-amber-800 border-amber-200";
                          if (emo.includes("surpr")) return "bg-purple-50 text-purple-800 border-purple-200";
                          return "bg-slate-50 text-slate-700 border-slate-200";
                        })()
                      }`}>
                        <span className="flex items-center gap-1">
                          <HeartHandshake className="w-3 h-3 text-current" />
                          <span>Ton : {turn.emotion}</span>
                        </span>
                      </div>
                    )}

                    {/* Interruption Flag */}
                    {turn.interruption && (
                      <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border bg-[#FFF5F5] text-red-700 border-red-250 animate-pulse">
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          <span>Interruption / Chevauchement</span>
                        </span>
                      </div>
                    )}

                    {/* Quality Notes review commentary */}
                    {turn.audioQualityNotes && (
                      <span className="text-[11px] font-serif italic text-slate-500 ml-1">
                         ({turn.audioQualityNotes})
                      </span>
                    )}

                  </div>

                  {/* Individual active segment timeline progress sliding track indicator card footer bar */}
                  {isPlaying && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cream overflow-hidden">
                      <div
                        style={{ width: `${playProgress}%` }}
                        className="h-full bg-wheat transition-all duration-100 ease-linear"
                      />
                    </div>
                  )}

                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
