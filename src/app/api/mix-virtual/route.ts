import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { 
  generateVirtualDJMix, 
  exportSlice,
  resolveExitPoint,
  VirtualDJTrack 
} from "@/utils/ffmpeg";
import { spawn } from "child_process";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const analysisDataStr = formData.get("analysisData") as string;
    const strategyStr = formData.get("strategy") as string;
    const mixDurationStr = formData.get("mixDuration") as string;
    const playLastTrack = formData.get("playLastTrack") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files uploaded" },
        { status: 400 }
      );
    }

    const analysisData = JSON.parse(analysisDataStr || "[]");
    const strategy = (strategyStr as "high_energy" | "chill" | "build_up") || "high_energy";
    const mixDuration = (mixDurationStr as "short" | "medium" | "full") || "medium";

    // Setup working directories
    const tempDir = path.join(process.cwd(), "tmp", "virtual_dj");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const outputDir = path.join(process.cwd(), "public", "mixes");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Write tracks to disk
    const tracks: VirtualDJTrack[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        const filePath = path.join(tempDir, `track_${i}_${Date.now()}.mp3`);
        fs.writeFileSync(filePath, buffer);
        
        tracks.push({
            file: filePath,
            analysis: analysisData[i]
        });
    }

    // Process Stems for Overlaps
    for (let i = 0; i < tracks.length - 1; i++) {
        const track = tracks[i];
        const exitPoint = resolveExitPoint(track.analysis, mixDuration);
        track.resolvedExit = exitPoint;
        const sliceStart = Math.max(0, exitPoint - 16); // Extract 16s before exit
        const sliceDur = exitPoint - sliceStart;
        
        const slicePath = path.join(tempDir, `slice_${i}_${Date.now()}.wav`);
        
        try {
            await exportSlice(track.file, sliceStart, sliceDur, slicePath);
            
            // Run Demucs
            const splitOutDir = path.join(tempDir, `split_${i}_${Date.now()}`);
            const pythonScript = path.join(process.cwd(), "scripts", "split.py");
            
            const pythonProcess = spawn(
                path.join(process.cwd(), ".venv", "Scripts", "python.exe"), 
                [pythonScript, "--input", slicePath, "--outdir", splitOutDir],
                { shell: true }
            );
            
            const splitResult = await new Promise<any>((resolve, reject) => {
                let stdoutData = "";
                let stderrData = "";
                
                pythonProcess.stdout.on("data", (data) => stdoutData += data.toString());
                pythonProcess.stderr.on("data", (data) => stderrData += data.toString());
                
                pythonProcess.on("close", (code) => {
                    if (code !== 0) return reject(new Error(`Demucs split failed: ${stderrData}`));
                    try {
                        const jsonLines = stdoutData.trim().split("\n");
                        const lastLine = jsonLines[jsonLines.length - 1]; // We output JSON on the last line
                        resolve(JSON.parse(lastLine));
                    } catch (e) {
                        reject(new Error("Failed to parse split.py output JSON"));
                    }
                });
            });
            
            track.noVocalsOutro = splitResult.no_vocals;
            track.outroStart = sliceStart;
        } catch (e) {
            console.error(`Failed isolating vocals for track ${i}, continuing without it.`, e);
            // Optionally, we fallback to exactly what Smart Mix does
        }
    }

    // Generate Final Virtual DJ Mix
    const outputFileName = `virtualdj_mix_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    await generateVirtualDJMix(
      tracks,
      outputPath,
      strategy,
      mixDuration,
      playLastTrack
    );

    return NextResponse.json({
      success: true,
      mixUrl: `/mixes/${outputFileName}`,
    });
  } catch (error: any) {
    console.error("Virtual DJ API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate mix" },
      { status: 500 }
    );
  }
}
