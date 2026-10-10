#!/usr/bin/env python3
"""Regenerate the harness's known test signals (48 kHz mono 16-bit WAV). Run from anywhere:
    python3 tools/audio-test/signals/make.py
sine440 (A4), dsharp3_plus20c (D#3 +20 cents), click120 (120 BPM), tempo100to130 (100 then 130 BPM at 15 s),
tone1k_m20 (1 kHz at -20 dBFS), bursts (2 s silence + 1 s 330 Hz tone, repeating)."""
import math, os, random, struct, wave
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))

def write(name, samples):
    w = wave.open(os.path.join(HERE, name), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples)); w.close()
    print(name, len(samples) / SR, 's')

def clicks(bpm_at, dur):
    out = [0.0] * int(SR * dur); t = 0.0
    while t < dur:
        i0 = int(t * SR)
        for k in range(int(SR * 0.02)):
            if i0 + k < len(out): out[i0 + k] = 0.8 * (random.random() * 2 - 1) * math.exp(-k / (SR * 0.004))
        t += 60.0 / bpm_at(t)
    return out

write('sine440.wav', [0.25 * math.sin(2 * math.pi * 440 * i / SR) for i in range(SR * 20)])
f = 155.5635 * 2 ** (20 / 1200)
write('dsharp3_plus20c.wav', [0.25 * math.sin(2 * math.pi * f * i / SR) for i in range(SR * 20)])
random.seed(1)
write('click120.wav', clicks(lambda t: 120, 30))
write('tempo100to130.wav', clicks(lambda t: 100 if t < 15 else 130, 30))
write('tone1k_m20.wav', [0.1 * math.sin(2 * math.pi * 1000 * i / SR) for i in range(SR * 20)])
write('bursts.wav', [(0.3 * math.sin(2 * math.pi * 330 * i / SR) if (i // SR) % 3 == 2 else 0.0) for i in range(SR * 30)])
