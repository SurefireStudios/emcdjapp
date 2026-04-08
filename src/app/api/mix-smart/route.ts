import { NextRequest, NextResponse } from "next/server";
import { generateSmartMix, SmartMixTrack, TrackAnalysis } from "@/utils/ffmpeg";
import path from "path";
import fs from "fs/promises";
import os from "os";

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const analysisDataRaw = formData.get("analysisData") as string;
    const strategy = (formData.get("strategy") as string) || "high_energy";
    const playLastTrack = formData.get("playLastTrack") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    if (!analysisDataRaw) {
      return NextResponse.json({ error: "No analysis data provided" }, { status: 400 });
    }

    const analysisData: TrackAnalysis[] = JSON.parse(analysisDataRaw);

    if (analysisData.length !== files.length) {
      return NextResponse.json(
        { error: "Mismatch between files and analysis data count" },
        { status: 400 }
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-smart-"));
    const outputDir = path.join(os.tmpdir(), "djmix-output");

    try { await fs.access(outputDir); } catch { await fs.mkdir(outputDir, { recursive: true }); }

    // Save files and build track objects
    const tracks: SmartMixTrack[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name) || ".mp3";
      const tempPath = path.join(tempDir, `smart_track_${i}${ext}`);
      await fs.writeFile(tempPath, buffer);

      tracks.push({
        file: tempPath,
        analysis: analysisData[i],
      });
    }

    const outputFilename = `smart_mix_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFilename);

    const validStrategy = ["high_energy", "chill", "build_up"].includes(strategy)
      ? (strategy as "high_energy" | "chill" | "build_up")
      : "high_energy";

    await generateSmartMix(tracks, outputPath, validStrategy, playLastTrack);

    // Cleanup temp files async
    fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);

    return NextResponse.json({
      message: "Smart Mix generated successfully",
      mixUrl: `/api/download?file=${outputFilename}`,
    });

  } catch (error: any) {
    console.error("Smart Mix API Error:", error);
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    }
    return NextResponse.json(
      { error: error.message || "Failed to process the smart mix" },
      { status: 500 }
    );
  }
}
