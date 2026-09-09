import type { TrackAnalysis } from "@/types/audio";
import ffmpeg from "fluent-ffmpeg";

// ─── Types ───────────────────────────────────────────────────────────────────

// TrackSection and TrackAnalysis live in src/types/audio.ts so client components can
// import them without pulling fluent-ffmpeg into the browser bundle. Re-exported here
// so existing "@/utils/ffmpeg" imports keep working.
export type { TrackSection, TrackAnalysis } from "@/types/audio";

// ─── Legacy: Basic Mix (unchanged) ──────────────────────────────────────────

export const generateMix = (
  inputFiles: string[],
  outputFile: string,
  durationPerTrack: number,
  crossfadeDuration: number,
  playLastTrackToEnd: boolean = false
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (inputFiles.length === 0) {
      return reject(new Error("No input files provided"));
    }

    if (inputFiles.length === 1) {
      // Single track — just copy it
      const command = ffmpeg();
      command.input(inputFiles[0])
        .outputOptions(["-y", "-c:a", "libmp3lame", "-q:a", "2"])
        .save(outputFile)
        .on("error", (err) => reject(err))
        .on("end", () => resolve(outputFile));
      return;
    }

    const command = ffmpeg();

    inputFiles.forEach((file) => {
      command.input(file);
    });

    let filterGraph = "";
    
    // First track
    filterGraph += `[0:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS[a0]; `;
    let previousOutput = "[a0]";

    for (let i = 1; i < inputFiles.length; i++) {
        const isLastPair = i === inputFiles.length - 1;
        const currentOutput = `[a0${i}]`; 
        const outLabel = isLastPair ? "[out]" : currentOutput;
        
        let nextInputFilter = "";
        
        if (isLastPair) {
            if (playLastTrackToEnd) {
                nextInputFilter = `[${i}:a]asetpts=PTS-STARTPTS[t${i}]; `;
            } else {
                const fadeStart = durationPerTrack - 4;
                nextInputFilter = `[${i}:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart}:d=4[t${i}]; `;
            }
        } else {
            nextInputFilter = `[${i}:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS[t${i}]; `;
        }
        
        filterGraph += nextInputFilter;
        filterGraph += `${previousOutput}[t${i}]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri${outLabel}`;
        
        if (!isLastPair) {
            filterGraph += "; ";
        }
        previousOutput = currentOutput;
    }

    command
      .complexFilter(filterGraph, ["[out]"])
      .outputOptions(["-y"])
      .save(outputFile)
      .on("error", (err) => {
        console.error("FFMPEG Error:", err.message);
        reject(err);
      })
      .on("end", () => resolve(outputFile));
  });
};

// ─── Legacy: Pro Mix with tempo matching (unchanged) ────────────────────────

export const generateMixPro = (
  inputFiles: string[],
  bpms: number[],
  outputFile: string,
  durationPerTrack: number,
  crossfadeDuration: number,
  playLastTrackToEnd: boolean = false
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (inputFiles.length === 0) return reject(new Error("No input files provided"));

    if (inputFiles.length === 1) {
      const command = ffmpeg();
      command.input(inputFiles[0])
        .outputOptions(["-y", "-c:a", "libmp3lame", "-q:a", "2"])
        .save(outputFile)
        .on("error", (err) => reject(err))
        .on("end", () => resolve(outputFile));
      return;
    }

    const command = ffmpeg();
    inputFiles.forEach((file) => command.input(file));
    
    const baseBpm = bpms[0] || 120;
    let filterGraph = "";
    let previousOutput = "[a0]";

    filterGraph += `[0:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS[a0]; `;

    for (let i = 1; i < inputFiles.length; i++) {
        const currentBpm = bpms[i] || baseBpm;
        const isLastPair = i === inputFiles.length - 1;
        
        let ratio = baseBpm / currentBpm;
        if (ratio < 0.85) ratio = 0.85;
        if (ratio > 1.15) ratio = 1.15;

        const nextProcessed = `[t${i}]`;
        
        if (isLastPair) {
            if (playLastTrackToEnd) {
                filterGraph += `[${i}:a]asetpts=PTS-STARTPTS,atempo=${ratio}${nextProcessed}; `;
            } else {
                const fadeStart = durationPerTrack - 4;
                filterGraph += `[${i}:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS,atempo=${ratio},afade=t=out:st=${fadeStart}:d=4${nextProcessed}; `;
            }
        } else {
            filterGraph += `[${i}:a]atrim=duration=${durationPerTrack},asetpts=PTS-STARTPTS,atempo=${ratio}${nextProcessed}; `;
        }
        
        const currentOutput = `[a${i}]`;
        const outLabel = isLastPair ? "[out]" : currentOutput;
        
        filterGraph += `${previousOutput}${nextProcessed}acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri${outLabel}`;
        
        if (!isLastPair) {
            filterGraph += "; ";
        }
        previousOutput = currentOutput;
    }

    command
      .complexFilter(filterGraph, ["[out]"])
      .outputOptions(["-y"])
      .save(outputFile)
      .on("error", (err) => {
        console.error("FFMPEG Pro Error:", err.message);
        reject(err);
      })
      .on("end", () => resolve(outputFile));
  });
};

