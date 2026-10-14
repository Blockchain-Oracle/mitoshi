"""Generate original, project-local ElevenLabs audio. Requires ELEVENLABS_API_KEY.

The voice uses eleven_v4. Music and sound effects use their own current models.
This script intentionally never prints the API key.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
import json
import os
import subprocess


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "audio"
OUT.mkdir(parents=True, exist_ok=True)


def voice(name: str, voice_id: str, text: str) -> str:
    path = OUT / name
    body = {"inputs": [{"text": text, "voice_id": voice_id}], "model_id": "eleven_v4"}
    run = subprocess.run(
        ["elevenlabs", "text-to-dialogue", "convert", "--json", json.dumps(body), "--output", str(path)],
        check=True, capture_output=True, text=True,
    )
    return f"{path.name}: {path.stat().st_size} bytes {run.stdout.strip()}"


def music() -> str:
    path = OUT / "score-original.mp3"
    body = {
        "prompt": "Instrumental 30 second sound design score for a premium Japanese-inspired finance motion graphic. 112 BPM. Sparse wooden clock ticks and muted taiko-like rim taps, warm analog sub pulse, brushed glass harmonics and restrained marimba accents. Precision and curiosity, never epic or generic tech. 0-4 seconds almost silent questioning pulse; 4-14 seconds build a crisp irregular groove; 14-19 seconds dramatic sudden hush for a closing price; 19-24 seconds a small affirmative tonal answer; 24-30 seconds resolve with a warm understated three-note identity. Contemporary editorial, tactile, detailed transient design, clean mix, no vocals, no lyrics, no trap hats, no EDM drop, no cinematic braam.",
        "music_length_ms": 30000,
        "model_id": "music_v2_5",
    }
    run = subprocess.run(
        ["elevenlabs", "music", "compose", "--json", json.dumps(body), "--output", str(path)],
        check=True, capture_output=True, text=True,
    )
    return f"{path.name}: {path.stat().st_size} bytes {run.stdout.strip()}"


def sfx(name: str, text: str, duration: float) -> str:
    path = OUT / name
    request = Request(
        "https://api.elevenlabs.io/v1/sound-generation",
        data=json.dumps({
            "text": text,
            "model_id": "eleven_text_to_sound_v2",
            "duration_seconds": duration,
            "prompt_influence": 0.75,
        }).encode(),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=180) as response:
        path.write_bytes(response.read())
    return f"{path.name}: {path.stat().st_size} bytes"


if __name__ == "__main__":
    tasks = [
        (voice, ("voice-sarah-v4.mp3", "EXAVITQu4vr4xnSDxMaL", "[curious, close] Where will it close? [measured pause] [quiet confidence] Mitoshi. See where it's going.")),
        (voice, ("voice-daniel-v4.mp3", "onwK4e9ZLuTAKqWW03F9", "[curious, restrained] Where will it close? [measured pause] [quiet confidence] Mitoshi. See where it's going.")),
        (music, ()),
        (sfx, ("window-lock.mp3", "One short crisp premium mechanical tick followed by a soft tactile button click, close and dry, no reverb, no voice, no music", 1.5)),
        (sfx, ("signed-print.mp3", "One dry, satisfying paper-and-metal certification stamp impact with a very short warm low resonance; precise, premium, close microphone, no voice, no music", 2.0)),
    ]
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(fn, *args) for fn, args in tasks]
        for future in as_completed(futures):
            try:
                print(future.result(), flush=True)
            except Exception as exc:
                print(f"AUDIO ERROR: {type(exc).__name__}: {exc}", flush=True)
