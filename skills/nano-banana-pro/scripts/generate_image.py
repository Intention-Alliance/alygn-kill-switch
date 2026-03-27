#!/usr/bin/env python3
"""
Nano Banana Pro - Gemini Image Generator
Generate or edit images using Google's Gemini models.

Model Priority:
1. gemini-3-pro-image-preview (detailed, high-quality)
2. google-2.5-flash-image (fast generation, fallback)
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

try:
    from google import genai
    from google.genai.types import Part
except ImportError:
    print("Error: google.genai not installed", file=sys.stderr)
    sys.exit(1)


def get_api_key():
    """Get Gemini API key from environment or config."""
    api_key = os.environ.get('GEMINI_API_KEY')
    if api_key:
        return api_key
    
    config_paths = [
        Path.home() / '.openclaw' / 'openclaw.json',
        Path.cwd() / 'openclaw.json',
    ]
    
    for config_path in config_paths:
        if config_path.exists():
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    skills = config.get('skills', {})
                    nano_banana = skills.get('nano-banana-pro', {})
                    api_key = nano_banana.get('apiKey') or nano_banana.get('env', {}).get('GEMINI_API_KEY')
                    if api_key:
                        return api_key
            except (json.JSONDecodeError, KeyError):
                continue
    
    return None


def compute_hash(filepath):
    """Compute SHA256 hash of file."""
    if not os.path.exists(filepath):
        return None
    with open(filepath, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def generate_image(prompt, output_path, input_images=None, resolution='1K'):
    """Generate or edit image using Gemini models."""
    
    api_key = get_api_key()
    if not api_key:
        print("Error: GEMINI_API_KEY not found", file=sys.stderr)
        sys.exit(1)
    
    client = genai.Client(api_key=api_key)
    
    # Image generation models only
    primary_model = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image-preview')
    fallback_model = os.environ.get('GEMINI_FALLBACK_MODEL', 'google-2.5-flash-image')
    
    print(f"\n🍌 IMAGE GENERATION/EDITING", file=sys.stderr)
    print(f"   Primary model: {primary_model}", file=sys.stderr)
    print(f"   Fallback model: {fallback_model}", file=sys.stderr)
    print(f"   Prompt: {prompt[:100]}...", file=sys.stderr)
    print(f"   Output: {output_path}", file=sys.stderr)
    
    # Compute input image hash for comparison
    input_hash = None
    if input_images and os.path.exists(input_images[0]):
        input_hash = compute_hash(input_images[0])
        input_size = os.path.getsize(input_images[0])
        print(f"   Input image: {input_images[0]} ({input_size} bytes, hash: {input_hash[:16]}...)", file=sys.stderr)
    
    # Prepare content for image editing
    # Structure: [prompt text, input image as Part object]
    contents = []
    
    # Add the edit instruction prompt FIRST
    contents.append(prompt)
    
    # Add input image(s) for editing using Part.from_bytes()
    if input_images:
        for img_path in input_images:
            if os.path.exists(img_path):
                with open(img_path, 'rb') as f:
                    image_bytes = f.read()
                # Use Part.from_bytes() with proper MIME type
                image_part = Part.from_bytes(data=image_bytes, mime_type='image/png')
                contents.append(image_part)
                print(f"   📷 Loaded image as Part: {len(image_bytes)} bytes", file=sys.stderr)
            else:
                print(f"   ❌ Input NOT FOUND: {img_path}", file=sys.stderr)
    
    # Try models in priority order
    for model_name in [primary_model, fallback_model]:
        try:
            print(f"\n🍌 Trying model: {model_name}", file=sys.stderr)
            
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
            )
            
            print(f"   Response type: {type(response)}", file=sys.stderr)
            
            # Extract GENERATED image from response
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'content') and candidate.content:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            generated_data = part.inline_data.data
                            print(f"   ✅ Generated image data: {len(generated_data)} bytes", file=sys.stderr)
                            
                            # Write GENERATED data to output
                            with open(output_path, 'wb') as f:
                                f.write(generated_data)
                            
                            # CRITICAL: Verify output is DIFFERENT from input
                            output_hash = compute_hash(output_path)
                            output_size = os.path.getsize(output_path)
                            
                            print(f"   Output: {output_path} ({output_size} bytes, hash: {output_hash[:16]}...)", file=sys.stderr)
                            
                            if input_hash and output_hash:
                                if input_hash == output_hash:
                                    print(f"   ❌ ERROR: Output is IDENTICAL to input! Generation failed.", file=sys.stderr)
                                    print(f"   The model returned the input unchanged.", file=sys.stderr)
                                    # Continue to try fallback model
                                    continue
                                else:
                                    print(f"   ✅ SUCCESS: Output is DIFFERENT from input (generation worked!)", file=sys.stderr)
                            
                            print(f"\nMEDIA:{output_path}")
                            return True
                            
            # Check for text response
            if hasattr(response, 'text'):
                print(f"   ⚠️ Got text response instead of image", file=sys.stderr)
                print(f"   Text: {response.text[:300]}", file=sys.stderr)
                
        except Exception as e:
            print(f"   ❌ Model {model_name} failed: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            continue
    
    print("\n❌ ERROR: All models failed to generate DIFFERENT image", file=sys.stderr)
    if input_hash:
        print(f"   Input hash: {input_hash}", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Generate images with Gemini')
    parser.add_argument('--prompt', '-p', required=True, help='Generation prompt')
    parser.add_argument('--filename', '-o', required=True, help='Output filename')
    parser.add_argument('--input', '-i', action='append', dest='inputs', help='Input image(s)')
    parser.add_argument('--resolution', '-r', default='1K', choices=['1K', '2K', '4K'])
    parser.add_argument('--output-dir', '-d', default='.')
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename
    
    print(f"\n🍌 Nano Banana Pro - Image Generation", file=sys.stderr)
    print(f"   Output: {output_path.absolute()}", file=sys.stderr)
    print(f"   Input: {args.inputs}", file=sys.stderr)
    
    success = generate_image(
        prompt=args.prompt,
        output_path=str(output_path),
        input_images=args.inputs,
        resolution=args.resolution
    )
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
