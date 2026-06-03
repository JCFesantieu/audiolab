/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { AudioTurn } from "../types";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Volume2, 
  AlertTriangle, 
  Filter 
} from "lucide-react";

interface SentimentHeatmapPlayerProps {
  audioUrl: string | null;
  turns: AudioTurn[];
  waveformPeaks?: number[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  noiseClarifierActive: boolean;
  onNoiseClarifierToggle: () => void;
}

export default function SentimentHeatmapPlayer({
  audioUrl,
  turns,
  waveformPeaks,
  currentTime,
  duration,
  isPlaying,
  onPlayToggle,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  noiseClarifierActive,
  onNoiseClarifierToggle
}: SentimentHeatmapPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);

  // Auto resize canvas based on container width
  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Drawing canvas waveform + emotion heatmap background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high DPI display support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = 64 * dpr;
    ctx.scale(dpr, dpr);

    const width = canvasWidth;
    const height = 64;
    const midY = height / 2;

    // Clear canvas
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    const audioDuration = duration || (turns.length > 0 ? turns[turns.length - 1].endTime : 10);

    // 1. Draw Emotion Heatmap background bands
    turns.forEach((turn) => {
      const startX = (turn.startTime / audioDuration) * width;
      const endX = (turn.endTime / audioDuration) * width;
      const bandWidth = endX - startX;

      if (bandWidth <= 0) return;

      // Soft background color mapped to speaker's emotion
      let bgColor = "#F8FAFC"; // Neutral default
      const emo = turn.emotion?.toLowerCase() || "";

      if (emo.includes("frustr") || emo.includes("coler") || emo.includes("anger") || emo.includes("irrit")) {
        bgColor = "#FEF2F2"; // Red frustration
      } else if (emo.includes("satisf") || emo.includes("joie") || emo.includes("resol") || emo.includes("happy")) {
        bgColor = "#ECFDF5"; // Green satisfaction
      } else if (emo.includes("hesit") || emo.includes("dout") || emo.includes("anx")) {
        bgColor = "#FFFBEB"; // Yellow hesitation
      } else if (emo.includes("surpr")) {
        bgColor = "#F5F3FF"; // Purple surprise
      }

      ctx.fillStyle = bgColor;
      ctx.fillRect(startX, 0, bandWidth, height);

      // Draw very subtle emotion indicator line on top of the band
      let indicatorColor = "transparent";
      if (emo.includes("frustr") || emo.includes("coler") || emo.includes("anger")) {
        indicatorColor = "#F87171";
      } else if (emo.includes("satisf") || emo.includes("joie") || emo.includes("resol")) {
        indicatorColor = "#34D399";
      } else if (emo.includes("hesit") || emo.includes("dout")) {
        indicatorColor = "#FBBF24";
      }

      if (indicatorColor !== "transparent") {
        ctx.fillStyle = indicatorColor;
        ctx.fillRect(startX, 0, bandWidth, 3);
      }
    });

    // 2. Draw grid lines
    ctx.strokeStyle = "#F1F5F9";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 3. Draw Waveform peaks
    // Get or generate default peaks
    const peaks = waveformPeaks && waveformPeaks.length > 0 
      ? waveformPeaks 
      : Array(150).fill(0).map((_, i) => {
          // Elegant mock sinusoidal shape with peaks
          const t = i / 150;
          return Math.sin(t * Math.PI * 8) * Math.cos(t * Math.PI * 2) * (0.3 + Math.random() * 0.4);
        });

    const barCount = peaks.length;
    const barWidth = Math.max(1, (width / barCount) - 1);
    
    for (let i = 0; i < barCount; i++) {
      const x = (i / barCount) * width;
      const peakVal = Math.abs(peaks[i] || 0);
      const barHeight = Math.max(3, peakVal * (height * 0.8));

      // Mappe peak color based on dialogue turn context
      const timestamp = (x / width) * audioDuration;
      const currentTurn = turns.find(t => timestamp >= t.startTime && timestamp <= t.endTime);
      
      let peakColor = "#94A3B8"; // slate gray standard
      if (currentTurn) {
        const emo = currentTurn.emotion?.toLowerCase() || "";
        const isAgent = currentTurn.role === "agent";

        if (emo.includes("frustr") || emo.includes("coler") || emo.includes("anger")) {
          peakColor = "#EF4444"; // vibrant red
        } else if (emo.includes("satisf") || emo.includes("joie") || emo.includes("resol")) {
          peakColor = "#10B981"; // mint green
        } else if (emo.includes("hesit") || emo.includes("dout")) {
          peakColor = "#F59E0B"; // amber yellow
        } else {
          // If neutral, style Agent vs Client
          peakColor = isAgent ? "#8B5CF6" : "#1E293B";
        }
      }

      ctx.fillStyle = peakColor;
      ctx.fillRect(x, midY - barHeight / 2, barWidth, barHeight);
    }

    // 4. Draw time progress shadow overlay
    const progressX = (currentTime / audioDuration) * width;
    ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
    ctx.fillRect(0, 0, progressX, height);

    // 5. Draw vertical playhead
    ctx.fillStyle = "#C4A484"; // Premium warm wheat playhead
    ctx.fillRect(progressX - 1, 0, 2, height);

