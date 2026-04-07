"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import AudioPlayer from "@/components/AudioPlayer";
import { Loader2 } from "lucide-react";

export default function BasicMixer() {
  const [files, setFiles] = useState<File[]>([]);
  const [crossfade, setCrossfade] = useState<number>(6);
  const [duration, setDuration] = useState<number>(60);
  const [playLastTrackToEnd, setPlayLastTrackToEnd] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    setMixUrl(null);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("crossfade", crossfade.toString());
    formData.append("duration", duration.toString());
    formData.append("playLastTrack", playLastTrackToEnd.toString());

    try {
      const response = await fetch("/api/mix", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate mix");
      }

      setMixUrl(data.mixUrl);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full text-center mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2 text-zinc-100">
          Basic Mix
        </h2>
        <p className="text-zinc-400 max-w-xl mx-auto font-light">
          Upload up to 5 tracks. We'll automatically trim and crossfade them into a seamless, continuous mix.
        </p>
      </div>

      <div className="w-full grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <FileUploader files={files} setFiles={setFiles} maxFiles={5} />
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 backdrop-blur-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-6 flex items-center">
              <span className="bg-zinc-700 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3 text-zinc-300">⚙️</span>
              Mix Settings
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                  <span>Crossfade Duration</span>
                  <span className="text-amber-400 font-bold">{crossfade}s</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={crossfade}
                  onChange={(e) => setCrossfade(Number(e.target.value))}
                  className="w-full accent-amber-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-sm font-medium text-zinc-300 mb-2">
                  <span>Track Duration</span>
                  <span className="text-amber-400 font-bold">{duration}s</span>
                </label>
                <input
                  type="range"
                  min="15"
                  max="180"
                  step="15"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full accent-amber-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={playLastTrackToEnd}
                    onChange={(e) => setPlayLastTrackToEnd(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-amber-500 bg-zinc-800 border-zinc-600 rounded focus:ring-amber-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-zinc-300">Play last track to end</span>
                </label>
                <p className="text-xs text-zinc-500 mt-2 pl-8 tracking-wide">
                  If disabled, the last track will fade out early to match the track duration.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-700/50">
              <button
                onClick={handleGenerate}
                disabled={files.length === 0 || isProcessing}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all ${
                  files.length === 0
                    ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                    : isProcessing
                    ? "bg-amber-600/50 text-white cursor-wait"
                    : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25 hover:shadow-amber-500/40 transform hover:-translate-y-1"
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    Generating Mix...
                  </>
                ) : (
                  "Generate Mix"
                )}
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full mt-4">
        {mixUrl && <AudioPlayer audioUrl={mixUrl} />}
      </div>
    </div>
  );
}
