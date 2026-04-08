import { NextRequest, NextResponse } from "next/server";
import { generateMashupMix, SmartMixTrack, TrackAnalysis, MashupOptions } from "@/utils/ffmpeg";
import path from "path";
import fs from "fs/promises";
import os from "os";

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  try {
    const formData = await req.formData();
    
    // Main tracks (vocals)
    const mainFiles = formData.getAll("mainFiles") as File[];
    const mainAnalysisRaw = formData.get("mainAnalysis") as string;
    
    // Background track (instrumental)
    const bgFile = formData.get("bgFile") as File;
    const bgAnalysisRaw = formData.get("bgAnalysis") as string;
    
    // Settings
    const mainVolume = parseFloat(formData.get("mainVolume") as string) || 0.85;
    const bgVolume = parseFloat(formData.get("bgVolume") as string) || 0.45;
    const playLastTrack = formData.get("playLastTrack") === "true";

    if (!mainFiles || mainFiles.length === 0) {
      return NextResponse.json({ error: "No main tracks uploaded" }, { status: 400 });
    }
    if (!bgFile) {
      return NextResponse.json({ error: "No background track uploaded" }, { status: 400 });
    }
    if (!mainAnalysisRaw || !bgAnalysisRaw) {
      return NextResponse.json({ error: "Missing analysis data" }, { status: 400 });
    }

    const mainAnalysis: TrackAnalysis[] = JSON.parse(mainAnalysisRaw);
    const bgAnalysis: TrackAnalysis = JSON.parse(bgAnalysisRaw);

    if (mainAnalysis.length !== mainFiles.length) {
      return NextResponse.json(
        { error: "Mismatch between main files and analysis data" },
        { status: 400 }
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-mashup-"));
    const outputDir = path.join(os.tmpdir(), "djmix-output");
    try { await fs.access(outputDir); } catch { await fs.mkdir(outputDir, { recursive: true }); }

    // Save background track
    const bgBuffer = Buffer.from(await bgFile.arrayBuffer());
    const bgExt = path.extname(bgFile.name) || ".mp3";
    const bgPath = path.join(tempDir, `bg_track${bgExt}`);
    await fs.writeFile(bgPath, bgBuffer);

    const backgroundTrack: SmartMixTrack = {
      file: bgPath,
      analysis: bgAnalysis,
    };

    // Save main tracks
    const mainTracks: SmartMixTrack[] = [];
    for (let i = 0; i < mainFiles.length; i++) {
      const file = mainFiles[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name) || ".mp3";
      const tempPath = path.join(tempDir, `main_track_${i}${ext}`);
      await fs.writeFile(tempPath, buffer);

      mainTracks.push({
        file: tempPath,
        analysis: mainAnalysis[i],
      });
    }

    const outputFilename = `mashup_mix_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFilename);

    const mashupOptions: MashupOptions = {
      mainTracks,
      backgroundTrack,
      mainVolume,
      bgVolume,
      playLastTrackToEnd: playLastTrack,
    };

    await generateMashupMix(mashupOptions, outputPath);

    fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);

    return NextResponse.json({
      message: "Mashup Mix generated successfully",
      mixUrl: `/api/download?file=${outputFilename}`,
    });

  } catch (error: any) {
    console.error("Mashup API Error:", error);
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    }
    return NextResponse.json(
      { error: error.message || "Failed to process the mashup mix" },
      { status: 500 }
    );
  }
}
