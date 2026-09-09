"use client";

import { useState } from "react";
import FileUploader from "@/components/FileUploader";
import AudioPlayer from "@/components/AudioPlayer";
import { Loader2, Sparkles } from "lucide-react";
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

export default function BasicMixer() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [crossfade, setCrossfade] = useState<number>(6);
  const [duration, setDuration] = useState<number>(60);
  const [playLastTrackToEnd, setPlayLastTrackToEnd] = useState<boolean>(true);
  const [isSmartMix, setIsSmartMix] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
               setAnalyzedFiles(prev => {
                 return prev.map(t => 
                   t.id === fileId ? { ...t, isAnalyzing: false, ...pollData.data } : t
                 );
               });
               break;
          } else if (pollData.status === "error") {
               throw new Error(pollData.error || "Analysis failed internally");
          } else if (pollData.status === "not_found") {
               throw new Error("Analysis job lost or expired");
          }
      }
    } catch (e) {
      setAnalyzedFiles(prev => prev.map(t => 
        t.id === fileId ? { ...t, isAnalyzing: false, error: getErrorMessage(e) } : t
      ));
    }
  };

  const handleSetFiles: React.Dispatch<React.SetStateAction<File[]>> = (newFilesState) => {
      setFiles((prevFiles) => {
        // Resolve new files if functional update
        const updatedFiles = typeof newFilesState === 'function' ? newFilesState(prevFiles) : newFilesState;
        
        // Find newly added files
        const addedFiles = updatedFiles.filter(uf => !prevFiles.some(pf => pf.name === uf.name && pf.size === uf.size));
        
        // Find deleted files
        const retainedAnalyzed = analyzedFiles.filter(af => updatedFiles.some(uf => uf.name === af.file.name && uf.size === af.file.size));
        
        const newAnalyzed: AnalyzedFile[] = addedFiles.map(file => ({
            file,
            id: Math.random().toString(36).substring(7),
            isAnalyzing: false
        }));

        setAnalyzedFiles([...retainedAnalyzed, ...newAnalyzed]);
        
        (async () => {
          for (const t of newAnalyzed) {
            setAnalyzedFiles(prev => prev.map(tr => tr.id === t.id ? { ...tr, isAnalyzing: true } : tr));
            await analyzeTrack(t.id, t.file);
          }
        })();

        return updatedFiles;
      });
  };

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
    } catch (err) {
      setError(getErrorMessage(err));
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
          Upload your tracks. We&apos;ll automatically trim and crossfade them into a seamless, continuous mix.
        </p>
      </div>

      <div className="w-full grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <FileUploader files={files} setFiles={handleSetFiles} />
          
          {isSmartMix && analyzedFiles.some(t => t.isAnalyzing) && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center space-x-3">
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                  <p className="text-sm text-zinc-300">Analyzing track structure for AI Mix...</p>
              </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-800/80 p-6 rounded-xl border border-zinc-700/50 backdrop-blur-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-6 flex items-center">
              <span className="bg-zinc-700 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3 text-zinc-300">⚙️</span>
              Mix Settings
            </h3>

            <div className="mb-6 pb-6 border-b border-zinc-700/50">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSmartMix}
                    onChange={(e) => setIsSmartMix(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-amber-500 bg-zinc-800 border-zinc-600 rounded focus:ring-amber-500 focus:ring-2"
                  />
                  <div className="flex items-center text-zinc-100 font-bold">
                      <Sparkles className="w-4 h-4 text-amber-400 mr-2" />
                      Enable AI Smart Mix
                  </div>
                </label>
                <p className="text-xs text-zinc-400 mt-2 pl-8 tracking-wide">
                  Overrides manual settings. AI analyzes track energy and sections to create optimal, beat-matched transitions.
                </p>
            </div>
            
            <div className={`space-y-6 ${isSmartMix ? 'opacity-50 pointer-events-none' : ''}`}>
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
                  If disabled, the last track will fade out early.
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