    // Playhead circle handle
    ctx.beginPath();
    ctx.arc(progressX, midY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#C4A484";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [canvasWidth, turns, waveformPeaks, currentTime, duration]);

  // Handles seeking audio upon timeline click
  const handleTimelineClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    
    const audioDuration = duration || (turns.length > 0 ? turns[turns.length - 1].endTime : 10);
    const seekTime = ratio * audioDuration;
    onSeek(seekTime);
  };

  const formatTime = (timeSec: number) => {
    const mins = Math.floor(timeSec / 60);
    const secs = Math.floor(timeSec % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const hasFrictionTurns = turns.some(t => {
    const emo = t.emotion?.toLowerCase() || "";
    return emo.includes("frustr") || emo.includes("coler") || emo.includes("anger");
  });

  const jumpToNextFriction = () => {
    const frictionTurn = turns.find(t => {
      const emo = t.emotion?.toLowerCase() || "";
      const isFriction = emo.includes("frustr") || emo.includes("coler") || emo.includes("anger");
      return isFriction && t.startTime > currentTime + 0.5;
    });

    if (frictionTurn) {
      onSeek(frictionTurn.startTime);
    } else {
      // wrap around
      const firstFriction = turns.find(t => {
        const emo = t.emotion?.toLowerCase() || "";
        return emo.includes("frustr") || emo.includes("coler") || emo.includes("anger");
      });
      if (firstFriction) {
        onSeek(firstFriction.startTime);
      }
    }
  };

  return (
    <div className="bg-white border border-warmgray p-5 space-y-4 select-none">
      
      {/* Player Header Metadata & Warnings */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-cream pb-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-charcoal flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-wheat" />
            <span>Lecteur de Carte Thermique Émotionnelle</span>
          </h3>
          <p className="text-[11px] font-serif italic text-slate-500 mt-0.5">
            {audioUrl ? "WAV Direct Stream — Pics d'amplitude pré-calculés" : "Mode Simulation interactive (Synthétiseur)"}
          </p>
        </div>

        {/* Skip to friction trigger */}
        {hasFrictionTurns && (
          <button
            onClick={jumpToNextFriction}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1.5 transition-all animate-pulse"
            title="Sauter immédiatement à la prochaine friction ou zone de frustration du client"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <span>Sauter à la Friction</span>
          </button>
        )}
      </div>

      {/* Interactive Timeline wave Canvas */}
      <div ref={containerRef} className="w-full bg-cream border border-warmgray relative cursor-pointer">
        <canvas
          ref={canvasRef}
          onClick={handleTimelineClick}
          className="w-full block"
          style={{ height: "64px" }}
        />
      </div>

      {/* Controls Player Footbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        
        {/* 1. Navigation & Play Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="p-2 hover:bg-cream border border-warmgray text-charcoal transition-colors cursor-pointer"
            title="Reculer de 5s"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={onPlayToggle}
            className="p-3 bg-charcoal hover:bg-slate-800 text-white cursor-pointer transition-all shadow-sm"
            title={isPlaying ? "Pause" : "Lecture"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>

          <button
            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
            className="p-2 hover:bg-cream border border-warmgray text-charcoal transition-colors cursor-pointer"
            title="Avancer de 5s"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Time indicators */}
          <div className="ml-3 text-[10.5px] font-mono font-black text-charcoal select-text">
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-300 mx-1.5">/</span>
            <span className="text-slate-400">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 2. Speed Rate & Advanced Equalizer controls */}
        <div className="flex items-center gap-3 flex-wrap">
          
          {/* Audio attenuation clarifier (Biquad filter Web Audio node) */}
          <button
            onClick={onNoiseClarifierToggle}
            disabled={!audioUrl}
            className={`px-3 py-2 border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
              !audioUrl
                ? "opacity-40 cursor-not-allowed border-warmgray text-slate-400"
                : noiseClarifierActive
                ? "bg-[#EAF5EE] border-[#A3DDAF] text-[#015C29]"
                : "bg-white border-warmgray hover:bg-cream text-charcoal cursor-pointer"
            }`}
            title={audioUrl ? "Filtrer les fréquences pour atténuer les bruits et clarifier la voix" : "Le filtre nécessite un signal audio physique"}
          >
            <Filter className={`w-3.5 h-3.5 ${noiseClarifierActive ? "text-[#009639]" : "text-current"}`} />
            <span>Clarifier la voix</span>
          </button>

          {/* Playback speed adjustment rate controls */}
          <div className="flex items-center border border-warmgray">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-2.5 select-none">
              Vitesse
            </span>
            <div className="flex border-l border-warmgray bg-white">
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
                const isActive = playbackRate === rate;
                return (
                  <button
                    key={rate}
                    onClick={() => onPlaybackRateChange(rate)}
                    className={`px-2.5 py-1.5 text-[10px] font-mono font-bold border-r border-warmgray last:border-r-0 transition-colors cursor-pointer ${
                      isActive
                        ? "bg-charcoal text-cream font-black"
                        : "hover:bg-cream text-slate-600"
                    }`}
                  >
                    {rate.toFixed(2)}x
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
