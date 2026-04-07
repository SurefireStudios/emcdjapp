"use client";

import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Download } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string | null;
}

export default function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;

    setIsReady(false);
    setIsPlaying(false);

    // Initialize wavesurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "rgba(245, 158, 11, 0.4)", // amber-600 with opacity
      progressColor: "#f59e0b", // amber-600
      cursorColor: "#f8fafc",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 100,
      normalize: true,
    });

    wavesurferRef.current = wavesurfer;

    wavesurfer.load(audioUrl);

    wavesurfer.on("ready", () => {
      setIsReady(true);
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.playPause();
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement("a");
      a.href = audioUrl;
      a.download = "dj_mix_output.mp3";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (!audioUrl) return null;

  return (
    <div className="w-full bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 backdrop-blur-sm mt-8 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-100">Your Mix is Ready!</h3>
        <button
          onClick={handleDownload}
          className="flex items-center space-x-2 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 px-4 py-2 rounded-full"
        >
          <Download className="w-4 h-4" />
          <span>Download Mix</span>
        </button>
      </div>

      <div ref={containerRef} className="w-full mb-6" />

      <div className="flex justify-center">
        <button
          onClick={togglePlay}
          disabled={!isReady}
          className={`p-4 rounded-full flex items-center justify-center transition-all ${
            isReady
              ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
          }`}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current ml-1" />
          )}
        </button>
      </div>
    </div>
  );
}
