import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    if (!filename) {
      return new NextResponse("Filename is required", { status: 400 });
    }

    // Prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    const filePath = path.join(os.tmpdir(), "djmix-output", safeFilename);

    try {
      await fs.access(filePath);
    } catch {
      return new NextResponse("File not found or expired", { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        // Range requests and caching might be useful, but standard cache-control for ephemeral files is fine.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("API Error downloading mix:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
