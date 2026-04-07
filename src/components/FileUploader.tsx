"use client";

import React, { useCallback } from "react";
import { UploadCloud, X, Music } from "lucide-react";

interface FileUploaderProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  maxFiles?: number;
}

export default function FileUploader({ files, setFiles, maxFiles = 5 }: FileUploaderProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("audio/")
      );

      if (droppedFiles.length > 0) {
        setFiles((prev) => {
          const newFiles = [...prev, ...droppedFiles];
          return newFiles.slice(0, maxFiles);
        });
      }
    },
    [maxFiles, setFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) =>
        file.type.startsWith("audio/")
      );
      setFiles((prev) => {
        const newFiles = [...prev, ...selectedFiles];
        return newFiles.slice(0, maxFiles);
      });
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          files.length >= maxFiles
            ? "border-zinc-700 bg-zinc-800/50 opacity-50 cursor-not-allowed"
            : "border-amber-500/50 hover:border-amber-400 bg-zinc-800/50 hover:bg-zinc-800/80 cursor-pointer"
        }`}
      >
        <input
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          id="audio-upload"
          onChange={handleFileInput}
          disabled={files.length >= maxFiles}
        />
        <label
          htmlFor="audio-upload"
          className={files.length >= maxFiles ? "cursor-not-allowed" : "cursor-pointer"}
        >
          <UploadCloud className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Drag & Drop Audio Files</h3>
          <p className="text-zinc-400 text-sm">
            Upload up to {maxFiles} tracks (MP3, WAV, M4A)
          </p>
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-zinc-300 mb-3">
            Selected Tracks ({files.length}/{maxFiles})
          </h4>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between bg-zinc-800/80 p-4 rounded-lg border border-zinc-700/50 backdrop-blur-sm"
            >
              <div className="flex items-center space-x-4 overflow-hidden">
                <div className="bg-amber-500/20 p-2 rounded-full">
                  <Music className="w-5 h-5 text-amber-400" />
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="text-zinc-400 hover:text-red-400 transition-colors p-2"
                aria-label="Remove track"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