// ─── NEW: Smart Mix (structure-aware, beat-aligned, energy-optimized) ───────

/**
 * Snap a timestamp to the nearest downbeat for clean transitions.
 */
function snapToDownbeat(time: number, downbeats: number[]): number {
  if (downbeats.length === 0) return time;
  let closest = downbeats[0];
  let minDist = Math.abs(time - closest);
  for (const db of downbeats) {
    const dist = Math.abs(time - db);
    if (dist < minDist) {
      minDist = dist;
      closest = db;
    }
  }
  return closest;
}

/**
 * Calculate the transition (crossfade) duration based on BPM.
 * Aim for 4-8 bars of crossfade depending on BPM.
 * Slower = longer crossfade, faster = shorter.
 */
function calculateCrossfadeDuration(bpm: number): number {
  // 4 bars at the given BPM
  const beatsPerBar = 4;
  const bars = 4; // 4 bars of crossfade
  const crossfade = (beatsPerBar * bars * 60) / bpm;
  // Clamp between 4 and 16 seconds
  return Math.max(4, Math.min(16, crossfade));
}

/**
 * Build an atempo filter chain for ratios outside 0.5-2.0 range.
 * FFmpeg's atempo only supports 0.5 to 100.0, but quality degrades above 2.0.
 * For quality, we chain multiple atempo filters.
 */
