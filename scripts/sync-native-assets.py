
import os
import subprocess

# Paths
ROOT = "/Users/pravinrathod/Documents/Personal/AI/Coaching/New/mobile-rn"
BRANDING = os.path.join(ROOT, "assets/branding/edupro")
RES = os.path.join(ROOT, "android/app/src/main/res")

# Source files
ICON_SRC = os.path.join(BRANDING, "icon.png")
ADAPTIVE_SRC = os.path.join(BRANDING, "adaptive-icon.png")
SPLASH_SRC = os.path.join(BRANDING, "splash.png")

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0
}

def resize_and_convert(src, dest_base, size):
    # sips for PNG output
    dest = dest_base + ".png"
    
    cmd = [
        "sips",
        "-z", str(size), str(size),
        "-s", "format", "png",
        src,
        "--out", dest
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    
    # Delete webp if exists to avoid conflicts
    webp = dest_base + ".webp"
    if os.path.exists(webp):
        os.remove(webp)

def update_assets():
    for density, scale in DENSITIES.items():
        print(f"Processing {density}...")
        
        # 1. Launcher Icons (Legacy)
        legacy_size = int(48 * scale)
        for name_no_ext in ["ic_launcher", "ic_launcher_round"]:
            dest_base = os.path.join(RES, f"mipmap-{density}", name_no_ext)
            # Check if directory exists
            if os.path.isdir(os.path.dirname(dest_base)):
                resize_and_convert(ICON_SRC, dest_base, legacy_size)
        
        # 2. Adaptive Icons (Foreground)
        adaptive_size = int(108 * scale)
        dest_adaptive_base = os.path.join(RES, f"mipmap-{density}", "ic_launcher_foreground")
        if os.path.isdir(os.path.dirname(dest_adaptive_base)):
            resize_and_convert(ADAPTIVE_SRC, dest_adaptive_base, adaptive_size)
            
        # 3. Splash Screen Logo
        splash_size = int(288 * scale)
        dest_splash_base = os.path.join(RES, f"drawable-{density}", "splashscreen_logo")
        if os.path.isdir(os.path.dirname(dest_splash_base)):
            # Splash is already .png in current state, but we ensure it remains so.
            resize_and_convert(SPLASH_SRC, dest_splash_base, splash_size)

if __name__ == "__main__":
    update_assets()
    print("Native assets updated successfully!")
