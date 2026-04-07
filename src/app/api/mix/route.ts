import { NextRequest, NextResponse } from "next/server";
import { generateMix } from "@/utils/ffmpeg";
import path from "path";
import fs from "fs/promises";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const crossfade = parseInt(formData.get("crossfade") as string) || 6;
    const duration = parseInt(formData.get("duration") as string) || 60;
    const playLastTrack = formData.get("playLastTrack") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json({ error: "Maximum 5 files allowed" }, { status: 400 });
    }

    // Define directories
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-"));
    const outputDir = path.join(os.tmpdir(), "djmix-output");

    // Ensure output directory exists
    try {
      await fs.access(outputDir);
    } catch {
      await fs.mkdir(outputDir, { recursive: true });
    }

    const savedFiles: string[] = [];

    // Save uploaded files to the temp directory
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = Buffer.from(await file.arrayBuffer());
        // Clean filename and ensure simple extension
        const ext = path.extname(file.name) || ".mp3";
        const tempPath = path.join(tempDir, `track_${i}${ext}`);
        
        await fs.writeFile(tempPath, buffer);
        savedFiles.push(tempPath);
    }

    const outputFilename = `mix_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFilename);

    // Call our FFmpeg utility
    await generateMix(savedFiles, outputPath, duration, crossfade, playLastTrack);

    // Cleanup input temp files asynchronously (don't await so we can return response faster)
    fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);

    return NextResponse.json({ 
        message: "Mix generated successfully",
        mixUrl: `/api/download?file=${outputFilename}`
    });

  } catch (error: any) {
    console.error("API Error processing mix:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process the mix" },
      { status: 500 }
    );
  }
}
