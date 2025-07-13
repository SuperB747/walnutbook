#!/usr/bin/env python3
"""
Simple WalnutBook Icon Generator
"""

from PIL import Image, ImageDraw, ImageFont
import os
import shutil

def create_walnut_icon():
    """Create a beautiful walnut-themed icon"""
    
    # Create a 512x512 image
    img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Create gradient background (brown tones)
    for y in range(512):
        # Brown gradient from dark to light
        r = int(139 + (y / 512) * 20)  # 139-159
        g = int(69 + (y / 512) * 30)   # 69-99
        b = int(19 + (y / 512) * 20)   # 19-39
        draw.rectangle([0, y, 512, y+1], fill=(r, g, b, 255))
    
    # Draw walnut shell (ellipse)
    draw.ellipse([136, 120, 376, 280], fill=(139, 69, 19), outline=(101, 67, 33), width=3)
    draw.ellipse([156, 140, 356, 260], fill=(160, 82, 45))
    
    # Draw book (rounded rectangle)
    book_color = (46, 139, 87)  # Sea green
    draw.rounded_rectangle([200, 280, 312, 360], radius=8, fill=book_color, outline=(27, 77, 62), width=2)
    
    # Draw book pages (white rectangle)
    draw.rounded_rectangle([210, 290, 302, 350], radius=4, fill=(255, 255, 255, 230))
    
    # Draw lines on book (simplified text lines)
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

def main():
    print("🌰 Creating WalnutBook icons...")
    
    # Create the main icon
    img = create_walnut_icon()
    
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
        shutil.copy("walnut_icon.png", f"{icon_dir}/icon.png")
        shutil.copy("walnut_icon_128x128.png", f"{icon_dir}/128x128.png")
        shutil.copy("walnut_icon_32x32.png", f"{icon_dir}/32x32.png")
        print("✅ Copied icons to src-tauri/icons/")
        
        # Also copy to other sizes
        shutil.copy("walnut_icon_128x128.png", f"{icon_dir}/128x128@2x.png")
        print("✅ Updated all icon files")
    else:
        print("❌ Icon directory not found")

if __name__ == "__main__":
    main() 