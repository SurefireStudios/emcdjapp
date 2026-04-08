import sys
import os
import json
import subprocess
import tempfile
import ast
import os
import librosa
import numpy as np

# Fix Windows Access Violation (0xC0000005) in Sklearn/Numpy
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from scipy.ndimage import median_filter
from sklearn.cluster import AgglomerativeClustering
import warnings

warnings.filterwarnings("ignore")

# Krumhansl-Schmuckler key profiles for major/minor detection
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
CHROMA_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def detect_key(y, sr):
    """Detect musical key using Krumhansl-Schmuckler algorithm."""
    chromagram = librosa.feature.chroma_cqt(y=y, sr=sr)
    mean_chroma = chromagram.mean(axis=1)
    # Normalize
    mean_chroma = mean_chroma / (mean_chroma.sum() + 1e-6)

    best_corr = -1
    best_key = "C"

    for shift in range(12):
        # Rotate the profile to test each possible root
        major_shifted = np.roll(MAJOR_PROFILE, shift)
        minor_shifted = np.roll(MINOR_PROFILE, shift)

        corr_major = np.corrcoef(mean_chroma, major_shifted)[0, 1]
        corr_minor = np.corrcoef(mean_chroma, minor_shifted)[0, 1]

        if corr_major > best_corr:
            best_corr = corr_major
            best_key = CHROMA_NAMES[shift]
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = CHROMA_NAMES[shift] + "m"

    return best_key


def detect_sections(y, sr, duration):
    """
    Detect structural sections using self-similarity matrix
    and agglomerative clustering on MFCCs.
    Returns a list of section dicts with start, end, energy, label.
    """
    # Compute features for segmentation
    hop_length = 512
    n_fft = 2048

    # MFCC features for self-similarity
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length, n_fft=n_fft)

    # Compute self-similarity with recurrence matrix
    # Use a beat-synchronous approach for cleaner sections
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    
    if len(beat_frames) < 4:
        # Too few beats detected, return the whole track as one section
        rms_full = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        avg_energy = float(np.mean(rms_full))
        return [{
            "start": 0.0,
            "end": round(duration, 2),
            "energy": round(avg_energy, 4),
            "label": "full"
        }]

    # Beat-synchronous MFCCs
    beat_mfcc = librosa.util.sync(mfcc, beat_frames, aggregate=np.median)

    # Compute RMS energy per beat
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    beat_rms = librosa.util.sync(rms.reshape(1, -1), beat_frames, aggregate=np.mean)[0]

    # Spectral centroid per beat (brightness indicator)
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    beat_centroid = librosa.util.sync(spectral_centroid.reshape(1, -1), beat_frames, aggregate=np.mean)[0]

    # Determine number of sections: roughly 1 section per 15-30 seconds
    n_beats = beat_mfcc.shape[1]
    estimated_sections = max(3, min(12, int(duration / 20)))

    if n_beats < estimated_sections:
        estimated_sections = max(2, n_beats - 1)

    # Feature matrix for clustering (normalize each feature)
    features = beat_mfcc.T  # (n_beats, n_mfcc)
    
    # Normalize features
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features)

    # Agglomerative clustering
    clustering = AgglomerativeClustering(n_clusters=estimated_sections, linkage='ward')
    labels = clustering.fit_predict(features_scaled)

    # Smooth labels with median filter to remove tiny segments
    labels = median_filter(labels, size=3).astype(int)

    # Convert beat frame labels into time-based sections
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)

    sections = []
    current_label = labels[0]
    section_start = 0.0

    for i in range(1, len(labels)):
        if labels[i] != current_label or i == len(labels) - 1:
            # End of section
            if i == len(labels) - 1:
                section_end = round(duration, 2)
            else:
                section_end = round(float(beat_times[i]), 2)

            # Energy for this section
            section_beat_rms = beat_rms[max(0, i - (i - len([l for l in labels[:i] if l == current_label]))):i]
            if len(section_beat_rms) == 0:
                section_energy = 0.0
            else:
                section_energy = float(np.mean(section_beat_rms))

            sections.append({
                "start": round(section_start, 2),
                "end": section_end,
                "energy": round(section_energy, 4),
                "label": ""  # Will be classified next
            })

            section_start = section_end
            current_label = labels[i]

    # Merge very short sections (< 5 seconds) into neighbors
    merged = []
    for s in sections:
        if merged and (s["end"] - s["start"]) < 5.0:
            merged[-1]["end"] = s["end"]
            # Recalculate energy as weighted average
            prev_dur = merged[-1]["end"] - merged[-1]["start"]
            cur_dur = s["end"] - s["start"]
            total = prev_dur + cur_dur
            if total > 0:
                merged[-1]["energy"] = round(
                    (merged[-1]["energy"] * prev_dur + s["energy"] * cur_dur) / total, 4
                )
        else:
            merged.append(s)

    sections = merged if merged else sections

    # Classify sections by energy level
    if sections:
        energies = [s["energy"] for s in sections]
        max_energy = max(energies) if max(energies) > 0 else 1.0
        
        for s in sections:
            normalized = s["energy"] / max_energy
            s["energy"] = round(normalized, 4)
            
            if normalized >= 0.75:
                s["label"] = "high"
            elif normalized >= 0.45:
                s["label"] = "mid"
            else:
                s["label"] = "low"

    return sections


