import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import util from "util";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;
  try {
    const contentType = req.headers.get("content-type") || "";
    let fileBuffer: Buffer;
    let fileName = "track.mp3";

    if (contentType.includes("application/json")) {
        const body = await req.json();
        if (!body.fileBase64) {
             return NextResponse.json({ error: "No file base64 data provided" }, { status: 400 });
        }
        const b64Data = body.fileBase64.includes(",") ? body.fileBase64.split(",")[1] : body.fileBase64;
        fileBuffer = Buffer.from(b64Data, "base64");
        fileName = body.filename || "track.mp3";
    } else {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
          return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        fileBuffer = Buffer.from(await file.arrayBuffer());
        fileName = file.name;
    }

    const jobId = Math.random().toString(36).substring(7);
    const jobFile = path.join(os.tmpdir(), `job_${jobId}.json`);
    
    // Set initial status
    await fs.writeFile(jobFile, JSON.stringify({ status: "analyzing" }));

    // Define temporary directories for execution
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "djmix-analyze-"));
    const ext = path.extname(fileName) || ".mp3";
    const tempPath = path.join(tempDir, `track${ext}`);

    await fs.writeFile(tempPath, fileBuffer);

    // Call Python script asynchronously (do not await here!)
    const pythonExecutable = process.platform === "win32" 
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python3");
      
    const scriptPath = path.join(process.cwd(), "scripts", "analyze.py");

    // Start background processing
    execPromise(
      `"${pythonExecutable}" "${scriptPath}" "${tempPath}"`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 480000, killSignal: 'SIGKILL' } // 8 min
    ).then(async ({ stdout }) => {
        try {
            const rawOutput = stdout.trim();
            const jsonStart = rawOutput.indexOf('{');
            const jsonEnd = rawOutput.lastIndexOf('}') + 1;
            const cleanJson = jsonStart !== -1 ? rawOutput.substring(jsonStart, jsonEnd) : rawOutput;
            const result = JSON.parse(cleanJson);
            
            if (!result.success) throw new Error(result.error);
            
            await fs.writeFile(jobFile, JSON.stringify({ status: "done", data: result }));
        } catch (e: any) {
            await fs.writeFile(jobFile, JSON.stringify({ status: "error", error: e.message }));
        } finally {
            if (tempDir) fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
        }
    }).catch(async (error: any) => {
        await fs.writeFile(jobFile, JSON.stringify({ status: "error", error: error.message }));
        if (tempDir) fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    });

    return NextResponse.json({ jobId, status: "analyzing" });

  } catch (error: any) {
    console.error("Analysis Initiation Error:", error);
    return NextResponse.json({ error: error.message || "Failed to start analysis" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    try {
        const jobId = req.nextUrl.searchParams.get("jobId");
        if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
        
        const jobFile = path.join(os.tmpdir(), `job_${jobId}.json`);
        
        try {
            const data = await fs.readFile(jobFile, 'utf-8');
            return NextResponse.json(JSON.parse(data));
        } catch (e) {
            return NextResponse.json({ status: "not_found" });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
