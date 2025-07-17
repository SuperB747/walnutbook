from PIL import Image
import os

def create_high_res_icons():
    """Create high-resolution icons from the 512x512.png squirrel image"""
    
    # Source image path - use the 512x512.png file
    source_path = "src-tauri/icons/512x512.png"
    
    if not os.path.exists(source_path):
        print(f"Source image not found: {source_path}")
        return
    
    # Open the source image
    source_img = Image.open(source_path)
    print(f"Source image size: {source_img.size}")
    
    # Define all required sizes
    sizes = [16, 32, 44, 71, 89, 107, 128, 142, 150, 256, 284, 310, 512]
    
    icons_dir = "src-tauri/icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    # Generate icons for each size
    for size in sizes:
        # Resize with high quality
        resized_img = source_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Save with high quality
        output_path = os.path.join(icons_dir, f"{size}x{size}.png")
        resized_img.save(output_path, 'PNG', optimize=True)
        print(f"Created {output_path} ({size}x{size})")
    
    # Create main icon files
    main_icon = source_img.resize((512, 512), Image.Resampling.LANCZOS)
    main_icon_path = os.path.join(icons_dir, "icon.png")
    main_icon.save(main_icon_path, 'PNG', optimize=True)
    print(f"Created {main_icon_path} (512x512)")
    
    store_logo = source_img.resize((512, 512), Image.Resampling.LANCZOS)
    store_logo_path = os.path.join(icons_dir, "StoreLogo.png")
    store_logo.save(store_logo_path, 'PNG', optimize=True)
    print(f"Created {store_logo_path} (512x512)")
    
    print("\nAll high-resolution squirrel icons created successfully!")

if __name__ == "__main__":
    create_high_res_icons() 