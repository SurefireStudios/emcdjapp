import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import util from "util";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  let tempDir = null;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Define temporary directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-analyze-"));
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".mp3";
    const tempPath = path.join(tempDir, `track${ext}`);

    await fs.writeFile(tempPath, buffer);

    // Call Python script via virtual environment (Cross-platform compatibility)
    const isWindows = process.platform === "win32";
    const pythonExecutable = isWindows 
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python3");
      
    const scriptPath = path.join(process.cwd(), "scripts", "analyze.py");

    // Increase max buffer for larger JSON output (beat arrays can be large)
    // Add 2 minute timeout so it fails explicitly instead of spinning forever
    const { stdout, stderr } = await execPromise(
      `"${pythonExecutable}" "${scriptPath}" "${tempPath}"`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 120000 } // 10MB buffer, 120s timeout
    );

    const rawOutput = stdout.trim();
    // In case Python prints warnings to stdout, extract just the JSON
    const jsonStart = rawOutput.indexOf('{');
    const jsonEnd = rawOutput.lastIndexOf('}') + 1;
    const cleanJson = jsonStart !== -1 ? rawOutput.substring(jsonStart, jsonEnd) : rawOutput;
    
    const result = JSON.parse(cleanJson);

    if (!result.success) {
        throw new Error(result.error);
    }

    return NextResponse.json({
      bpm: result.bpm,
      key: result.key,
      duration: result.duration,
      beats: result.beats,
      downbeats: result.downbeats,
      sections: result.sections,
      bestEntryPoint: result.best_entry_point,
      bestExitPoint: result.best_exit_point,
      avgEnergy: result.avg_energy,
    });

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze track" },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
        fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    }
  }
}