def find_transition_points(sections, beats, duration):
    """
    Find the best exit and entry points for this track.
    - Best exit: end of the LAST high-energy section (play through the best part, then hand off)
    - Best entry: start of the FIRST high or mid energy section (skip boring intros)
    """
    best_exit = duration  # Default: end of track
    best_entry = 0.0      # Default: start of track

    # Find best entry: first high or mid section (skip low-energy intros)
    for s in sections:
        if s["label"] in ("high", "mid"):
            best_entry = s["start"]
            break

    # Find best exit: end of the second high-energy section, or end of last high section
    high_sections = [s for s in sections if s["label"] == "high"]
    if len(high_sections) >= 2:
        best_exit = high_sections[1]["end"]
    elif len(high_sections) == 1:
        best_exit = high_sections[0]["end"]
    else:
        # No high sections; use end of last mid section
        mid_sections = [s for s in sections if s["label"] == "mid"]
        if mid_sections:
            best_exit = mid_sections[-1]["end"]

    # Snap to nearest beat
    beats_arr = np.array(beats)
    if len(beats_arr) > 0:
        entry_idx = np.argmin(np.abs(beats_arr - best_entry))
        best_entry = float(beats_arr[entry_idx])
        
        exit_idx = np.argmin(np.abs(beats_arr - best_exit))
        best_exit = float(beats_arr[exit_idx])

    # Ensure minimum duration of 30 seconds
    if best_exit - best_entry < 30.0:
        best_entry = 0.0
        best_exit = min(duration, 120.0)

    return round(best_entry, 3), round(best_exit, 3)


def analyze_audio(file_path):
    try:
        # Convert to WAV first to avoid audioread MP3 crashes (Illegal Audio-MPEG-Header)
        tmp_wav = tempfile.mktemp(suffix=".wav")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", file_path, "-ac", "1", "-ar", "22050", tmp_wav], 
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )
            # Load the full track for complete analysis securely from the WAV
            y, sr = librosa.load(tmp_wav, sr=22050, mono=True)
        finally:
            if os.path.exists(tmp_wav):
                os.remove(tmp_wav)
                
        duration = float(librosa.get_duration(y=y, sr=sr))

        # 1. BPM Detection
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        if hasattr(tempo, "item"):
            tempo_val = float(tempo.item())
        else:
            tempo_val = float(tempo)

        # 2. Beat timestamps
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        beats = [round(float(b), 3) for b in beat_times]

        # 3. Downbeats (every 4 beats = 1 bar)
        downbeats = [beats[i] for i in range(0, len(beats), 4)]

        # 4. Key Detection (Krumhansl-Schmuckler)
        key = detect_key(y, sr)

        # 5. Section Detection
        sections = detect_sections(y, sr, duration)

        # 6. Transition Points
        best_entry, best_exit = find_transition_points(sections, beats, duration)

        # 7. Average energy
        rms = librosa.feature.rms(y=y)[0]
        avg_energy = round(float(np.mean(rms)), 4)
        
        # Normalize to 0-1 range
        max_rms = float(np.max(rms)) if np.max(rms) > 0 else 1.0
        avg_energy_normalized = round(avg_energy / max_rms, 4)

        result = {
            "success": True,
            "bpm": round(tempo_val, 1),
            "key": key,
            "duration": round(duration, 2),
            "beats": beats,
            "downbeats": downbeats,
            "sections": sections,
            "best_entry_point": best_entry,
            "best_exit_point": best_exit,
            "avg_energy": avg_energy_normalized
        }

        print(json.dumps(result))

    except Exception as e:
        import traceback
        error_result = {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[1]
    analyze_audio(file_path)
