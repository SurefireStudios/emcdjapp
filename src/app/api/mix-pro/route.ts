import { NextRequest, NextResponse } from "next/server";
import { generateMixPro } from "@/utils/ffmpeg";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { getErrorMessage } from "@/utils/errors";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const bpmsStr = formData.getAll("bpms") as string[];
    
    const crossfade = parseInt(formData.get("crossfade") as string) || 8;
    const duration = parseInt(formData.get("duration") as string) || 45;
    const playLastTrack = formData.get("playLastTrack") === "true";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const bpms = bpmsStr.map(b => parseFloat(b));

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-pro-"));
    const outputDir = path.join(os.tmpdir(), "djmix-output");

    try { await fs.access(outputDir); } catch { await fs.mkdir(outputDir, { recursive: true }); }

    const savedFiles: string[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = Buffer.from(await file.arrayBuffer());
        const tempPath = path.join(tempDir, `pro_track_${i}.mp3`);
        await fs.writeFile(tempPath, buffer);
        savedFiles.push(tempPath);
    }

    const outputFilename = `pro_mix_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFilename);

    await generateMixPro(savedFiles, bpms, outputPath, duration, crossfade, playLastTrack);

    fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);

    return NextResponse.json({ 
        message: "Pro Mix generated successfully",
        mixUrl: `/api/download?file=${outputFilename}`
    });

  } catch (error) {
    console.error("Pro API Error processing mix:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to process the Pro mix") },
      { status: 500 }
    );
  }
}
