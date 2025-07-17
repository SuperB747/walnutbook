from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

def create_high_res_icon(size, output_path):
    """Create a high-resolution icon with a splash-style WB logo"""
    # Transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # White circle with shadow
    logo_size = int(size * 0.75)
    logo_x = (size - logo_size) // 2
    logo_y = (size - logo_size) // 2
    shadow_offset = size // 32
    shadow_radius = size // 16

    # Draw shadow (blurred ellipse)
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse([
        logo_x + shadow_offset,
        logo_y + shadow_offset,
        logo_x + logo_size + shadow_offset,
        logo_y + logo_size + shadow_offset
    ], fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=shadow_radius))
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # Draw white circle
    draw.ellipse([
        logo_x, logo_y, logo_x + logo_size, logo_y + logo_size
    ], fill=(255, 255, 255, 255))

    # WB text in the center with gradient
    try:
        font_size = int(logo_size * 0.55)
        font = ImageFont.truetype("arialbd.ttf", font_size)
    except:
        font = ImageFont.load_default()
    text = "WB"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2

    # Create gradient for text
    gradient = Image.new('RGBA', (text_width, text_height), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(gradient)
    for y in range(text_height):
        ratio = y / text_height
        r = int(102 * (1 - ratio) + 118 * ratio)
        g = int(126 * (1 - ratio) + 75 * ratio)
        b = int(234 * (1 - ratio) + 162 * ratio)
        grad_draw.line([(0, y), (text_width, y)], fill=(r, g, b, 255))

    # Mask for text
    mask = Image.new('L', (text_width, text_height), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.text((0, 0), text, font=font, fill=255)
    img.paste(gradient, (text_x, text_y), mask)

    img.save(output_path, 'PNG')
    print(f"Created {output_path} ({size}x{size})")

def main():
    icons_dir = "src-tauri/icons"
    os.makedirs(icons_dir, exist_ok=True)
    sizes = [16, 32, 44, 71, 89, 107, 128, 142, 150, 256, 284, 310, 512]
    for size in sizes:
        output_path = os.path.join(icons_dir, f"{size}x{size}.png")
        create_high_res_icon(size, output_path)
    # Main icon
    main_icon_path = os.path.join(icons_dir, "icon.png")
    create_high_res_icon(512, main_icon_path)
    # StoreLogo
    store_logo_path = os.path.join(icons_dir, "StoreLogo.png")
    create_high_res_icon(512, store_logo_path)
    print("\nAll splash-style high-resolution icons created!")

if __name__ == "__main__":
    main() 