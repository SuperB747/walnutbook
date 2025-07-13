#!/usr/bin/env python3
"""
WalnutBook Icon Generator
Creates PNG icons from SVG for the WalnutBook app
"""

import os
import base64
from io import BytesIO

# SVG content for the walnut icon
SVG_CONTENT = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="walnutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B4513;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#A0522D;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6B4423;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2E8B57;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#228B22;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="url(#walnutGradient)" filter="url(#shadow)"/>
  
  <!-- Walnut shell -->
  <ellipse cx="256" cy="200" rx="120" ry="80" fill="#8B4513" stroke="#654321" stroke-width="3"/>
  <ellipse cx="256" cy="200" rx="100" ry="60" fill="#A0522D"/>
  
  <!-- Walnut texture lines -->
  <path d="M 180 180 Q 200 190 220 185 Q 240 180 260 185 Q 280 190 300 185 Q 320 180 340 185" 
        stroke="#654321" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M 180 200 Q 200 210 220 205 Q 240 200 260 205 Q 280 210 300 205 Q 320 200 340 205" 
        stroke="#654321" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M 180 220 Q 200 230 220 225 Q 240 220 260 225 Q 280 230 300 225 Q 320 220 340 225" 
        stroke="#654321" stroke-width="2" fill="none" opacity="0.7"/>
  
  <!-- Book -->
  <rect x="200" y="280" width="112" height="80" rx="8" fill="url(#bookGradient)" stroke="#1B4D3E" stroke-width="2"/>
  <rect x="210" y="290" width="92" height="60" fill="#FFFFFF" opacity="0.9"/>
  
  <!-- Book pages -->
  <line x1="220" y1="300" x2="290" y2="300" stroke="#333333" stroke-width="1"/>
  <line x1="220" y1="310" x2="290" y2="310" stroke="#333333" stroke-width="1"/>
  <line x1="220" y1="320" x2="290" y2="320" stroke="#333333" stroke-width="1"/>
  <line x1="220" y1="330" x2="290" y2="330" stroke="#333333" stroke-width="1"/>
  <line x1="220" y1="340" x2="290" y2="340" stroke="#333333" stroke-width="1"/>
  
  <!-- Dollar sign on book -->
  <text x="256" y="325" font-family="Arial, sans-serif" font-size="16" font-weight="bold" 
        text-anchor="middle" fill="#2E8B57">$</text>
  
  <!-- Small walnut details -->
  <circle cx="180" cy="180" r="3" fill="#8B4513"/>
  <circle cx="332" cy="180" r="3" fill="#8B4513"/>
  <circle cx="190" cy="220" r="2" fill="#8B4513"/>
  <circle cx="322" cy="220" r="2" fill="#8B4513"/>
</svg>'''

def create_simple_icon():
    """Create a simple colored icon using basic shapes"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        
        # Create a 512x512 image with a gradient background
        img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Create gradient background (simplified)
        for y in range(512):
            # Brown gradient
            r = int(139 + (y / 512) * 20)  # 139-159
            g = int(69 + (y / 512) * 30)   # 69-99
            b = int(19 + (y / 512) * 20)   # 19-39
            draw.rectangle([0, y, 512, y+1], fill=(r, g, b, 255))
        
        # Draw walnut shell (ellipse)
        draw.ellipse([136, 120, 376, 280], fill=(139, 69, 19), outline=(101, 67, 33), width=3)
        draw.ellipse([156, 140, 356, 260], fill=(160, 82, 45))
        
        # Draw book (rectangle)
        book_color = (46, 139, 87)  # Sea green
        draw.rounded_rectangle([200, 280, 312, 360], radius=8, fill=book_color, outline=(27, 77, 62), width=2)
        
        # Draw book pages (white rectangle)
        draw.rounded_rectangle([210, 290, 302, 350], radius=4, fill=(255, 255, 255, 230))
        
        # Draw lines on book (simplified)
        for i in range(5):
            y = 300 + i * 10
            draw.line([220, y, 290, y], fill=(51, 51, 51), width=1)
        
        # Draw dollar sign
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        draw.text((256, 305), "$", fill=(46, 139, 87), font=font, anchor="mm")
        
        return img
        
    except ImportError:
        print("PIL/Pillow not available. Creating simple icon...")
        return create_fallback_icon()

def create_fallback_icon():
    """Create a very simple icon without PIL"""
    # Create a simple text-based icon
    icon_content = f"""
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <circle cx="256" cy="256" r="240" fill="#8B4513"/>
        <ellipse cx="256" cy="200" rx="120" ry="80" fill="#A0522D" stroke="#654321" stroke-width="3"/>
        <rect x="200" y="280" width="112" height="80" rx="8" fill="#2E8B57" stroke="#1B4D3E" stroke-width="2"/>
        <rect x="210" y="290" width="92" height="60" fill="#FFFFFF" opacity="0.9"/>
        <text x="256" y="325" font-family="Arial, sans-serif" font-size="20" font-weight="bold" 
              text-anchor="middle" fill="#2E8B57">$</text>
    </svg>
    """
    
    # Save SVG
    with open("walnut_icon_simple.svg", "w") as f:
        f.write(icon_content)
    
    print("Created simple SVG icon: walnut_icon_simple.svg")
    return None

def main():
    print("🌰 Creating WalnutBook icons...")
    
    # Try to create PNG icons
    img = create_simple_icon()
    
    if img:
        # Save different sizes
        sizes = [32, 128, 256, 512]
        
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            filename = f"walnut_icon_{size}x{size}.png"
            resized.save(filename, "PNG")
            print(f"✅ Created {filename}")
        
        # Save the main icon
        img.save("walnut_icon.png", "PNG")
        print("✅ Created walnut_icon.png")
        
        # Copy to Tauri icons directory
        icon_dir = "src-tauri/icons"
        if os.path.exists(icon_dir):
            import shutil
            shutil.copy("walnut_icon.png", f"{icon_dir}/icon.png")
            shutil.copy("walnut_icon_128x128.png", f"{icon_dir}/128x128.png")
            shutil.copy("walnut_icon_32x32.png", f"{icon_dir}/32x32.png")
            print("✅ Copied icons to src-tauri/icons/")
    else:
        print("⚠️  Could not create PNG icons. Please install Pillow: pip3 install Pillow")
        print("📋 Manual steps:")
        print("1. Open walnut_icon_simple.svg in a browser")
        print("2. Right-click and save as PNG")
        print("3. Resize to different sizes (32x32, 128x128, etc.)")
        print("4. Replace files in src-tauri/icons/")

if __name__ == "__main__":
    main() 