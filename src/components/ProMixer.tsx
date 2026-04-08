"use client";

import { useState, useCallback, useEffect } from "react";
import AudioPlayer from "@/components/AudioPlayer";
import { Loader2, Music, UploadCloud, X, Zap } from "lucide-react";

interface AnalyzedFile {
  file: File;
  id: string;
  isAnalyzing: boolean;
  bpm?: number;
  key?: string;
  duration?: number;
  sections?: any;
  beats?: number[];
  downbeats?: number[];
  bestEntryPoint?: number;
  bestExitPoint?: number;
  avgEnergy?: number;
  error?: string;
}

export default function ProMixer() {
  const [tracks, setTracks] = useState<AnalyzedFile[]>([]);
  const [strategy, setStrategy] = useState<string>("high_energy");
  const [isProcessing, setIsProcessing] = useState(false);
  const [playLastTrackToEnd, setPlayLastTrackToEnd] = useState<boolean>(true);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
  });

  const analyzeTrack = async (fileId: string, file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/analyze", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64, filename: file.name })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      const jobId = data.jobId;
      if (!jobId) throw new Error("No job ID returned from server");

      while (true) {
          await new Promise(r => setTimeout(r, 3000));
          const pollRes = await fetch(`/api/analyze?jobId=${jobId}`);
          const pollData = await pollRes.json();
          
          if (pollData.status === "done") {
               setTracks(prev => {
                 const updated = prev.map(t => 
                   t.id === fileId ? { ...t, isAnalyzing: false, ...pollData.data } : t
                 );
                 return [...updated].sort((a, b) => (a.bpm || 999) - (b.bpm || 999));
               });
               break;
          } else if (pollData.status === "error") {
               throw new Error(pollData.error || "Analysis failed internally");
          } else if (pollData.status === "not_found") {
               throw new Error("Analysis job lost or expired");
          }
      }
    } catch (e: any) {
      setTracks(prev => prev.map(t => 
        t.id === fileId ? { ...t, isAnalyzing: false, error: e.message } : t
      ));
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("audio/")
      );

      handleNewFiles(droppedFiles);
    },
    []
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) =>
        file.type.startsWith("audio/")
      );
      handleNewFiles(selectedFiles);
    }
  };

  const handleNewFiles = (newFiles: File[]) => {
    const newTracks: AnalyzedFile[] = newFiles.map(file => {
      const id = Math.random().toString(36).substring(7);
      return { file, id, isAnalyzing: false };
    });

    setTracks(prev => [...prev, ...newTracks]);

    (async () => {
        for (const t of newTracks) {
            setTracks(prev => prev.map(tr => tr.id === t.id ? { ...tr, isAnalyzing: true } : tr));
            await analyzeTrack(t.id, t.file);
        }
    })();
  };

  const removeTrack = (id: string) => {
    setTracks((prev) => prev.filter(t => t.id !== id));
  };

  const handleGenerate = async () => {
    if (tracks.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    setMixUrl(null);

    const formData = new FormData();
    tracks.forEach((track) => {
        formData.append("files", track.file);
    });
    
    const analysisData = tracks.map(t => ({
      bpm: t.bpm,
      key: t.key,
      duration: t.duration,
      beats: t.beats,
      downbeats: t.downbeats,
      sections: t.sections,
      bestEntryPoint: t.bestEntryPoint,
      bestExitPoint: t.bestExitPoint,
      avgEnergy: t.avgEnergy
    }));
    
    formData.append("analysisData", JSON.stringify(analysisData));
    formData.append("strategy", strategy);
    formData.append("playLastTrack", playLastTrackToEnd.toString());

    try {
      const response = await fetch("/api/mix-smart", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMixUrl(data.mixUrl);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full grid md:grid-cols-3 gap-8">
        
        {/* Left Side: Upload & Analysis */}
        <div className="md:col-span-2 space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-amber-500/50 hover:border-amber-400 bg-zinc-800/50 hover:bg-zinc-800/80 cursor-pointer rounded-xl p-8 text-center transition-all"
          >
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              id="pro-audio-upload"
              onChange={handleFileInput}
            />
            <label htmlFor="pro-audio-upload" className="cursor-pointer">
              <UploadCloud className="w-12 h-12 mx-auto text-amber-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-zinc-100">Add Tracks for Analysis</h3>
              <p className="text-zinc-400 text-sm">
                AI will detect BPM and auto-order them for the perfect transition.
              </p>
            </label>
          </div>

          {tracks.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center justify-between">
                <span>Setlist ({tracks.length})</span>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">Auto-ordered by BPM</span>
              </h4>
              <div className="space-y-3">
                  {tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between bg-zinc-800 p-4 rounded-xl border border-zinc-700/50 shadow-lg relative group transition-all hover:border-amber-500/50"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-zinc-400">
                            {index + 1}
                        </div>
                        <div className="max-w-[200px] md:max-w-xs">
                          <p className="text-sm font-semibold text-zinc-200 truncate" title={track.file.name}>
                            {track.file.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {(track.file.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        {track.isAnalyzing ? (
                             <div className="flex items-center space-x-2 text-amber-400 text-sm">
                               <Loader2 className="w-4 h-4 animate-spin" />
                               <span>Analyzing...</span>
                             </div>
                        ) : track.error ? (
                            <span className="text-xs text-red-500">Analysis Failed</span>
                        ) : !track.bpm ? (
                             <div className="flex items-center space-x-2 text-zinc-500 text-sm">
                               <span>Queued</span>
                             </div>
                        ) : (
                            <div className="flex flex-col space-y-1 text-sm">
                                <div className="flex items-center space-x-3">
                                    <div className="flex flex-col items-end">
                                        <span className="text-zinc-400 text-xs text-right">BPM</span>
                                        <span className="font-mono font-bold text-zinc-200">{track.bpm}</span>
                                    </div>
                                    <div className="h-6 w-px bg-zinc-700"></div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-zinc-400 text-xs">KEY</span>
                                        <span className="font-mono font-bold text-amber-400">{track.key}</span>
                                    </div>
                                </div>
                                {track.avgEnergy && (
                                    <div className="w-full h-1.5 bg-zinc-700 rounded overflow-hidden mt-1 relative" title={`Energy Level: ${track.avgEnergy.toFixed(2)}`}>
                                        <div 
                                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500" 
                                          style={{ width: `${Math.min(100, (track.avgEnergy / 0.3) * 100)}%` }} 
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                          onClick={() => removeTrack(track.id)}
                          className="text-zinc-500 hover:text-red-500 p-1"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Process */}
        <div className="space-y-6">
          <div className="bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <Zap className="w-5 h-5 mr-3 text-amber-500" />
              Pro Generation
            </h3>
            <p className="text-sm text-zinc-400 border-b border-zinc-700/50 pb-6 mb-6">
              The AI Engine matches structures, scales, and downbeats for continuous energy flow.
            </p>

            <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Mix Strategy
                  </label>
                  <select 
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  >
                    <option value="high_energy">🔥 High Energy (Chorus to Chorus)</option>
                    <option value="build_up">📈 Build Up (Progressive Energy)</option>
                    <option value="chill">🧊 Chill (Smooth Verses/Bridges)</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-zinc-700/50">
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
                    If disabled, the last track will fade out early.
                  </p>
                </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={tracks.length === 0 || tracks.some(t => t.isAnalyzing) || isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all ${
                tracks.length === 0 || tracks.some(t => t.isAnalyzing)
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : isProcessing
                  ? "bg-amber-600/50 text-white cursor-wait"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25 hover:-translate-y-1"
              }`}
            >
              {isProcessing ? (
                <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Rendering...</>
              ) : tracks.some(t => t.isAnalyzing) ? (
                "Waiting for Analysis..."
              ) : (
                "Export Clean Mix"
              )}
            </button>
            {error && <div className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-200 text-sm">{error}</div>}
          </div>
        </div>
      </div>

      <div className="w-full mt-4">
        {mixUrl && <AudioPlayer audioUrl={mixUrl} />}
      </div>
    </div>
  );
}
