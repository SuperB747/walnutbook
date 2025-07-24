#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont
import subprocess

def create_high_res_icon(size, output_path):
    """고해상도 아이콘 생성"""
    # 새로운 이미지 생성 (RGBA 모드로 투명도 지원)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 배경 원 그리기 (walnut 브라운 색상)
    background_color = (139, 69, 19, 255)  # Saddle Brown
    draw.ellipse([size*0.1, size*0.1, size*0.9, size*0.9], fill=background_color)
    
    # 중앙에 walnut 그리기
    walnut_color = (160, 82, 45, 255)  # Saddle Brown
    draw.ellipse([size*0.3, size*0.3, size*0.7, size*0.7], fill=walnut_color)
    
    # 텍스트 추가 (크기에 따라 폰트 크기 조정)
    try:
        font_size = max(size // 8, 12)
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "W"
    text_color = (255, 255, 255, 255)
    
    # 텍스트 중앙 정렬
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill=text_color, font=font)
    
    # 파일 저장
    img.save(output_path, 'PNG')
    print(f"Created {output_path} ({size}x{size})")

def create_iconset():
    """macOS iconset 생성"""
    iconset_dir = "src-tauri/icons/icon.iconset"
    os.makedirs(iconset_dir, exist_ok=True)
    
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
        create_high_res_icon(size, output_path)
    
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

def create_ico():
    """Windows .ico 파일 생성"""
    # 256x256 크기로 .ico 파일 생성
    ico_path = "src-tauri/icons/icon.ico"
    create_high_res_icon(256, ico_path)
    print(f"Created {ico_path}")

if __name__ == "__main__":
    print("Creating high-resolution icons...")
    create_iconset()
    create_icns()
    create_ico()
    print("Icon creation complete!") 