function buildAtempoChain(ratio: number): string {
  if (ratio >= 0.5 && ratio <= 2.0) {
    return `atempo=${ratio.toFixed(4)}`;
  }
  // Chain multiple atempo filters
  const parts: string[] = [];
  let remaining = ratio;
  while (remaining > 2.0) {
    parts.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(",");
}

export interface SmartMixTrack {
  file: string;
  analysis: TrackAnalysis;
}

export const generateSmartMix = (
  tracks: SmartMixTrack[],
  outputFile: string,
  strategy: "high_energy" | "chill" | "build_up" = "high_energy",
  playLastTrackToEnd: boolean = false
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (tracks.length === 0) return reject(new Error("No tracks provided"));

    // Single track — just trim to best section and output
    if (tracks.length === 1) {
      const t = tracks[0];
      const command = ffmpeg();
      const entry = t.analysis.bestEntryPoint;
      const exit = t.analysis.bestExitPoint;
      command.input(t.file)
        .complexFilter(
          `[0:a]atrim=start=${entry}:end=${exit},asetpts=PTS-STARTPTS,afade=t=in:d=2,afade=t=out:st=${(exit - entry) - 2}:d=2[out]`,
          ["[out]"]
        )
        .outputOptions(["-y"])
        .save(outputFile)
        .on("error", (err) => reject(err))
        .on("end", () => resolve(outputFile));
      return;
    }

    // ── Sort tracks by strategy ──────────────────────────────────────────
    const sorted = [...tracks];
    switch (strategy) {
      case "high_energy":
        // Order so energy peaks mid-set then finishes strong
        sorted.sort((a, b) => {
          if (!a || !a.analysis) return 0;
          if (!b || !b.analysis) return 0;
          return a.analysis.avgEnergy - b.analysis.avgEnergy;
        });
        // Interleave: build up energy
        break;
      case "chill":
      case "build_up":
        sorted.sort((a, b) => {
          if (!a || !a.analysis) return 0;
          if (!b || !b.analysis) return 0;
          return a.analysis.avgEnergy - b.analysis.avgEnergy;
        });
        break;
    }

    // Then sort by BPM within similar energy groups for smoother transitions
    // Group by energy tier, then sort by BPM within each tier
    const reordered = sortByBpmWithinEnergyGroups(sorted);

    const command = ffmpeg();
    reordered.forEach((t) => command.input(t.file));

    // Use the first track's BPM as the target BPM
    const targetBpm = reordered[0].analysis.bpm;
    let filterGraph = "";
    let previousOutput = "[a0]";

    // ── First track ────────────────────────────────────────────────────
    const first = reordered[0];
    const firstEntry = snapToDownbeat(first.analysis.bestEntryPoint, first.analysis.downbeats);
    const firstExit = snapToDownbeat(first.analysis.bestExitPoint, first.analysis.downbeats);

    filterGraph += `[0:a]atrim=start=${firstEntry}:end=${firstExit},asetpts=PTS-STARTPTS,afade=t=in:d=2[a0]; `;

    // ── Subsequent tracks ──────────────────────────────────────────────
    for (let i = 1; i < reordered.length; i++) {
      const track = reordered[i];
      const isLast = i === reordered.length - 1;

      // Calculate BPM ratio for tempo matching
      let ratio = targetBpm / track.analysis.bpm;
      if (ratio < 0.85) ratio = 0.85;
      if (ratio > 1.15) ratio = 1.15;
      const atempoFilter = buildAtempoChain(ratio);

      // Get entry/exit points snapped to downbeats
      const entry = snapToDownbeat(track.analysis.bestEntryPoint, track.analysis.downbeats);
      let exit: number = 0;
      
      if (!isLast || !playLastTrackToEnd) {
        exit = snapToDownbeat(track.analysis.bestExitPoint, track.analysis.downbeats);
      }

      const trackDuration = exit - entry;

      // Calculate crossfade duration (based on average of the two BPMs)
      const avgBpm = (targetBpm + track.analysis.bpm) / 2;
      const crossfade = calculateCrossfadeDuration(avgBpm);

      // Build the input filter
      const nextProcessed = `[t${i}]`;
      let inputFilter = `[${i}:a]atrim=start=${entry}`;
      if (!isLast || !playLastTrackToEnd) {
        inputFilter += `:end=${exit}`;
      }
      inputFilter += `,asetpts=PTS-STARTPTS,${atempoFilter}`;
      
      // Add fade-in at start for smoother entry
      inputFilter += `,afade=t=in:d=1`;

      // Add fade-out for last track if not playing to end
      if (isLast && !playLastTrackToEnd) {
        const fadeStart = Math.max(0, (trackDuration / ratio) - 4);
        inputFilter += `,afade=t=out:st=${fadeStart.toFixed(2)}:d=4`;
      }
      
      inputFilter += `${nextProcessed}; `;
      filterGraph += inputFilter;

      // Crossfade with previous
      const currentOutput = `[a${i}]`;
      const outLabel = isLast ? "[out]" : currentOutput;

      // Use exponential curves for smoother, more natural crossfade
      filterGraph += `${previousOutput}${nextProcessed}acrossfade=d=${crossfade.toFixed(2)}:c1=exp:c2=exp${outLabel}`;

      if (!isLast) {
        filterGraph += "; ";
      }
      previousOutput = currentOutput;
    }

    command
      .complexFilter(filterGraph, ["[out]"])
      .outputOptions(["-y", "-b:a", "192k"])
      .save(outputFile)
      .on("error", (err) => {
        console.error("FFMPEG Smart Mix Error:", err.message);
        console.error("Filter graph:", filterGraph);
        reject(err);
      })
      .on("end", () => resolve(outputFile));
  });
};

/**
 * Sort tracks by BPM within energy tiers for smoother transitions.
 */
