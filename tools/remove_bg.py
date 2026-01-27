from PIL import Image
import sys

def remove_background(input_path, output_path, tolerance=30):
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        # Sample corners to find background colors
        width, height = img.size
        corners = [
            img.getpixel((0, 0)),
            img.getpixel((width - 1, 0)),
            img.getpixel((0, height - 1)),
            img.getpixel((width - 1, height - 1))
        ]

        # Assume corners are background.
        # Checkered patterns often use White and Grey.
        bg_colors = set(corners)

        # Add common checkered colors if not present (just in case)
        # Often: (255, 255, 255, 255) and (204, 204, 204, 255) or similar

        newData = []
        for item in datas:
            is_bg = False
            for bg in bg_colors:
                # Euclidean distance or simple diff
                if abs(item[0] - bg[0]) < tolerance and \
                   abs(item[1] - bg[1]) < tolerance and \
                   abs(item[2] - bg[2]) < tolerance:
                    is_bg = True
                    break

            if is_bg:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Saved to {output_path}")
        print(f"Detected background colors: {bg_colors}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python remove_bg.py input output")
    else:
        remove_background(sys.argv[1], sys.argv[2])
