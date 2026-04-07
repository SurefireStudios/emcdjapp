import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

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
                // Do not trim the last track
                nextInputFilter = `[${i}:a]asetpts=PTS-STARTPTS[t${i}]; `;
            } else {
                // Trim and fade out the last track
                const fadeStart = durationPerTrack - 4; // 4 second fade out at the end of the duration
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
