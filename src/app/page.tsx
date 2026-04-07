"use client";

import { useState } from "react";
import BasicMixer from "@/components/BasicMixer";
import ProMixer from "@/components/ProMixer";
import { AudioLines, Sparkles } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"basic" | "pro">("basic");

  return (
    <main className="min-h-screen pt-12 pb-24 px-8 md:px-24 max-w-5xl mx-auto flex flex-col items-center">
      <div className="w-full text-center mb-10">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">
          Automated DJ Mix
        </h1>
        
        {/* Custom Tabs Navigation */}
        <div className="inline-flex mt-6 bg-zinc-800/80 p-1.5 rounded-full border border-zinc-700/50 backdrop-blur-md shadow-lg">
          <button
            onClick={() => setActiveTab("basic")}
            className={`flex items-center px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "basic"
                ? "bg-zinc-700 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            <AudioLines className="w-4 h-4 mr-2" />
            Basic
          </button>
          <button
            onClick={() => setActiveTab("pro")}
            className={`flex items-center px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "pro"
                ? "bg-amber-600 text-white shadow-sm shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Pro
          </button>
        </div>
      </div>

      {activeTab === "basic" ? <BasicMixer /> : <ProMixer />}
    </main>
  );
}
