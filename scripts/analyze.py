import sys
import json
import librosa
import warnings

# Suppress warnings that librosa sometimes outputs for MP3 processing
warnings.filterwarnings("ignore")

def analyze_audio(file_path):
    try:
        # Load the audio (loads a short segment to save time)
        # We only really need the first 30 seconds to get a good BPM/Key estimate
        # But for full accuracy on an entire track, we load the whole track
        # Since it's an MVP, let's limit duration to speed it up significantly
        y, sr = librosa.load(file_path, duration=60)
        
        # 1. Detect Tempo (BPM)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        
        # tempo is occasionally returned as a float or an array depending on librosa version
        if hasattr(tempo, "item"):
            tempo_val = float(tempo.item())
        else:
            tempo_val = float(tempo)
        
        # 2. Detect Key
        # Extract chromagram
        chromagram = librosa.feature.chroma_stft(y=y, sr=sr)
        
        # Calculate the mean of each chroma pitch class
        mean_chroma = chromagram.mean(axis=1)
        
        # Very rudimentary Key detection just looking at the dominant pitch class
        # (A fully robust system uses Krumhansl-Schmuckler, but this is a simple baseline)
        chroma_to_key = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        estimated_key_index = mean_chroma.argmax()
        estimated_key = chroma_to_key[estimated_key_index]

        # In a more advanced MVP we'd distinguish Minor vs Major using templates,
        # but returning just the dominant pitch class is enough for a "smart" feel in phase 2.
        
        result = {
            "bpm": round(tempo_val, 1),
            "key": estimated_key,
            "success": True
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
        
    file_path = sys.argv[1]
    analyze_audio(file_path)
