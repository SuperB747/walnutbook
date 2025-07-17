#!/usr/bin/env python3
"""
Create ICO file for Windows builds
"""

from PIL import Image
import os

def create_ico_file():
    """Convert PNG icon to ICO format with multiple sizes for best Windows compatibility"""
    
    # Source image path
    source_path = "src-tauri/icons/icon.png"
    
    if not os.path.exists(source_path):
        print(f"Source image not found: {source_path}")
        return
    
    # Open the source image
    source_img = Image.open(source_path)
    print(f"Source image size: {source_img.size}")
    
    # Create ICO with multiple sizes for best Windows compatibility
    ico_path = "src-tauri/icons/icon.ico"
    
    # Windows ICO format supports multiple sizes
    # Include common sizes: 16x16, 32x32, 48x48, 256x256
    sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]
    
    # Create a list of images for ICO
    icon_images = []
    for size in sizes:
        resized_img = source_img.resize(size, Image.Resampling.LANCZOS)
        icon_images.append(resized_img)
    
    # Save as ICO with all sizes
    icon_images[0].save(ico_path, format='ICO', sizes=sizes, append_images=icon_images[1:])
    print(f"Created {ico_path} with sizes: {sizes}")
    print(f"icon.ico file size: {os.path.getsize(ico_path)//1024} KB")
    
    # Also create icns for macOS
    icns_path = "src-tauri/icons/icon.icns"
    source_img.save(icns_path, 'PNG')
    print(f"Created {icns_path}")

if __name__ == "__main__":
    create_ico_file() 