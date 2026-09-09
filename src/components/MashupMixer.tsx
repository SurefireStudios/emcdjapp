"use client";

import { useState, useCallback } from "react";
import AudioPlayer from "@/components/AudioPlayer";
import { Loader2, Music, UploadCloud, X, Zap, Layers } from "lucide-react";
import { TrackSection } from "@/types/audio";
import { getErrorMessage } from "@/utils/errors";

interface AnalyzedFile {
  file: File;
  id: string;
  isAnalyzing: boolean;
  bpm?: number;
  key?: string;
  duration?: number;
  sections?: TrackSection[];
  beats?: number[];
  downbeats?: number[];
  bestEntryPoint?: number;
  bestExitPoint?: number;
  avgEnergy?: number;
  error?: string;
}

export default function MashupMixer() {
  const [bgTrack, setBgTrack] = useState<AnalyzedFile | null>(null);
  const [mainTracks, setMainTracks] = useState<AnalyzedFile[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [playLastTrackToEnd, setPlayLastTrackToEnd] = useState<boolean>(true);
  const [bgVolume, setBgVolume] = useState<number>(0.45);
  const [mainVolume, setMainVolume] = useState<number>(0.85);
  
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
  });

  const analyzeTrack = async (fileId: string, file: File, type: "instrumental" | "acapella") => {
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/analyze", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64, filename: file.name, type })
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
              if (type === "instrumental") {
                setBgTrack(prev => (prev?.id === fileId ? { ...prev, isAnalyzing: false, ...pollData.data } : prev));
              } else {
                setMainTracks(prev => {
                  const updated = prev.map(t => t.id === fileId ? { ...t, isAnalyzing: false, ...pollData.data } : t);
                  return [...updated].sort((a, b) => (a.bpm || 999) - (b.bpm || 999));
                });
              }
              break;
          } else if (pollData.status === "error") {
               throw new Error(pollData.error || "Analysis failed internally");
          } else if (pollData.status === "not_found") {
               throw new Error("Analysis job lost or expired");
          }
      }
    } catch (e) {
      if (type === "instrumental") {
        setBgTrack(prev => (prev?.id === fileId ? { ...prev, isAnalyzing: false, error: getErrorMessage(e) } : prev));
      } else {
        setMainTracks(prev => prev.map(t => 
          t.id === fileId ? { ...t, isAnalyzing: false, error: getErrorMessage(e) } : t
        ));
      }
    }
  };

  const handleBgDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("audio/"));
      if (droppedFiles.length > 0) handleBgSelect(droppedFiles[0]);
  }, []);

  const handleBgSelect = (file: File) => {
    const id = Math.random().toString(36).substring(7);
    const newBg = { file, id, isAnalyzing: true, type: "instrumental" as const };
    setBgTrack(newBg);
    analyzeTrack(id, file, "instrumental");
  };

  const handleMainDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("audio/"));
      handleMainSelect(droppedFiles);
  }, []);

  const handleMainSelect = (newFiles: File[]) => {
    const newAcatracks: AnalyzedFile[] = newFiles.map(file => {
      const id = Math.random().toString(36).substring(7);
      return { file, id, isAnalyzing: false, type: "acapella" };
    });

    setMainTracks(prev => [...prev, ...newAcatracks]);
    
    (async () => {
      for (const t of newAcatracks) {
        setMainTracks(prev => prev.map(tr => tr.id === t.id ? { ...tr, isAnalyzing: true } : tr));
        await analyzeTrack(t.id, t.file, "acapella");
      }
    })();
  };

  const removeMainTrack = (id: string) => {
    setMainTracks((prev) => prev.filter(t => t.id !== id));
  };

  const clearBgTrack = () => {
    setBgTrack(null);
  };

  const handleGenerate = async () => {
    if (!bgTrack || mainTracks.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    setMixUrl(null);

    const formData = new FormData();
    
    formData.append("bgFile", bgTrack.file);
    formData.append("bgAnalysis", JSON.stringify({
      bpm: bgTrack.bpm,
      key: bgTrack.key,
      duration: bgTrack.duration,
      beats: bgTrack.beats,
      downbeats: bgTrack.downbeats,
      sections: bgTrack.sections,
      bestEntryPoint: bgTrack.bestEntryPoint,
      bestExitPoint: bgTrack.bestExitPoint,
      avgEnergy: bgTrack.avgEnergy
    }));
    
    const mainAnalysisData = mainTracks.map(t => ({
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
    formData.append("mainAnalysis", JSON.stringify(mainAnalysisData));
    
    formData.append("bgVolume", bgVolume.toString());
    formData.append("mainVolume", mainVolume.toString());
    formData.append("playLastTrack", playLastTrackToEnd.toString());

    mainTracks.forEach((track) => {
        formData.append("mainFiles", track.file);
    });

    try {
      const response = await fetch("/api/mix-mashup", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMixUrl(data.mixUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full grid md:grid-cols-3 gap-8">
        
        <div className="md:col-span-2 space-y-8">
          
          <div className="space-y-4">
              <h3 className="text-xl font-bold text-zinc-100 flex items-center">
                  <Layers className="w-5 h-5 mr-3 text-emerald-400" />
                  Background Instrumental
              </h3>
              
              {!bgTrack ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleBgDrop}
                    className="border-2 border-dashed border-emerald-500/50 hover:border-emerald-400 bg-emerald-900/10 hover:bg-emerald-900/20 cursor-pointer rounded-xl p-8 text-center transition-all"
                  >
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      id="bg-audio-upload"
                      onChange={(e) => e.target.files && handleBgSelect(e.target.files[0])}
                    />
                    <label htmlFor="bg-audio-upload" className="cursor-pointer flex flex-col items-center">
                      <UploadCloud className="w-10 h-10 text-emerald-400 mb-3" />
                      <h4 className="text-lg font-semibold text-zinc-100">Drop Instrumental Track</h4>
                      <p className="text-zinc-400 text-xs mt-1">This will be the foundation loop/bed for your mix.</p>
                    </label>
                  </div>
              ) : (
                  <div className="flex items-center justify-between bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30 shadow-lg relative transition-all">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-xl border border-emerald-500/50 bg-emerald-500/10 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="max-w-[200px] md:max-w-xs">
                          <p className="text-sm font-semibold text-emerald-100 truncate">{bgTrack.file.name}</p>
                          <p className="text-xs text-emerald-400/70">{(bgTrack.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        {bgTrack.isAnalyzing ? (
                             <div className="flex items-center space-x-2 text-emerald-400 text-sm">
                               <Loader2 className="w-4 h-4 animate-spin" />
                             </div>
                        ) : bgTrack.error ? (
                            <span className="text-xs text-red-500">Failed</span>
                        ) : (
                            <div className="flex items-center space-x-3 text-sm">
                                <div className="flex flex-col items-end">
                                    <span className="text-zinc-400 text-xs">BPM</span>
                                    <span className="font-mono font-bold text-emerald-300">{bgTrack.bpm}</span>
                                </div>
                                <div className="h-6 w-px bg-zinc-700"></div>
                                <div className="flex flex-col items-start">
                                    <span className="text-zinc-400 text-xs">KEY</span>
                                    <span className="font-mono font-bold text-emerald-300">{bgTrack.key}</span>
                                </div>
                            </div>
                        )}
                        <button onClick={clearBgTrack} className="text-zinc-500 hover:text-red-500 p-1">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                  </div>
              )}
          </div>

          <div className="h-px w-full bg-zinc-800/80"></div>

          <div className="space-y-4">
              <h3 className="text-xl font-bold text-zinc-100 flex items-center">
                  <Music className="w-5 h-5 mr-3 text-amber-500" />
                  Acapellas / Main Tracks
              </h3>
              
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleMainDrop}
                className="border-2 border-dashed border-amber-500/50 hover:border-amber-400 bg-zinc-800/50 hover:bg-zinc-800/80 cursor-pointer rounded-xl p-8 text-center transition-all"
              >
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  id="main-audio-upload"
                  onChange={(e) => e.target.files && handleMainSelect(Array.from(e.target.files))}
                />
                <label htmlFor="main-audio-upload" className="cursor-pointer flex flex-col items-center">
                  <UploadCloud className="w-10 h-10 text-amber-400 mb-3" />
                  <h4 className="text-lg font-semibold text-zinc-100">Drop Acapellas or Tracks</h4>
                  <p className="text-zinc-400 text-xs mt-1">We will match their tempo and lay them over the instrumental.</p>
                </label>
              </div>

              {mainTracks.length > 0 && (
                <div className="space-y-3 mt-4">
                  {mainTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between bg-zinc-800 p-4 rounded-xl border border-zinc-700/50 shadow-lg relative group transition-all"
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
                             <div className="flex items-center space-x-2 text-fuchsia-400 text-sm">
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
                                        <span className="font-mono font-bold text-zinc-200">{track.bpm}</span>
                                    </div>
                                    <div className="flex flex-col items-start bg-amber-500/10 px-2 py-0.5 rounded text-xs">
                                        <span className="font-mono font-bold text-amber-400">{track.key}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <button onClick={() => removeMainTrack(track.id)} className="text-zinc-500 hover:text-red-500 p-1">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Right Side: Process Controls */}
        <div className="space-y-6">
          <div className="bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <Zap className="w-5 h-5 mr-3 text-amber-500" />
              Mashup Generator
            </h3>
            <p className="text-sm text-zinc-400 border-b border-zinc-700/50 pb-6 mb-6">
              AI maps main tracks to the instrumental&apos;s downbeats.
            </p>

            <div className="mb-6 space-y-6">
                <div>
                  <label className="flex justify-between text-sm font-medium text-emerald-300 mb-2">
                    <span>Instrumental Volume</span>
                    <span className="font-bold">{Math.round(bgVolume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={bgVolume}
                    onChange={(e) => setBgVolume(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="flex justify-between text-sm font-medium text-amber-300 mb-2">
                    <span>Main Tracks Volume</span>
                    <span className="font-bold">{Math.round(mainVolume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0" max="1.5" step="0.05"
                    value={mainVolume}
                    onChange={(e) => setMainVolume(Number(e.target.value))}
                    className="w-full accent-amber-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-zinc-700/50">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={playLastTrackToEnd}
                      onChange={(e) => setPlayLastTrackToEnd(e.target.checked)}
                      className="form-checkbox h-5 w-5 text-amber-500 bg-zinc-800 border-zinc-600 rounded focus:ring-amber-500 focus:ring-2"
                    />
                    <span className="text-sm font-medium text-zinc-300">Play background to end</span>
                  </label>
                </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!bgTrack || mainTracks.length === 0 || bgTrack.isAnalyzing || mainTracks.some(t => t.isAnalyzing) || isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center transition-all ${
                !bgTrack || mainTracks.length === 0 || bgTrack.isAnalyzing || mainTracks.some(t => t.isAnalyzing)
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : isProcessing
                  ? "bg-amber-600/50 text-white cursor-wait"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25 hover:-translate-y-1"
              }`}
            >
              {isProcessing ? (
                <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Blending...</>
              ) : bgTrack?.isAnalyzing || mainTracks.some(t => t.isAnalyzing) ? (
                "Waiting for Analysis..."
              ) : (
                "Export Mashup Mix"
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
