"use client";

import { useState, useCallback } from "react";
import AudioPlayer from "@/components/AudioPlayer";
import { Loader2, Music, UploadCloud, X, LayoutTemplate, Settings2 } from "lucide-react";

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

export default function VirtualDJMixer() {
  const [tracks, setTracks] = useState<AnalyzedFile[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStage, setProcessStage] = useState<string>("");
  
  const [playLastTrackToEnd, setPlayLastTrackToEnd] = useState<boolean>(true);
  const [strategy, setStrategy] = useState<string>("high_energy");
  const [mixDuration, setMixDuration] = useState<string>("medium");
  
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

      setTracks(prev => {
        const updated = prev.map(t => 
          t.id === fileId ? { ...t, isAnalyzing: false, ...data } : t
        );
        return [...updated];
      });
    } catch (e: any) {
      setTracks(prev => prev.map(t => 
        t.id === fileId ? { ...t, isAnalyzing: false, error: e.message } : t
      ));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("audio/"));
      handleNewSelect(droppedFiles);
  }, []);

  const handleNewSelect = (newFiles: File[]) => {
    const newItems: AnalyzedFile[] = newFiles.map(file => {
      const id = Math.random().toString(36).substring(7);
      return { file, id, isAnalyzing: false };
    });

    setTracks(prev => [...prev, ...newItems]);
    
    (async () => {
        for (const t of newItems) {
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
    setProcessStage("Exporting Slices and Initializing AI Demucs...");
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
    formData.append("mixDuration", mixDuration);
    formData.append("playLastTrack", playLastTrackToEnd.toString());

    try {
      const response = await fetch("/api/mix-virtual", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setProcessStage("Mixing complete!");
      setMixUrl(data.mixUrl);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProcessStage(""), 2000);
    }
  };

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full grid md:grid-cols-3 gap-8">
        
        {/* Left Side: Upload & Library */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                  <h3 className="text-xl font-bold text-zinc-100 flex items-center">
                      <LayoutTemplate className="w-5 h-5 mr-3 text-cyan-400" />
                      Virtual DJ Bin
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                      Upload your setlist. The engine will intelligently sequence them and drop outgoing vocals.
                  </p>
              </div>
          </div>
          
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-cyan-500/50 hover:border-cyan-400 bg-cyan-900/10 hover:bg-cyan-900/20 cursor-pointer rounded-xl p-8 text-center transition-all"
          >
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              id="virtual-audio-upload"
              onChange={(e) => e.target.files && handleNewSelect(Array.from(e.target.files))}
            />
            <label htmlFor="virtual-audio-upload" className="cursor-pointer flex flex-col items-center">
              <UploadCloud className="w-10 h-10 text-cyan-400 mb-3" />
              <h4 className="text-lg font-semibold text-zinc-100">Drop Songs Here</h4>
              <p className="text-zinc-400 text-xs mt-1">Upload 2 to 6 tracks for a smooth AI mixed segment.</p>
            </label>
          </div>

          {tracks.length > 0 && (
            <div className="space-y-3 mt-6">
              {tracks.map((track, index) => (
                <div
                  key={track.id}
                  className="flex items-center justify-between bg-zinc-800 p-4 rounded-xl border border-zinc-700/50 shadow-lg relative group transition-all hover:border-cyan-500/50"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-zinc-400">
                        {index + 1}
                    </div>
                    <div className="max-w-[200px] md:max-w-xs">
                      <p className="text-sm font-semibold text-zinc-200 truncate">{track.file.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    {track.isAnalyzing ? (
                         <div className="flex items-center space-x-2 text-cyan-400 text-sm">
                           <Loader2 className="w-4 h-4 animate-spin" />
                           <span>Analyzing...</span>
                         </div>
                    ) : track.error ? (
                        <span className="text-xs text-red-500">Failed</span>
                    ) : !track.bpm ? (
                         <div className="flex items-center space-x-2 text-zinc-500 text-sm">
                           <span>Queued</span>
                         </div>
                    ) : (
                        <div className="flex items-center space-x-3 text-sm">
                            <div className="flex flex-col items-end">
                                <span className="font-mono font-bold text-zinc-200">{track.bpm} BPM</span>
                            </div>
                            <div className="h-6 w-px bg-zinc-700"></div>
                            <div className="flex flex-col items-start px-2 py-0.5 rounded text-xs">
                                <span className="font-mono font-bold text-cyan-400">{track.key}</span>
                            </div>
                        </div>
                    )}
                    <button onClick={() => removeTrack(track.id)} className="text-zinc-500 hover:text-red-500 p-1">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Virtual DJ Controls */}
        <div className="space-y-6">
          <div className="bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <Settings2 className="w-5 h-5 mr-3 text-cyan-500" />
              Perform Mix
            </h3>
            <p className="text-xs text-zinc-400 border-b border-zinc-700/50 pb-6 mb-6">
              AI applies structure-based arrangement and isolates overlapping vocals seamlessly.
            </p>

            <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Auto-Sequence
                  </label>
                  <select 
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="high_energy">🔥 Match Energy & Scale</option>
                    <option value="build_up">📈 Build Up Slowly</option>
                    <option value="chill">🧊 Keep Constant</option>
                  </select>
                  <p className="text-xs text-zinc-500 mt-2">
                    Overrules the upload order above.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Playtime Per Track
                  </label>
                  <select 
                    value={mixDuration}
                    onChange={(e) => setMixDuration(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="short">⏱️ Short (~1 Verse/Chorus)</option>
                    <option value="medium">🎵 Medium (~2 Verses/Choruses)</option>
                    <option value="full">📻 Full Length (Natural Outro)</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-zinc-700/50">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={playLastTrackToEnd}
                      onChange={(e) => setPlayLastTrackToEnd(e.target.checked)}
                      className="form-checkbox h-5 w-5 text-cyan-500 bg-zinc-800 border-zinc-600 rounded focus:ring-cyan-500 focus:ring-2"
                    />
                    <span className="text-sm font-medium text-zinc-300">Play the final track to end</span>
                  </label>
                </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={tracks.length < 2 || tracks.some(t => t.isAnalyzing) || isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all ${
                tracks.length < 2 || tracks.some(t => t.isAnalyzing)
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : isProcessing
                  ? "bg-cyan-600/50 text-white cursor-wait"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/25 hover:-translate-y-1"
              }`}
            >
              {isProcessing ? (
                <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Splitting Stems...</>
              ) : tracks.some(t => t.isAnalyzing) ? (
                "Waiting for Analysis..."
              ) : tracks.length < 2 ? (
                "Add 2+ Tracks"
              ) : (
                "Start Virtual DJ"
              )}
            </button>
            
            {processStage && (
               <div className="mt-4 text-center">
                 <p className="text-sm text-cyan-400 animate-pulse">{processStage}</p>
                 <p className="text-xs text-zinc-500 mt-1">This takes ~15s per transition depending on CPU.</p>
               </div>
            )}
            
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
