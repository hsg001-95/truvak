from PIL import Image, ImageDraw
import os

os.makedirs("extension/icons", exist_ok=True)

for size in [16, 48, 128]:
    img  = Image.new("RGBA", (size, size), (15, 23, 42, 255))
    draw = ImageDraw.Draw(img)
    margin = size // 6
    draw.ellipse(
        [margin, margin, size-margin, size-margin],
        fill=(29, 78, 216, 255)
    )
    img.save(f"extension/icons/icon{size}.png")
    print(f"Created icon{size}.png")