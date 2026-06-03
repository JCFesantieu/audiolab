/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioAnalysis } from "../types";

export const demoAnalysis: AudioAnalysis = {
  turns: [
    {
      speaker: "Locuteur A (Jean)",
      startTime: 0.0,
      endTime: 5.6,
      text: "Bonjour à tous, merci de nous rejoindre pour ce débriefing hebdomadaire du projet. Est-ce que tout le monde m'entend de manière fluide ?",
      noiseBackground: "Aucun bruit",
      audioQualityScore: 9,
      audioQualityNotes: "Signal clair, très bon niveau d'amplification, peu de réverbération.",
      emotion: "neutral",
      interruption: false,
      role: "agent"
    },
    {
      speaker: "Locuteur B (Claire)",
      startTime: 6.2,
      endTime: 13.8,
      text: "Bonjour Jean ! De mon côté je t'entends bien, mais désolée s'il y a un peu de souffle chez moi, mon micro-casque frotte parfois contre mon pull.",
      noiseBackground: "Frottement de tissu (microphone contre vêtement)",
      audioQualityScore: 6,
      audioQualityNotes: "Bruits de frottement transitoires de haute intensité, saturation par intermittence.",
      emotion: "hesitation",
      interruption: false,
      role: "client"
    },
    {
      speaker: "Locuteur A (Jean)",
      startTime: 14.5,
      endTime: 21.3,
      text: "Très bien Claire, pas de soucis majeurs mais essaye de l'écarter un peu. Sinon Michel, tu as pu avancer sur la préparation des maquettes d'interface ?",
      noiseBackground: "Petit cliquetis métallique",
      audioQualityScore: 8,
      audioQualityNotes: "Voix claire, mais cliquetis mécanique léger en arrière-plan.",
      emotion: "satisfaction",
      interruption: false,
      role: "agent"
    },
    {
      speaker: "Locuteur C (Michel)",
      startTime: 22.0,
      endTime: 31.5,
      text: "Salut à tous. Oui, j'ai terminé l'intégration des retours utilisateurs. Je termine de sauvegarder le fichier là, vous m'excuserez si on entend mon clavier.",
      noiseBackground: "Frappes lourdes de clavier (clavier mécanique Switch Blue)",
      audioQualityScore: 5,
      audioQualityNotes: "Echo de pièce important, claquements de touches à haute percussion couvrant presque les consonnes.",
      emotion: "neutral",
      interruption: false,
      role: "client"
    },
    {
      speaker: "Locuteur B (Claire)",
      startTime: 32.2,
      endTime: 38.0,
      text: "Ah oui effectivement Michel ! On dirait que tu tapes avec un marteau-piqueur ! Mais les maquettes ont l'air magnifiques en tout cas.",
      noiseBackground: "Souffle continu & Rires légers",
      audioQualityScore: 7,
      audioQualityNotes: "Rapport signal/bruit moyen, quelques rires provoquent des crêtes rapides mais supportables.",
      emotion: "surprise",
      interruption: true,
      role: "client"
    },
    {
      speaker: "Locuteur A (Jean)",
      startTime: 38.5,
      endTime: 45.0,
      text: "Superbe ! Je propose qu'on valide cette version et qu'on programme l'atelier utilisateur pour mardi prochain. Merci à tous deux et bonne journée !",
      noiseBackground: "Bruit de fermeture de porte arrière",
      audioQualityScore: 8,
      audioQualityNotes: "Perturbation externe soudaine en fin de segment, mais voix préservée et intelligible.",
      emotion: "satisfaction",
      interruption: false,
      role: "agent"
    }
  ],
  overallQuality: {
    score: 7.2,
    summary: "Enregistrement de qualité moyenne à bonne (7.2/10). L'intelligibilité des voix est préservée sur l'ensemble de la séance, mais certains participants ont des configurations matérielles qui génèrent des bruits parasites notables (frottements physiques, frappes de clavier mécanique à forte récurrence). L'ambiance de la pièce de Michel présente également une légère réverbération (écho de pièce vide).",
    noiseTypes: [
      "Frottement physiques micro/vêtement",
      "Frappes lourdes sur clavier mécanique",
      "Echo / Réverbération acoustique moyenne",
      "Sons transitoires métalliques",
      "Bruits de fond environnementaux (porte)"
    ],
    strengths: [
      "Niveau de voix global homogène (bonne normalisation)",
      "Voix du locuteur principal (Jean) de niveau studio",
      "Très faible distorsion globale sur l'harmonie vocale",
      "Silence de fond correct des pièces de Jean et Claire"
    ],
    weaknesses: [
      "Frottement de micro très agressif lors des interventions de Claire",
      "Pollution sonore par les frappes de touches chez Michel",
      "Prise de son de Michel trop éloignée induisant de la réverbération"
    ],
    recommendations: [
      "Michel devrait utiliser une directivité cardioïde serrée ou placer le micro plus près de sa bouche.",
      "Activer un noise builder ou filtre logiciel d'atténuation automatique des bruits impulsifs (Crisp/RTX Voice) pour filtrer les claviers.",
      "Claire devrait attacher le câble de son micro-casque avec une pince pour éviter tout frottement physique contre son vêtement lors de ses mouvements.",
      "Proposer une barrière anti-souffle (mousse de protection) pour limiter les bruits d'expiration directe."
    ],
    agentHallucinations: [
      {
        description: "L'agent GE CX évoque de fausses fonctionnalités d'intégration automatique avec SAP non incluses dans les spécifications validées.",
        severity: "medium",
        contextText: "Oui, j'ai terminé l'intégration des retours utilisateurs... tout est synchronisé avec le module principal SAP-Fi de manière native."
      }
    ],
    agentRepeatedQuestions: [
      {
        description: "L'agent redemande plusieurs fois si le son est fluide de manière insistante dès le début du débriefing.",
        severity: "low",
        contextText: "Est-ce que tout le monde m'entend de manière fluide ? De mon côté je t'entends bien... Très bien Claire."
      }
    ],
    userOutofScopeSteering: [
      {
        description: "L'interlocuteur essaie de dévier l'échange en discutant longuement de bruits environnementaux et d'évaluations de matériel de rénovation bricolage hors-sujet.",
        severity: "medium",
        contextText: "Ah oui effectivement Michel ! On dirait que tu tapes avec un marteau-piqueur ! Mais les maquettes ont l'air magnifiques."
      }
    ]
  }
};
