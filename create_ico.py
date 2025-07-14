#!/usr/bin/env python3
"""
Create ICO file for Windows builds
"""

from PIL import Image
import os
import traceback

def create_ico_file():
    """Create an ICO file from existing PNG icons"""
    
    # Check if we have the main icon
    icon_path = "src-tauri/icons/icon.png"
    if not os.path.exists(icon_path):
        print(f"❌ Main icon not found at {icon_path}")
        print("Please run create_icons_simple.py first")
        return False
    
    try:
        # Open the main icon
        img = Image.open(icon_path)
        
        # Create ICO file with multiple sizes
        # ICO files typically contain 16x16, 32x32, 48x48, and 256x256
        sizes = [16, 32, 48, 256]
        icons = []
        
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            icons.append(resized)
        
        # Save as ICO
        ico_path = "src-tauri/icons/icon.ico"
        icons[0].save(ico_path, format='ICO', sizes=[(size, size) for size in sizes])
        
        print(f"✅ Created {ico_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error creating ICO file: {e}")
        traceback.print_exc()
        return False

def main():
    print("🪟 Creating ICO file for Windows builds...")
    
    if create_ico_file():
        print("✅ ICO file created successfully!")
        print("You can now run the Tauri build command")
    else:
        print("❌ Failed to create ICO file")

if __name__ == "__main__":
    main() 