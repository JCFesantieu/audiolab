# Release Notes - Audiolab

This document tracks all version releases, features, improvements, and bug fixes for the Audiolab project.

---

## [v3.0.0] - 2026-06-03

### Added
- **Acoustic Tone & Emotion Diarization**: Leveraging Gemini's native multimodality to analyze vocal signals directly. Dialogue turns now capture emotional tones (e.g., `neutral`, `frustration`, `satisfaction`, `hesitation`, `surprise`) and track conversational dynamics.
- **Secure Direct-to-Bucket Uploads**: Integrated direct GCS stream uploading from the client browser using 15-minute ephemeral signed PUT URLs. Keeps the Express server memory footprint at **0 MB**, eliminating Out-of-Memory (OOM) risks on Cloud Run.
- **Sentiment Heatmap Player**: A responsive Canvas-based player (`SentimentHeatmapPlayer`) rendering color-coded emotional segments on top of the audio waveform. Includes speed controllers (`0.75x` to `2.0x`) and a "Skip to Friction" shortcut.
- **Speech Attenuation Filter**: A client-side Web Audio `BiquadFilterNode` equalizer toggle to filter low-frequency rumbles (Highpass 250Hz) and high hiss sounds (Lowpass 3200Hz) to clarify human speech.
- **Terraform Infrastructure**: Serverless GCP hosting architecture definitions, private Cloud Storage bucket configurations, and Secret Manager environment keys.

### Fixed
- **Speaker Role Inversion (Voice Matching)**: Fixed a bug where dialogue roles and badges were inverted if a Client spoke first. Replaced the first-speaker heuristics in [SentimentHeatmapPlayer.tsx](file:///Users/jcfesantieu/devlocal/Remix/src/components/SentimentHeatmapPlayer.tsx) and [AgentPerformancePanel.tsx](file:///Users/jcfesantieu/devlocal/Remix/src/components/AgentPerformancePanel.tsx) with explicit, Gemini-diarized `role === "agent"` classifications.
- **History Recording Playback (Beep Sound)**: Resolved a bug where playback of historic reports from Firestore produced a synthetic "BEEP" sound. Updated `handleAnalyzeFile` and `handleSaveReportToCloud` in [App.tsx](file:///Users/jcfesantieu/devlocal/Remix/src/App.tsx) to ensure local audio files are successfully uploaded to GCS using matching Firestore document IDs (`customDocId`).
- **Large File Analysis (Universal GCS Ingress)**: Enforced universal client-side streaming to Cloud Storage (`PUT` signed URLs) for all users (both authenticated and anonymous/unauthenticated). Bypasses Cloud Run's strict 32 MB HTTP request limit, allowing seamless analysis of WAV audio files exceeding 20 MB directly via GCS references (`gcsUri`).

---

## [v2.0.0] - 2026-05-29

### Added
- **Structured JSON Output**: Integrated `responseSchema` validation forcing Gemini model outputs to strictly match structured interfaces.
- **Firebase Authentication**: Integrated Google Sign-In with Firebase Auth.
- **User-Isolated Database Storage**: Saved report listings in Cloud Firestore segmented by authenticated user IDs.

---

## [v1.0.0] - 2026-05-20
- **Initial Release**: Core audio player, basic speech-to-text transcript output, and basic audio quality statistics.