function sortByBpmWithinEnergyGroups<T extends SmartMixTrack>(tracks: T[]): T[] {
  // Split into energy tiers (using safe access with fallbacks to avoid any possible crash)
  const low = tracks.filter(t => (t?.analysis?.avgEnergy || 0) < 0.4);
  const mid = tracks.filter(t => (t?.analysis?.avgEnergy || 0) >= 0.4 && (t?.analysis?.avgEnergy || 0) < 0.7);
  const high = tracks.filter(t => (t?.analysis?.avgEnergy || 0) >= 0.7);

  // Sort each tier by BPM safely
  low.sort((a, b) => (a?.analysis?.bpm || 120) - (b?.analysis?.bpm || 120));
  mid.sort((a, b) => (a?.analysis?.bpm || 120) - (b?.analysis?.bpm || 120));
  high.sort((a, b) => (a?.analysis?.bpm || 120) - (b?.analysis?.bpm || 120));

  // Order: build from low → mid → high
  return [...low, ...mid, ...high];
}

// ─── NEW: Mashup Mix (overlay mode with background bed) ─────────────────────

export interface MashupOptions {
  mainTracks: SmartMixTrack[];     // Tracks with vocals that swap in/out
  backgroundTrack: SmartMixTrack;  // Continuous instrumental bed
  mainVolume: number;              // 0.0 - 1.0 volume for main tracks
  bgVolume: number;                // 0.0 - 1.0 volume for background
  playLastTrackToEnd: boolean;
}

export const generateMashupMix = (
  options: MashupOptions,
  outputFile: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const { mainTracks, backgroundTrack, mainVolume, bgVolume, playLastTrackToEnd } = options;

    if (mainTracks.length === 0) return reject(new Error("No main tracks provided"));

    const command = ffmpeg();
    
    // Input 0: background track
    command.input(backgroundTrack.file);
    
    // Inputs 1..N: main tracks
    mainTracks.forEach((t) => command.input(t.file));

    const bgBpm = backgroundTrack.analysis.bpm;
    
    // Calculate total duration needed for the background track
    // Sum up the best sections of all main tracks

    const mainDurations: number[] = [];
    for (const t of mainTracks) {
      const dur = t.analysis.bestExitPoint - t.analysis.bestEntryPoint;
      mainDurations.push(dur);
    }

    // ── Build filter graph ───────────────────────────────────────────────
    let filterGraph = "";

    // Background track: loop/extend to cover total duration, tempo-match, apply volume
    
    // If background is shorter than needed, we'll use aloop or just let it play
    // Apply EQ: cut mids on background to make room for vocals
    filterGraph += `[0:a]asetpts=PTS-STARTPTS,volume=${bgVolume.toFixed(2)},`;
    filterGraph += `equalizer=f=1000:t=q:w=1.5:g=-4,`; // Cut mids slightly
    filterGraph += `equalizer=f=3000:t=q:w=1.5:g=-3`; // Cut upper-mids
    filterGraph += `[bg]; `;

    // Process each main track: trim to best section, tempo-match to bg BPM, apply volume
    const processedMains: string[] = [];
    for (let i = 0; i < mainTracks.length; i++) {
      const track = mainTracks[i];
      const inputIdx = i + 1; // offset by 1 because background is input 0
      const isLast = i === mainTracks.length - 1;

      const entry = track.analysis.bestEntryPoint;
      let exit: number;
      if (isLast && playLastTrackToEnd) {
        exit = track.analysis.duration;
      } else {
        exit = track.analysis.bestExitPoint;
      }

      let ratio = bgBpm / track.analysis.bpm;
      if (ratio < 0.85) ratio = 0.85;
      if (ratio > 1.15) ratio = 1.15;
      const atempoFilter = buildAtempoChain(ratio);

      const label = `[m${i}]`;
      filterGraph += `[${inputIdx}:a]atrim=start=${entry}:end=${exit},asetpts=PTS-STARTPTS,`;
      filterGraph += `${atempoFilter},volume=${mainVolume.toFixed(2)},`;
      filterGraph += `afade=t=in:d=2,`;
      
      // Fade out at end
      const trackDur = (exit - entry) / ratio;
      const fadeOutStart = Math.max(0, trackDur - 3);
      filterGraph += `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=3`;
      filterGraph += `${label}; `;
      
      processedMains.push(label);
    }

    // Concatenate main tracks with crossfades between them
    if (processedMains.length === 1) {
      filterGraph += `${processedMains[0]}acopy[mains]; `;
    } else {
      // Chain crossfades between main tracks
      let prevMain = processedMains[0];
      for (let i = 1; i < processedMains.length; i++) {
        const isLast = i === processedMains.length - 1;
        const outLabel = isLast ? "[mains]" : `[mc${i}]`;
        const crossfade = calculateCrossfadeDuration(bgBpm);
        filterGraph += `${prevMain}${processedMains[i]}acrossfade=d=${crossfade.toFixed(2)}:c1=exp:c2=exp${outLabel}; `;
        prevMain = outLabel;
      }
    }

    // Mix background and main tracks together
    // The background should be trimmed to match the main track duration
    filterGraph += `[bg][mains]amix=inputs=2:duration=shortest:dropout_transition=3[out]`;

    command
      .complexFilter(filterGraph, ["[out]"])
      .outputOptions(["-y", "-b:a", "192k"])
      .save(outputFile)
      .on("error", (err) => {
        console.error("FFMPEG Mashup Error:", err.message);
        console.error("Filter graph:", filterGraph);
        reject(err);
      })
      .on("end", () => resolve(outputFile));
  });
};

