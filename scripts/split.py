import os
import sys
import argparse
import subprocess
import shutil

try:
    import torchaudio
    if 'soundfile' in torchaudio.utils.sox_utils.list_interfaces() or True:
        torchaudio.set_audio_backend("soundfile")
except:
    pass


def split_audio(input_file, out_dir):
    """
    Splits the audio into 2 stems (vocals / no vocals) using demucs.
    Only the provided inputs are meant to be short ~30s transition crossfade loops
    so this won't murder the CPU.
    """
    # Create absolute output directory
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"Starting demucs on: {input_file}")
    # demucs -n htdemucs --two-stems vocals <file> -o <out_dir>
    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs",
        "--two-stems", "vocals",
        input_file,
        "-o", out_dir
    ]
    
    try:
        # Run demucs subprocess
        process = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True
        )
        
        if process.returncode != 0:
            print(f"Demucs Error: {process.stderr}", file=sys.stderr)
            sys.exit(1)
            
        print("Demucs finished successfully.")
        
        # Demucs outputs to <out_dir>/htdemucs/<basename>/
        base_name = os.path.splitext(os.path.basename(input_file))[0]
        demucs_out_path = os.path.join(out_dir, "htdemucs", base_name)
        
        vocals_path = os.path.join(demucs_out_path, "vocals.wav")
        no_vocals_path = os.path.join(demucs_out_path, "no_vocals.wav")
        
        # Verify files exist
        if not os.path.exists(vocals_path) or not os.path.exists(no_vocals_path):
            print("Failed to find output files.", file=sys.stderr)
            sys.exit(1)
            
        # Move them to the root out_dir for easier retrieval
        final_vocals = os.path.join(out_dir, "split_vocals.wav")
        final_no_vocals = os.path.join(out_dir, "split_no_vocals.wav")
        
        shutil.move(vocals_path, final_vocals)
        shutil.move(no_vocals_path, final_no_vocals)
        
        # Clean up the htdemucs folder
        shutil.rmtree(os.path.join(out_dir, "htdemucs"), ignore_errors=True)
        
        # Output JSON to stdout so Node can read it
        import json
        print(json.dumps({
            "vocals": final_vocals,
            "no_vocals": final_no_vocals
        }))
        
    except Exception as e:
        print(f"Error during splitting: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split stems via Demucs")
    parser.add_argument("--input", required=True, help="Input audio file")
    parser.add_argument("--outdir", required=True, help="Output directory")
    args = parser.parse_args()
    
    split_audio(args.input, args.outdir)
