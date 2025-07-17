#!/usr/bin/env python3
"""
Create ICO file for Windows builds
"""

from PIL import Image
import os

def create_ico_file():
    """Convert PNG icon to ICO format with multiple sizes for best Windows compatibility"""
    
    # Source image path (고해상도 파일로 변경)
    source_path = "src-tauri/icons/icon.iconset/icon_512x512@2x.png"
    
    if not os.path.exists(source_path):
        print(f"Source image not found: {source_path}")
        return
    
    # Open the source image
    source_img = Image.open(source_path)
    print(f"Source image size: {source_img.size}")
    
    # Create ICO with multiple sizes for best Windows compatibility
    ico_path = "src-tauri/icons/icon.ico"
    
    # Windows ICO format supports multiple sizes
    # Include common sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256), (512, 512)]
    
    # Create a list of images for ICO
    icon_images = [source_img.resize(size, Image.Resampling.LANCZOS) for size in sizes]
    
    # Save as ICO with all sizes (Pillow는 append_images를 지원하지 않으므로, sizes 옵션만 사용)
    icon_images[0].save(ico_path, format='ICO', sizes=sizes)
    print(f"Created {ico_path} with sizes: {sizes}")
    print(f"icon.ico file size: {os.path.getsize(ico_path)//1024} KB")
    
    # Also create icns for macOS (optional)
    icns_path = "src-tauri/icons/icon.icns"
    source_img.save(icns_path, 'PNG')
    print(f"Created {icns_path}")

if __name__ == "__main__":
    create_ico_file() 