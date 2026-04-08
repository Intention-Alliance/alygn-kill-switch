#!/usr/bin/env python3
"""
Piper TTS OpenAI-Compatible HTTP Server
Converts Piper TTS to OpenAI API format for OpenClaw integration
"""

import json
import subprocess
import tempfile
import os
import sys
import socket
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Piper config
PIPER_BIN = os.path.expanduser("~/.local/share/piper-tts-env/bin/piper")
VOICE_MODELS = {
    "wobblus-en": os.path.expanduser("~/piper/voices-male/en_US-ryan-medium.onnx"),
    "wobblus-es": os.path.expanduser("~/piper/voices-es/es_ES-davefx-medium.onnx"),
    "alloy": os.path.expanduser("~/piper/voices-male/en_US-ryan-medium.onnx"),  # OpenAI compatible
}

def generate_speech(text, voice="wobblus-en", pitch_shift=1.20):
    """Generate speech using Piper with pitch shift for gnome voice"""
    
    model_path = VOICE_MODELS.get(voice, VOICE_MODELS["wobblus-en"])
    
    if not os.path.exists(model_path):
        return None, f"Voice model not found: {model_path}"
    
    # Create temp files
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_wav:
        tmp_wav_path = tmp_wav.name
    
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name
    
    try:
        # Generate WAV with Piper
        result = subprocess.run(
            [PIPER_BIN, "-m", model_path, "--output_file", tmp_wav_path],
            input=text.encode(),
            capture_output=True
        )
        
        if result.returncode != 0:
            return None, f"Piper error: {result.stderr.decode()}"
        
        # Get sample rate
        probe_result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
             '-show_entries', 'stream=sample_rate', '-of', 'default=noprint_wrappers=1:nokey=1', tmp_wav_path],
            capture_output=True, text=True
        )
        sample_rate = probe_result.stdout.strip() or "22050"
        
        # Apply pitch shift (gnome effect) and convert to MP3
        eq_2500 = "2"
        eq_4000 = "1"
        subprocess.run([
            'ffmpeg', '-i', tmp_wav_path, '-y',
            '-af', f"asetrate={sample_rate}*{pitch_shift},atempo=1/{pitch_shift},aresample=24000,highpass=f=80,equalizer=f=2500:t=h:w=1000:g={eq_2500},equalizer=f=4000:t=h:w=1500:g={eq_4000},volume=2dB",
            '-c:a', 'libmp3lame', '-b:a', '48k', '-ar', '24000', '-ac', '1',
            tmp_mp3_path
        ], capture_output=True)
        
        # Read MP3 data
        with open(tmp_mp3_path, 'rb') as f:
            audio_data = f.read()
        
        return audio_data, None
        
    finally:
        # Cleanup temp files
        if os.path.exists(tmp_wav_path):
            os.unlink(tmp_wav_path)
        if os.path.exists(tmp_mp3_path):
            os.unlink(tmp_mp3_path)


class TTSHandler(BaseHTTPRequestHandler):
    """OpenAI-compatible TTS API handler"""
    
    def log_message(self, format, *args):
        # Suppress logs
        pass
    
    def do_GET(self):
        """Health check endpoint"""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "piper-tts-openai-compatible"}).encode())
            return
        
        self.send_response(404)
        self.end_headers()
    
    def do_POST(self):
        """Handle TTS requests"""
        if self.path != '/v1/audio/speech':
            self.send_response(404)
            self.end_headers()
            return
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body)
            text = data.get('input', '')
            voice = data.get('voice', 'wobblus-en')
            model = data.get('model', 'tts-1')
            
            # Map OpenAI voices to Wobblus voices
            voice_map = {
                'alloy': 'wobblus-en',
                'echo': 'wobblus-en',
                'fable': 'wobblus-en',
                'onyx': 'wobblus-en',
                'nova': 'wobblus-en',
                'shimmer': 'wobblus-en',
                'wobblus-en': 'wobblus-en',
                'wobblus-es': 'wobblus-es',
            }
            
            voice = voice_map.get(voice, 'wobblus-en')
            
            # Generate speech
            audio_data, error = generate_speech(text, voice)
            
            if error:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": error}).encode())
                return
            
            # Return audio
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', len(audio_data))
            self.end_headers()
            self.wfile.write(audio_data)
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


class ReusableHTTPServer(HTTPServer):
    """HTTP Server with SO_REUSEADDR option"""
    allow_reuse_address = True


def main():
    port = int(os.environ.get('PIPER_TTS_PORT', 18080))
    server = ReusableHTTPServer(('127.0.0.1', port), TTSHandler)
    
    print(f"🎙️ Piper TTS Server running at http://127.0.0.1:{port}")
    print(f"   OpenAI-compatible endpoint: POST http://127.0.0.1:{port}/v1/audio/speech")
    print(f"   Health check: GET http://127.0.0.1:{port}/health")
    print(f"   Voices: wobblus-en (gnome voice), wobblus-es (spanish)")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()
