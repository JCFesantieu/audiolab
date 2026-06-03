/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple synthesizer using Web Audio API to create auditory chimes
// representing Speaker A and Speaker B for the demo mode.

let audioCtx: AudioContext | null = null;
let currentOsc: OscillatorNode | null = null;
let currentGain: GainNode | null = null;
let playTimeout: any = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

export function playSynthBeep(speaker: string, durationMs: number) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Stop any current playing notes
    stopSynth();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Differentiate speaker frequencies
    let freq = 293.66; // D4 for Speaker A
    if (speaker.toLowerCase().includes("b") || speaker.toLowerCase().includes("2")) {
      freq = 392.00; // G4 for Speaker B
    } else if (speaker.toLowerCase().includes("c") || speaker.toLowerCase().includes("3")) {
      freq = 440.00; // A4 for Speaker C
    }

    osc.type = "triangle"; // Warm, soft sound
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Apply smooth envelope to prevent clicking sounds
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05); // Fade in
    gain.gain.setValueAtTime(0.15, ctx.currentTime + (durationMs / 1000) - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durationMs / 1000)); // Fade out

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    
    currentOsc = osc;
    currentGain = gain;

    playTimeout = setTimeout(() => {
      stopSynth();
    }, durationMs);

  } catch (e) {
    console.warn("Web Audio API synthesis is not fully supported or blocked by user gesture:", e);
  }
}

export function stopSynth() {
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }
  if (currentOsc) {
    try {
      currentOsc.stop();
      currentOsc.disconnect();
    } catch (e) {}
    currentOsc = null;
  }
  if (currentGain) {
    try {
      currentGain.disconnect();
    } catch (e) {}
    currentGain = null;
  }
}
