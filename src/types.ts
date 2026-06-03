/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AudioTurn {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  noiseBackground: string;
  audioQualityScore: number;
  audioQualityNotes: string;
  emotion: string;
  interruption: boolean;
}


export interface CxDetection {
  description: string;
  severity: "low" | "medium" | "high";
  contextText?: string;
}

export interface AudioAnalysisOverall {
  score: number;
  summary: string;
  noiseTypes: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  agentHallucinations?: CxDetection[];
  agentRepeatedQuestions?: CxDetection[];
  userOutofScopeSteering?: CxDetection[];
}

export interface AudioAnalysis {
  turns: AudioTurn[];
  overallQuality: AudioAnalysisOverall;
}