// ─── NEW: Virtual DJ Mix (Stem separation support) ───────────────────────────

export const exportSlice = (
  inputFile: string,
  start: number,
  duration: number,
  outputFile: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions(["-y", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2"])
      .save(outputFile)
      .on("error", reject)
      .on("end", () => resolve(outputFile));
  });
};

export interface VirtualDJTrack extends SmartMixTrack {
  noVocalsOutro?: string;
  outroStart?: number;
  resolvedExit?: number;
}

export const resolveExitPoint = (
  trackAnalysis: TrackAnalysis,
  mixDuration: "short" | "medium" | "full"
): number => {
  if (mixDuration === "full") {
    return trackAnalysis.bestExitPoint || trackAnalysis.duration;
  }

  // Fallback if no sections
  if (!trackAnalysis.sections || trackAnalysis.sections.length === 0) {
    if (mixDuration === "short") return Math.min(90, trackAnalysis.duration);
    if (mixDuration === "medium") return Math.min(150, trackAnalysis.duration);
  }

  let highCount = 0;
  const entry = trackAnalysis.bestEntryPoint || 0;

  for (const sec of trackAnalysis.sections) {
    // Only look at sections after entry
    if (sec.start >= entry && (sec.label === "high" || sec.label === "full")) {
      highCount++;
      if (mixDuration === "short" && highCount === 1) {
        return sec.end; // Exit after the first chorus
      }
      if (mixDuration === "medium" && highCount === 2) {
        return sec.end; // Exit after the second chorus
      }
    }
  }

  // If we couldn't find enough high sections, just fallback to bestExitPoint
  return trackAnalysis.bestExitPoint || trackAnalysis.duration;
};

