/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AudioAnalysisOverall } from "../types";
import { CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle, Check } from "lucide-react";

interface OverviewPanelProps {
  overallData: AudioAnalysisOverall;
}

export default function OverviewPanel({ overallData }: OverviewPanelProps) {
  const [completedRecs, setCompletedRecs] = useState<Record<number, boolean>>({});

  const toggleRec = (index: number) => {
    setCompletedRecs(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-wheat stroke-wheat";
    if (score >= 6) return "text-charcoal stroke-charcoal opacity-80";
    if (score >= 4) return "text-amber-600 stroke-amber-600";
    return "text-red-700 stroke-red-700";
  };

  const scoreCircumference = 2 * Math.PI * 40; // r = 40
  const scoreOffset = scoreCircumference - (overallData.score / 10) * scoreCircumference;

  return (
    <div id="overview-diagnostic-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* 1. Score & Acoustic Summary Card */}
      <div id="summary-gauge-card" className="bg-white border border-warmgray p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-wheat" />
        
        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-charcoal border-b border-warmgray pb-1 w-full text-center">
          Note Globale Acoustique
        </p>
        
        {/* SVG Radial Score */}
        <div className="relative w-32 h-32 flex items-center justify-center mb-5">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className="stroke-cream fill-none"
              strokeWidth="9"
            />
            {/* Active arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className={`fill-none transition-all duration-1000 ease-out ${getScoreColor(overallData.score)}`}
              strokeWidth="8"
              strokeDasharray={scoreCircumference}
              strokeDashoffset={scoreOffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-4xl font-serif font-black tracking-tighter text-charcoal leading-none">
              {(overallData.score * 10).toFixed(0)}
            </span>
            <span className="text-[10px] font-serif italic text-wheat">/100</span>
          </div>
        </div>

        <p className="text-sm font-serif italic text-slate-700 leading-relaxed px-1 line-clamp-6">
          {overallData.summary}
        </p>
      </div>

      {/* 2. Strengths and Weaknesses Column */}
      <div id="strengths-weaknesses-card" className="lg:col-span-2 bg-white border border-warmgray p-6 flex flex-col justify-between">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
          {/* Strengths (Forces) */}
          <div id="forces-wrapper">
            <div className="flex items-center gap-2 mb-4">
              <div className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[9px] font-black tracking-widest uppercase inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Points Forts</span>
              </div>
            </div>
            <ul className="space-y-3">
              {overallData.strengths.map((str, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="font-serif italic">{str}</span>
                </li>
              ))}
              {overallData.strengths.length === 0 && (
                <li className="text-xs text-slate-400 italic">Aucun point fort critique détecté.</li>
              )}
            </ul>
          </div>

          {/* Weaknesses (Faiblesses) */}
          <div id="faiblesses-wrapper">
            <div className="flex items-center gap-2 mb-4">
              <div className="px-2 py-0.5 bg-red-50 border border-red-100 text-red-800 text-[9px] font-black tracking-widest uppercase inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Points Faibles</span>
              </div>
            </div>
            <ul className="space-y-3">
              {overallData.weaknesses.map((weak, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="font-serif italic">{weak}</span>
                </li>
              ))}
              {overallData.weaknesses.length === 0 && (
                <li className="text-xs text-emerald-700 italic font-serif">Aucun défaut majeur repéré !</li>
              )}
            </ul>
          </div>
        </div>

        {/* Noise tag cloud */}
        <div className="mt-6 pt-5 border-t border-cream">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] block mb-3">
            Bruits parasites répertoriés sur la bande :
          </span>
          <div className="flex flex-wrap gap-2">
            {overallData.noiseTypes.map((noise, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-cream text-charcoal text-[11px] font-bold border border-warmgray font-sans"
              >
                ⚠️ {noise}
              </span>
            ))}
            {overallData.noiseTypes.length === 0 && (
              <span className="px-2.5 py-1 bg-cream text-slate-500 text-[10px] font-bold uppercase tracking-wider italic">
                Aucun bruit parasite n'a été repéré.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Actionable Recommendations / Action Plan Checklist */}
      <div id="recommendations-box" className="lg:col-span-3 bg-white border border-warmgray p-6">
        <div className="flex items-center gap-2.5 mb-5 border-b border-cream pb-3">
          <HelpCircle className="w-4 h-4 text-wheat" />
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-charcoal">
              Plan d'Action Correctif
            </h3>
            <p className="text-[11px] text-slate-500 font-serif italic mt-0.5">
              Cochez les actions recommandées pour optimiser la configuration de vos futurs enregistrements mobiles ou d'ateliers de parole.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overallData.recommendations.map((rec, idx) => {
            const isCompleted = !!completedRecs[idx];
            return (
              <div
                key={idx}
                onClick={() => toggleRec(idx)}
                className={`p-4 border transition-all duration-205 cursor-pointer flex items-start gap-3 select-none ${
                  isCompleted
                    ? "bg-cream/40 border-warmgray text-slate-400"
                    : "bg-white border-warmgray hover:border-[#1A1A1A]/30 text-charcoal"
                }`}
              >
                <div
                  className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${
                    isCompleted
                      ? "bg-charcoal border-charcoal text-white"
                      : "border-warmgray"
                  }`}
                >
                  {isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="text-[11px] leading-relaxed">
                  <span className={`font-serif ${isCompleted ? "line-through text-slate-400" : ""}`}>{rec}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
