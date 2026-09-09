/**
 * Shared audio analysis types.
 *
 * These describe the JSON produced by `scripts/analyze.py` and consumed by both the
 * client components and the server-side mixing utilities. They live here rather than in
 * `src/utils/ffmpeg.ts` so client components can import the types without pulling the
 * `fluent-ffmpeg` module into the browser bundle.
 */

/** A contiguous region of a track, grouped by relative energy. */
export interface TrackSection {
  start: number;
  end: number;
  energy: number;
  label: "low" | "mid" | "high" | "full";
}

/** The full analysis of a single track. */
export interface TrackAnalysis {
  bpm: number;
  key: string;
  duration: number;
  beats: number[];
  downbeats: number[];
  sections: TrackSection[];
  bestEntryPoint: number;
  bestExitPoint: number;
  avgEnergy: number;
}

/** Stem paths returned by `scripts/split.py` (demucs two-stem separation). */
export interface SplitResult {
  vocals: string;
  no_vocals: string;
}