export const generateVirtualDJMix = (
  tracks: VirtualDJTrack[],
  outputFile: string,
  strategy: "high_energy" | "chill" | "build_up" = "high_energy",
  mixDuration: "short" | "medium" | "full" = "medium",
  playLastTrackToEnd: boolean = false
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (tracks.length === 0) return reject(new Error("No tracks provided"));

    // Sort logic (same as SmartMix)
    const sorted = [...tracks];
    switch (strategy) {
      case "high_energy":
      case "chill":
      case "build_up":
        sorted.sort((a, b) => {
          if (!a || !a.analysis) return 0;
          if (!b || !b.analysis) return 0;
          return a.analysis.avgEnergy - b.analysis.avgEnergy;
        });
        break;
    }
    const reordered = sortByBpmWithinEnergyGroups(sorted);

    const command = ffmpeg();
    
    // Add all inputs in deterministic order to map correctly
    let inputIndex = 0;
    
    // Track file maps
    const trackInputMap = new Map<number, { main: number; outro?: number }>();
    
    reordered.forEach((t, i) => {
      command.input(t.file);
      const mapObj: { main: number; outro?: number } = { main: inputIndex++ };
      
      if (t.noVocalsOutro) {
        command.input(t.noVocalsOutro);
        mapObj.outro = inputIndex++;
      }
      trackInputMap.set(i, mapObj);
    });

    const targetBpm = reordered[0]?.analysis?.bpm || 120;
    let filterGraph = "";
    let previousOutput = "[a0]";

    for (let i = 0; i < reordered.length; i++) {
        const track = reordered[i];
        if (!track || !track.analysis) continue;
        const isFirst = i === 0;
        const isLast = i === reordered.length - 1;
        const mapObj = trackInputMap.get(i)!;
        
        let ratio = targetBpm / (track.analysis.bpm || targetBpm);
        if (ratio < 0.85) ratio = 0.85;
        if (ratio > 1.15) ratio = 1.15;
        const atempoFilter = buildAtempoChain(ratio);

        const entry = isFirst ? snapToDownbeat(track.analysis.bestEntryPoint || 0, track.analysis.downbeats || []) : snapToDownbeat(track.analysis.bestEntryPoint || 0, track.analysis.downbeats || []);
        
        let exit: number;
        if (isLast && playLastTrackToEnd) {
          exit = track.analysis.duration || 180;
        } else {
          exit = track.resolvedExit ?? snapToDownbeat(resolveExitPoint(track.analysis, mixDuration), track.analysis.downbeats || []);
        }

        const nextProcessed = `[t${i}]`;
        
        // Build the track body
        if (track.noVocalsOutro && track.outroStart !== undefined) {
             // It has an instrumental outro to concat
             const outroStart = track.outroStart;
             const delayStr = Math.round((outroStart - entry) * 1000);
             filterGraph += `[${mapObj.main}:a]atrim=start=${entry}:duration=${outroStart - entry},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[body${i}]; `;
             filterGraph += `[${mapObj.outro}:a]asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${delayStr}|${delayStr}[delayed_outro${i}]; `;
             filterGraph += `[body${i}][delayed_outro${i}]amix=inputs=2:duration=longest,${atempoFilter}`;
        } else {
             // No stem override
             if (isLast && playLastTrackToEnd) {
                 filterGraph += `[${mapObj.main}:a]atrim=start=${entry},asetpts=PTS-STARTPTS,${atempoFilter}`;
             } else {
                 filterGraph += `[${mapObj.main}:a]atrim=start=${entry}:duration=${exit - entry},asetpts=PTS-STARTPTS,${atempoFilter}`;
             }
        }
        
        if (isFirst) {
            filterGraph += `,afade=t=in:d=2[a0]; `;
            continue; // first track just sets previousOutput exactly
        }

        // Add fades to non-first tracks
        filterGraph += `,afade=t=in:d=1`;
        
        if (isLast && !playLastTrackToEnd) {
            const trackDuration = exit - entry;
            const fadeStart = Math.max(0, (trackDuration / ratio) - 4);
            filterGraph += `,afade=t=out:st=${fadeStart.toFixed(2)}:d=4`;
        }
        
        filterGraph += `${nextProcessed}; `;
        
        const currentOutput = `[a${i}]`;
        const outLabel = isLast ? "[out]" : currentOutput;
        
        const avgBpm = (targetBpm + (track.analysis.bpm || 120)) / 2;
        const crossfade = calculateCrossfadeDuration(avgBpm);
        
        filterGraph += `${previousOutput}${nextProcessed}acrossfade=d=${crossfade.toFixed(2)}:c1=tri:c2=tri${outLabel}`;
        
        if (!isLast) filterGraph += "; ";
        previousOutput = currentOutput;
    }

    command
      .complexFilter(filterGraph, ["[out]"])
      .outputOptions(["-y", "-b:a", "192k"])
      .save(outputFile)
      .on("error", (err) => {
        console.error("FFMPEG Virtual DJ Error:", err.message);
        reject(err);
      })
      .on("end", () => resolve(outputFile));
  });
};
