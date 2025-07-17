from PIL import Image, ImageDraw
import os

def create_squirrel_icon(size=32):
    """Create a high-resolution squirrel icon based on the description"""
    
    # Create a new image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale factors for different sizes
    scale = size / 32.0
    
    # Colors from the description
    squirrel_brown = (139, 69, 19)  # Saddle brown
    light_brown = (205, 133, 63)    # Peru
    cream = (255, 248, 220)         # Cornsilk
    dark_brown = (101, 67, 33)      # Dark brown
    acorn_brown = (160, 82, 45)     # Saddle brown for acorn
    
    # Calculate scaled dimensions
    def scale_dim(dim):
        return int(dim * scale)
    
    # Draw the squirrel body (oval shape)
    body_width = scale_dim(20)
    body_height = scale_dim(16)
    body_x = scale_dim(6)
    body_y = scale_dim(8)
    
    # Draw body
    draw.ellipse([body_x, body_y, body_x + body_width, body_y + body_height], 
                 fill=squirrel_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw belly (lighter area)
    belly_width = scale_dim(12)
    belly_height = scale_dim(8)
    belly_x = body_x + scale_dim(4)
    belly_y = body_y + scale_dim(4)
    draw.ellipse([belly_x, belly_y, belly_x + belly_width, belly_y + belly_height], 
                 fill=cream, outline=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw head
    head_size = scale_dim(12)
    head_x = body_x + scale_dim(8)
    head_y = body_y - scale_dim(2)
    draw.ellipse([head_x, head_y, head_x + head_size, head_y + head_size], 
                 fill=squirrel_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw ears
    ear_size = scale_dim(4)
    left_ear_x = head_x + scale_dim(1)
    left_ear_y = head_y - scale_dim(2)
    right_ear_x = head_x + scale_dim(7)
    right_ear_y = head_y - scale_dim(2)
    
    # Left ear
    draw.ellipse([left_ear_x, left_ear_y, left_ear_x + ear_size, left_ear_y + ear_size], 
                 fill=squirrel_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    draw.ellipse([left_ear_x + scale_dim(1), left_ear_y + scale_dim(1), 
                  left_ear_x + ear_size - scale_dim(1), left_ear_y + ear_size - scale_dim(1)], 
                 fill=cream)
    
    # Right ear
    draw.ellipse([right_ear_x, right_ear_y, right_ear_x + ear_size, right_ear_y + ear_size], 
                 fill=squirrel_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    draw.ellipse([right_ear_x + scale_dim(1), right_ear_y + scale_dim(1), 
                  right_ear_x + ear_size - scale_dim(1), right_ear_y + ear_size - scale_dim(1)], 
                 fill=cream)
    
    # Draw eyes (closed, smiling)
    eye_size = scale_dim(2)
    left_eye_x = head_x + scale_dim(3)
    left_eye_y = head_y + scale_dim(4)
    right_eye_x = head_x + scale_dim(7)
    right_eye_y = head_y + scale_dim(4)
    
    # Closed eyes (curved lines)
    draw.arc([left_eye_x, left_eye_y, left_eye_x + eye_size, left_eye_y + eye_size], 
             0, 180, fill=dark_brown, width=max(1, scale_dim(1)))
    draw.arc([right_eye_x, right_eye_y, right_eye_x + eye_size, right_eye_y + eye_size], 
             0, 180, fill=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw mouth (small smile)
    mouth_x = head_x + scale_dim(5)
    mouth_y = head_y + scale_dim(8)
    draw.arc([mouth_x, mouth_y, mouth_x + scale_dim(2), mouth_y + scale_dim(2)], 
             0, 180, fill=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw tail (curved, fluffy)
    tail_points = [
        (body_x + scale_dim(2), body_y + scale_dim(4)),
        (body_x - scale_dim(4), body_y - scale_dim(2)),
        (body_x - scale_dim(6), body_y - scale_dim(6)),
        (body_x - scale_dim(4), body_y - scale_dim(8)),
        (body_x, body_y - scale_dim(6)),
        (body_x + scale_dim(2), body_y - scale_dim(4))
    ]
    draw.polygon(tail_points, fill=squirrel_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    
    # Draw acorn
    acorn_x = body_x + scale_dim(12)
    acorn_y = body_y + scale_dim(6)
    acorn_width = scale_dim(6)
    acorn_height = scale_dim(8)
    
    # Acorn body
    draw.ellipse([acorn_x, acorn_y, acorn_x + acorn_width, acorn_y + acorn_height], 
                 fill=acorn_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    
    # Acorn cap
    cap_x = acorn_x + scale_dim(1)
    cap_y = acorn_y - scale_dim(2)
    cap_width = scale_dim(4)
    cap_height = scale_dim(3)
    draw.ellipse([cap_x, cap_y, cap_x + cap_width, cap_y + cap_height], 
                 fill=dark_brown, outline=dark_brown, width=max(1, scale_dim(1)))
    
    return img

def main():
    """Generate squirrel icons in various sizes"""
    icons_dir = "src-tauri/icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    # Generate icons for different sizes
    sizes = [16, 32, 44, 71, 89, 107, 128, 142, 150, 256, 284, 310, 512]
    
    for size in sizes:
        icon = create_squirrel_icon(size)
        output_path = os.path.join(icons_dir, f"{size}x{size}.png")
        icon.save(output_path, 'PNG', optimize=True)
        print(f"Created {output_path} ({size}x{size})")
    
    # Create main icon files
    main_icon = create_squirrel_icon(512)
    main_icon_path = os.path.join(icons_dir, "icon.png")
    main_icon.save(main_icon_path, 'PNG', optimize=True)
    print(f"Created {main_icon_path} (512x512)")
    
    store_logo = create_squirrel_icon(512)
    store_logo_path = os.path.join(icons_dir, "StoreLogo.png")
    store_logo.save(store_logo_path, 'PNG', optimize=True)
    print(f"Created {store_logo_path} (512x512)")
    
    print("\nAll squirrel icons created successfully!")

if __name__ == "__main__":
    main() 