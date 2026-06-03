/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AudioTurn, AudioAnalysisOverall } from "../types";
import { 
  Activity, 
  MessageSquare, 
  VolumeX, 
  Award, 
  TrendingUp, 
  Hourglass, 
  Mic, 
  Compass,
  CheckCircle2,
  AlertCircle,
  ShieldAlert
} from "lucide-react";

interface AgentPerformancePanelProps {
  turns: AudioTurn[];
  overallQuality?: AudioAnalysisOverall;
}

export default function AgentPerformancePanel({ turns, overallQuality }: AgentPerformancePanelProps) {
  // If no turns, handle gracefully
  if (!turns || turns.length === 0) {
    return (
      <div className="bg-white border border-warmgray p-6 text-center text-slate-400 italic">
        Aucune donnée de tour disponible pour compiler les statistiques de performance de l'agent.
      </div>
    );
  }

  const firstSpeaker = turns[0]?.speaker || "";
  
  const hallucinations = overallQuality?.agentHallucinations || [];
  const repeatedQuestions = overallQuality?.agentRepeatedQuestions || [];
  const outOfScopeSteering = overallQuality?.userOutofScopeSteering || [];
  
  // 1. Calculate turn volumes
  const totalTurnsCount = turns.length;
  const agentTurns = turns.filter(t => t.speaker === firstSpeaker);
  const clientTurns = turns.filter(t => t.speaker !== firstSpeaker);
  const agentTurnsCount = agentTurns.length;
  const clientTurnsCount = clientTurns.length;

  const agentTurnsPct = totalTurnsCount > 0 ? (agentTurnsCount / totalTurnsCount) * 100 : 0;
  const clientTurnsPct = totalTurnsCount > 0 ? (clientTurnsCount / totalTurnsCount) * 100 : 0;

  // 2. Calculate speaker talk durations (Talk-to-Listen Ratio)
  const agentDuration = agentTurns.reduce((sum, t) => sum + Math.max(0, t.endTime - t.startTime), 0);
  const clientDuration = clientTurns.reduce((sum, t) => sum + Math.max(0, t.endTime - t.startTime), 0);
  const totalDuration = agentDuration + clientDuration;
  
  const agentTalkRatio = totalDuration > 0 ? (agentDuration / totalDuration) * 100 : 0;
  const clientTalkRatio = totalDuration > 0 ? (clientDuration / totalDuration) * 100 : 0;

  // 3. Calculate Interruptions / Overlaps / Rapid transitions
  // We identify an interruption when a speaker's start time overlap with the previous speaker's end time, or if they start within 0.15s
  let interruptionsCount = 0;
  let rapidTransitionsCount = 0;
  let agentInterruptionsCount = 0; // Instances where the Agent interrupted the Client
  let clientInterruptionsCount = 0; // Instances where the Client interrupted the Agent
  
  for (let i = 1; i < turns.length; i++) {
    const current = turns[i];
    const prev = turns[i - 1];
    const currentIsAgent = current.speaker === firstSpeaker;
    const prevIsAgent = prev.speaker === firstSpeaker;
    
    // Check if overlap exists (overlap margin >= 50ms)
    if (current.startTime < prev.endTime - 0.05) {
      interruptionsCount++;
      if (currentIsAgent && !prevIsAgent) {
        agentInterruptionsCount++;
      } else if (!currentIsAgent && prevIsAgent) {
        clientInterruptionsCount++;
      }
    } else if (current.startTime - prev.endTime < 0.4) {
      // Extremely quick takeover (<400ms overlap-margin), often classified as swift conversational chime
      rapidTransitionsCount++;
    }
  }

  // Calculate rate of agent interruption compared to their total turns
  const agentInterruptionRate = agentTurnsCount > 0 
    ? (agentInterruptionsCount / agentTurnsCount) * 100 
    : 0;

  // 4. Calculate Percentage of correctly realized turns (Tours correctement réalisés)
  // Let's define a well-performed turn as one with an audio Quality Clarté score of >= 8/10
  const qualityThreshold = 8;
  const successfulAgentTurns = agentTurns.filter(t => t.audioQualityScore >= qualityThreshold);
  const successPct = agentTurnsCount > 0 
    ? (successfulAgentTurns.length / agentTurnsCount) * 100 
    : 100;

  // 5. Average Vocal Clarity Score of the Agent
  const agentAvgClarity = agentTurnsCount > 0 
    ? agentTurns.reduce((sum, t) => sum + t.audioQualityScore, 0) / agentTurnsCount 
    : 0;

  // 6. Average Turn Duration of the Agent (Durée moyenne de prise de parole)
  const agentAvgTurnDuration = agentTurnsCount > 0 
    ? agentDuration / agentTurnsCount 
    : 0;

  // 7. Background Noise Exposure Level for the Agent
  const agentNoiseTurns = agentTurns.filter(t => {
    const nb = t.noiseBackground?.toLowerCase() || "";
    return nb && nb !== "aucun" && nb !== "aucun bruit" && nb !== "pas de bruit" && nb !== "sans";
  }).length;
  const agentNoisePct = agentTurnsCount > 0 
    ? (agentNoiseTurns / agentTurnsCount) * 150 
    : 0;
  const agentCleanTurnsPct = 100 - Math.min(100, agentNoisePct);

  return (
    <div id="performance-diagnostics-dashboard" className="space-y-6">
      
      {/* Visual Header block with custom labels */}
      <div className="border-b border-warmgray pb-3 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-wheat animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-widest text-charcoal">
            Tableau de Bord de Performance • Agent GE CX
          </h3>
        </div>
        <span className="text-[10px] uppercase font-bold text-slate-500 font-sans">
          Métrique d'évaluation vocale & fluide
        </span>
      </div>

      {/* CORE STATS Bento Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Core Stat 1: Volume de l'Échange */}
        <div className="bg-white border border-warmgray p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cream/30 rounded-bl-full pointer-events-none flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-wheat opacity-45" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Volume de l'Échange</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-serif font-black tracking-tighter text-charcoal">{totalTurnsCount}</span>
              <span className="text-xs text-slate-500 font-serif italic">tours de parole au total</span>
            </div>
            
            {/* Split Distribution graph representation */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span>Agent GE CX</span>
                <span>Client</span>
              </div>
              <div className="h-1.5 bg-cream flex overflow-hidden">
                <div style={{ width: `${agentTurnsPct}%` }} className="bg-wheat" title={`Agent: ${agentTurnsCount} tours`} />
                <div style={{ width: `${clientTurnsPct}%` }} className="bg-charcoal" title={`Client: ${clientTurnsCount} tours`} />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
                <span>{agentTurnsCount} tours ({agentTurnsPct.toFixed(0)}%)</span>
                <span>{clientTurnsCount} tours ({clientTurnsPct.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Core Stat 2: Fluidité et Interruptions */}
        <div className="bg-white border border-warmgray p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cream/30 rounded-bl-full pointer-events-none flex items-center justify-center">
            <VolumeX className="w-5 h-5 text-wheat opacity-45" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Flux & Interruptions</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-serif font-black tracking-tighter text-charcoal">{interruptionsCount}</span>
              <span className="text-xs text-slate-500 font-serif italic">chevauchements détectés</span>
            </div>

            {/* Split Interruption breakdown details */}
            <div className="mt-3 flex items-center gap-6 text-[10px] font-sans border-t border-b border-dashed border-warmgray py-2 my-2 bg-cream/10 px-1">
              <div className="flex flex-col">
                <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wider">Commises par l'Agent</span>
                <span className="font-serif font-black text-wheat text-xs mt-0.5">
                  {agentInterruptionsCount} <span className="text-[9px] text-slate-500 font-normal font-sans">({agentInterruptionRate.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="w-[1px] h-6 bg-warmgray/60" />
              <div className="flex flex-col">
                <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wider">Subies par l'Agent</span>
                <span className="font-serif font-black text-charcoal text-xs mt-0.5">
                  {clientInterruptionsCount} <span className="text-[9px] text-slate-500 font-normal font-sans">({(clientTurnsCount > 0 ? (clientInterruptionsCount / clientTurnsCount) * 100 : 0).toFixed(0)}%)</span>
                </span>
              </div>
            </div>

            {/* Analysis micro comment */}
            <div className="mt-2.5 p-2 bg-[#FAF9F6] border border-warmgray flex items-start gap-2">
              {interruptionsCount === 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-600 leading-normal font-serif italic">
                    Splendide ! L'agent gère le temps de parole avec un respect absolu : aucune interruption détectée.
                  </p>
                </>
              ) : agentInterruptionRate <= 10 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-600 leading-normal font-serif italic">
                    Excellente fluidité de l'agent. Seulement {agentInterruptionsCount} coupures par l'agent, le client s'exprime pleinement.
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-600 leading-normal font-serif italic">
                    Alerte : l'agent coupe la parole ({agentInterruptionsCount} fois). Il est conseillé d'attendre 1s de silence avant d'initier un tour.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Core Stat 3: Taux de Réussite de l'Agent */}
        <div className="bg-white border border-warmgray p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cream/30 rounded-bl-full pointer-events-none flex items-center justify-center">
            <Award className="w-5 h-5 text-wheat opacity-45" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Tours Corrects de l'Agent</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-serif font-black tracking-tighter text-wheat">{successPct.toFixed(0)}%</span>
              <span className="text-xs text-slate-500 font-serif italic">score optimal de clarté (≥{qualityThreshold}/10)</span>
            </div>

            {/* Custom progress segment list block */}
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-slate-600">
                <span>{successfulAgentTurns.length} / {agentTurnsCount} tours réussis</span>
                <span>Seuil optimal : {qualityThreshold}/10</span>
              </div>
              <div className="w-full h-1 bg-cream overflow-hidden">
                <div 
                  style={{ width: `${successPct}%` }} 
                  className={`h-full ${successPct >= 80 ? "bg-wheat" : "bg-charcoal"}`} 
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* PROPOSED METRICS Row Grid - Elevating evaluation depth with beautiful data views */}
      <div className="bg-white border border-warmgray p-6">
        <div className="flex items-center gap-1.5 mb-5">
          <TrendingUp className="w-3.5 h-3.5 text-[#C4A484]" />
          <span className="text-[10px] font-black uppercase text-charcoal tracking-widest block">
            Métriques d'excellence supplémentaires (Proposées par l'Analyseur) :
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Metrique 1: Temps de parole relatif (Talk ratio) */}
          <div className="p-4 bg-cream/25 border border-warmgray flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                <Mic className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-wider">Taux d'occupation</span>
              </div>
              <h4 className="text-xs font-serif font-black text-charcoal">Ratio d'Élocution</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-serif italic">Part relative de prise de parole.</p>
            </div>
            
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                <span className="text-wheat">GE: {agentTalkRatio.toFixed(0)}%</span>
                <span className="text-charcoal">Client: {clientTalkRatio.toFixed(0)}%</span>
              </div>
              <div className="h-1 bg-warmgray flex overflow-hidden">
                <div style={{ width: `${agentTalkRatio}%` }} className="bg-wheat" />
                <div style={{ width: `${clientTalkRatio}%` }} className="bg-charcoal" />
              </div>
            </div>
          </div>

          {/* Metrique 2: Durée moyenne de réponse */}
          <div className="p-4 bg-cream/25 border border-warmgray flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                <Hourglass className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-wider">Calibrage de parole</span>
              </div>
              <h4 className="text-xs font-serif font-black text-charcoal">Durée de Prise (Moy.)</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-serif italic">Temps moyen de prise de parole par l'agent.</p>
            </div>
            
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-2xl font-serif font-black text-charcoal">{agentAvgTurnDuration.toFixed(1)}</span>
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">sec/tour</span>
            </div>
          </div>

          {/* Metrique 3: Indice d'élaboration et clarté acoustique */}
          <div className="p-4 bg-cream/25 border border-warmgray flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                <Compass className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-wider">Acoustic Score</span>
              </div>
              <h4 className="text-xs font-serif font-black text-charcoal">Clarté Vocale Moyenne</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-serif italic">Score de clarté générale de l'agent GE CX.</p>
            </div>
            
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-2xl font-serif font-black text-[#C4A484]">{agentAvgClarity.toFixed(1)}</span>
              <span className="text-[10px] font-mono text-slate-400 font-bold">/10</span>
              <span className={`text-[9px] px-1 py-0.5 ml-auto font-mono uppercase font-black tracking-wider ${
                agentAvgClarity >= 8 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
              }`}>
                {agentAvgClarity >= 8 ? "Excellent" : "Moyen"}
              </span>
            </div>
          </div>

          {/* Metrique 4: Taux d'isolation face au bruit */}
          <div className="p-4 bg-cream/25 border border-warmgray flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                <VolumeX className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-wider">Acoustic Shield</span>
              </div>
              <h4 className="text-xs font-serif font-black text-charcoal">Immunité aux Bruits</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-serif italic">Pourcentage de tours sans d'interférences de bruit.</p>
            </div>
            
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-2xl font-serif font-black text-charcoal">{(agentCleanTurnsPct).toFixed(0)}%</span>
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">de calme</span>
            </div>
          </div>

          {/* Metrique 5: Taux d'Interruption Actif de l'Agent */}
          <div className="p-4 bg-[#FAF9F6] border border-wheat/60 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-8 h-8 bg-wheat/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-wheat">
                <VolumeX className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-wider">Taux d'Interruption Actif</span>
              </div>
              <h4 className="text-xs font-serif font-black text-charcoal">Intrusion Active Agent</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-serif italic">Tours où l'agent a directement coupé le client.</p>
            </div>
            
            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-serif font-black text-wheat">{agentInterruptionRate.toFixed(1)}%</span>
                <span className="text-[10px] font-mono text-slate-400 font-bold">des tours</span>
              </div>
              
              <div className="mt-2 text-[9px] text-slate-400 font-mono tracking-tighter uppercase">
                {agentInterruptionsCount} cut-ins / {agentTurnsCount} tours
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* COMPLIANCE AND DIALOGUE AUDIT (GE CX) SECTION */}
      <div id="compliance-cx-audit-section" className="bg-white border border-warmgray p-6 space-y-6">
        <div className="border-b border-warmgray pb-3 flex flex-col md:flex-row md:items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-widest text-charcoal">
              Audit de Conformité & Risques Conversationnels • GE CX
            </h3>
          </div>
          <span className="text-[10px] uppercase font-bold text-slate-500 font-sans">
            Sécurité, Écarts de discours et Alignement Métier
          </span>
        </div>

        {/* Audit Cards Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Agent Hallucinations */}
          <div className="border border-warmgray p-4 flex flex-col justify-between bg-[#FCFCFB] shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-warmgray/40 pb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${hallucinations.length > 0 ? "bg-red-600 animate-pulse" : "bg-emerald-600"}`} />
                  Hallucinations (Agent CX)
                </span>
                <span className={`text-[10px] px-2 py-0.5 font-bold uppercase rounded ${
                  hallucinations.length > 0 ? "bg-red-50 border border-red-100 text-red-800" : "bg-emerald-50 border border-emerald-100 text-emerald-800"
                }`}>
                  {hallucinations.length} {hallucinations.length === 1 ? "écart" : "écarts"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-serif italic mb-4 leading-relaxed">
                Repère quand l'agent GE CX affirme une information erronée, invente des éléments ou s'exprime complètement hors du contexte de l'échange.
              </p>

              {hallucinations.length === 0 ? (
                <div className="p-3 bg-emerald-50/50 border border-emerald-100/60 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-emerald-800 font-bold leading-normal italic font-serif">
                    Conformité parfaite : aucune hallucination de fait ou de contexte détectée.
                  </span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {hallucinations.map((h, i) => (
                    <div key={i} className="p-3 border border-warmgray bg-white space-y-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5 justify-between">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          h.severity === "high" ? "bg-red-100 text-red-800" : h.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"
                        }`}>
                          Gravité {h.severity === "high" ? "Haute" : h.severity === "medium" ? "Moyenne" : "Faible"}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-charcoal font-bold">
                        {h.description}
                      </p>
                      {h.contextText && (
                        <div className="bg-[#FAFBF9] border-l-[3px] border-red-600 p-2 text-[10.5px] font-serif italic text-slate-600 leading-normal">
                          "{h.contextText}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Question Repetitions */}
          <div className="border border-warmgray p-4 flex flex-col justify-between bg-[#FCFCFB] shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-warmgray/40 pb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${repeatedQuestions.length > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-600"}`} />
                  Répétitions de Questions
                </span>
                <span className={`text-[10px] px-2 py-0.5 font-bold uppercase rounded ${
                  repeatedQuestions.length > 0 ? "bg-amber-50 border border-amber-100 text-amber-805" : "bg-emerald-50 border border-emerald-100 text-emerald-800"
                }`}>
                  {repeatedQuestions.length} {repeatedQuestions.length === 1 ? "élément" : "éléments"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-serif italic mb-4 leading-relaxed">
                Détecte les questions redondantes répétées de manière abusive ou les comportements où l'agent boucle de façon inefficace.
              </p>

              {repeatedQuestions.length === 0 ? (
                <div className="p-3 bg-emerald-50/50 border border-emerald-100/60 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-emerald-800 font-bold leading-normal italic font-serif">
                    Excellente dynamique : aucun comportement de répétition de question ou boucle détecté.
                  </span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {repeatedQuestions.map((q, i) => (
                    <div key={i} className="p-3 border border-warmgray bg-white space-y-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5 justify-between">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          q.severity === "high" ? "bg-red-100 text-red-800" : q.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"
                        }`}>
                          Gravité {q.severity === "high" ? "Haute" : q.severity === "medium" ? "Moyenne" : "Faible"}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-charcoal font-bold">
                        {q.description}
                      </p>
                      {q.contextText && (
                        <div className="bg-[#FAF9F6] border-l-[3px] border-amber-500 p-2 text-[10.5px] font-serif italic text-slate-600 leading-normal">
                          "{q.contextText}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Out-of-Scope User Steering */}
          <div className="border border-warmgray p-4 flex flex-col justify-between bg-[#FCFCFB] shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-warmgray/40 pb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${outOfScopeSteering.length > 0 ? "bg-blue-600 animate-pulse" : "bg-emerald-600"}`} />
                  Déviations du Client (Hors-Sujet)
                </span>
                <span className={`text-[10px] px-2 py-0.5 font-bold uppercase rounded ${
                  outOfScopeSteering.length > 0 ? "bg-blue-50 border border-blue-100 text-blue-800" : "bg-emerald-50 border border-emerald-100 text-emerald-800"
                }`}>
                  {outOfScopeSteering.length} {outOfScopeSteering.length === 1 ? "digression" : "digressions"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-serif italic mb-4 leading-relaxed">
                Repère les moments clés où l'utilisateur ou le client tente de dévier ou d'orienter l'échange en dehors de la relation service client.
              </p>

              {outOfScopeSteering.length === 0 ? (
                <div className="p-3 bg-emerald-50/50 border border-emerald-100/60 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-emerald-800 font-bold leading-normal italic font-serif">
                    Canal d'assistance préservé : l'échange est resté parfaitement cadré sur l'objet de services clients.
                  </span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {outOfScopeSteering.map((s, i) => (
                    <div key={i} className="p-3 border border-warmgray bg-white space-y-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5 justify-between">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          s.severity === "high" ? "bg-red-100 text-red-800" : s.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"
                        }`}>
                          Gravité {s.severity === "high" ? "Haute" : s.severity === "medium" ? "Moyenne" : "Faible"}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-charcoal font-bold">
                        {s.description}
                      </p>
                      {s.contextText && (
                        <div className="bg-[#FAF9F6] border-l-[3px] border-blue-500 p-2 text-[10.5px] font-serif italic text-slate-600 leading-normal">
                          "{s.contextText}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
