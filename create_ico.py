#!/usr/bin/env python3
import os
from PIL import Image
import subprocess

def create_iconset_from_existing():
    """기존 아이콘을 사용해서 iconset 생성"""
    source_icon = "src-tauri/icons/icon_512x512@2x.png"
    iconset_dir = "src-tauri/icons/icon.iconset"
    
    # iconset 디렉토리 생성
    os.makedirs(iconset_dir, exist_ok=True)
    
    # 원본 이미지 로드
    original_img = Image.open(source_icon)
    
    # macOS에서 필요한 아이콘 크기들
    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png")
    ]
    
    for size, filename in sizes:
        output_path = os.path.join(iconset_dir, filename)
        # 원본 이미지를 원하는 크기로 리사이즈
        resized_img = original_img.resize((size, size), Image.Resampling.LANCZOS)
        resized_img.save(output_path, 'PNG')
        print(f"Created {output_path} ({size}x{size})")
    
    print("All icons created in iconset directory")

def create_icns():
    """macOS .icns 파일 생성"""
    iconset_dir = "src-tauri/icons/icon.iconset"
    icns_path = "src-tauri/icons/icon.icns"
    
    # iconutil 명령어로 .icns 파일 생성
    cmd = ["iconutil", "-c", "icns", iconset_dir, "-o", icns_path]
    try:
        subprocess.run(cmd, check=True)
        print(f"Created {icns_path}")
    except subprocess.CalledProcessError as e:
        print(f"Error creating .icns file: {e}")
    except FileNotFoundError:
        print("iconutil not found. Make sure you're on macOS.")

if __name__ == "__main__":
    print("Creating .icns file from existing icon...")
    create_iconset_from_existing()
    create_icns()
    print("Icon creation complete!") 