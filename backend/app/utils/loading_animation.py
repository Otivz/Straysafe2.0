"""
STRAY-SAFE Dynamic Loading Animation
Smooth, centered, responsive, non-blocking loading screen for the STRAY-SAFE Python system.
Supports both running Cat GIF and running Dog GIF based on animal type.
"""

import os
import sys
import time
import argparse
import subprocess
from typing import Optional, Callable
from contextlib import contextmanager
from functools import wraps
from PIL import Image, ImageTk

# Base asset paths
UTILS_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(UTILS_DIR)
BACKEND_DIR = os.path.dirname(APP_DIR)
ASSETS_DIR = os.path.join(BACKEND_DIR, "assets")

DOG_GIF_PATH = os.path.join(ASSETS_DIR, "straysafe_loading_edited.gif")
if not os.path.exists(DOG_GIF_PATH):
    DOG_GIF_PATH = os.path.join(ASSETS_DIR, "straysafe_loading.gif")

CAT_GIF_PATH = os.path.join(ASSETS_DIR, "running_cat.gif")


def normalize_animal_type(animal: Optional[str]) -> str:
    """Normalizes any animal string into 'cat' or 'dog'."""
    if not animal:
        return "dog"
    lower = str(animal).strip().lower()
    if any(k in lower for k in ["cat", "feline", "puspin", "kitten"]):
        return "cat"
    return "dog"


def _run_gui_window(
    animal_type: str = "dog",
    status: str = "Loading...",
    fps: int = 11,
    duration: Optional[float] = None
):
    """Internal Tkinter GUI loop that runs on the main thread of the process."""
    norm_animal = normalize_animal_type(animal_type)
    is_cat = (norm_animal == "cat")
    
    try:
        import tkinter as tk
    except ImportError:
        print(f"[STRAY-SAFE Headless ({norm_animal.upper()})] {status}")
        if duration:
            time.sleep(duration)
        return

    root = tk.Tk()
    root.title(f"STRAY-SAFE - {norm_animal.capitalize()} Loading...")
    root.configure(bg="#F4ECE2")
    root.overrideredirect(True) # Frameless rounded panel style
    root.attributes("-topmost", True)

    target_gif = CAT_GIF_PATH if is_cat else DOG_GIF_PATH
    if not os.path.exists(target_gif):
        target_gif = DOG_GIF_PATH if os.path.exists(DOG_GIF_PATH) else CAT_GIF_PATH

    frames = []
    if os.path.exists(target_gif):
        gif = Image.open(target_gif)
        total_frames = getattr(gif, "n_frames", 1)
        # Sample frames for instant startup and smooth 11-16 fps loop
        step = 4 if is_cat and total_frames > 30 else 1
        for idx in range(0, total_frames, step):
            gif.seek(idx)
            frame = gif.copy().convert("RGBA")
            # If cat gif is 600x338, optionally resize to friendly 480x270 or keep original
            if is_cat and frame.width > 500:
                frame = frame.resize((480, 270), Image.Resampling.LANCZOS)
            frames.append(frame)

    if not frames:
        for i in range(1, 9):
            fpath = os.path.join(ASSETS_DIR, f"loading_frame_{i}.png")
            if os.path.exists(fpath):
                frames.append(Image.open(fpath).convert("RGBA"))

    if not frames:
        print(f"[STRAY-SAFE ({norm_animal.upper()})] {status}")
        return

    photo_images = [ImageTk.PhotoImage(f) for f in frames]
    img_w = photo_images[0].width()
    img_h = photo_images[0].height()

    # Center precisely on user's primary monitor
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    pos_x = (screen_w - img_w) // 2
    pos_y = (screen_h - img_h) // 2
    root.geometry(f"{img_w}x{img_h}+{pos_x}+{pos_y}")

    # Display panel
    label = tk.Label(
        root,
        image=photo_images[0],
        bd=0,
        highlightthickness=0,
        bg="#F4ECE2"
    )
    label.pack(fill="both", expand=True)

    # Allow moving the frameless window by dragging
    drag_pos = {"x": 0, "y": 0}

    def on_click(e):
        drag_pos["x"] = e.x
        drag_pos["y"] = e.y

    def on_drag(e):
        x = root.winfo_x() + (e.x - drag_pos["x"])
        y = root.winfo_y() + (e.y - drag_pos["y"])
        root.geometry(f"+{x}+{y}")

    label.bind("<Button-1>", on_click)
    label.bind("<B1-Motion>", on_drag)

    # Animation cycle
    frame_delay = max(20, int(1000 / fps))
    cur_frame = [0]
    start_time = time.time()

    def animate():
        if duration and (time.time() - start_time) >= duration:
            root.destroy()
            return
        cur_frame[0] = (cur_frame[0] + 1) % len(photo_images)
        label.configure(image=photo_images[cur_frame[0]])
        root.after(frame_delay, animate)

    root.after(frame_delay, animate)
    root.mainloop()


class StraySafeLoadingScreen:
    """
    Non-blocking, centered loading screen for STRAY-SAFE Python tasks.
    Automatically displays either running cat GIF or running dog GIF.
    
    Usage:
        # Context manager for Cat
        with StraySafeLoadingScreen(animal_type="cat", status="Submitting Cat Report..."):
            heavy_computation()
            
        # Context manager for Dog
        with StraySafeLoadingScreen(animal_type="dog", status="Submitting Dog Report..."):
            heavy_computation()
            
        # Programmatic start/stop
        loader = StraySafeLoadingScreen(animal_type="cat", status="Analyzing Cat Sighting...")
        loader.start()
        # do heavy work
        loader.stop()
    """

    def __init__(self, animal_type: str = "dog", status: str = "Loading...", fps: int = 12):
        self.animal_type = normalize_animal_type(animal_type)
        self.status = status
        self.fps = fps
        self._proc: Optional[subprocess.Popen] = None

    def start(self):
        """Launch the centered loading window asynchronously in the background."""
        if self._proc is not None:
            return

        cmd = [
            sys.executable,
            os.path.abspath(__file__),
            "--gui",
            "--animal", self.animal_type,
            "--status", str(self.status),
            "--fps", str(self.fps),
        ]
        try:
            self._proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=BACKEND_DIR
            )
            # Short wait for GUI window initialization
            time.sleep(0.35)
        except Exception as e:
            print(f"[STRAY-SAFE Loader] Headless fallback: {self.status} (error: {e})")

    def stop(self):
        """Cleanly close the loading screen window."""
        if self._proc is not None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=1.5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None

    def set_status(self, new_status: str):
        """Log status progress."""
        self.status = new_status
        print(f"[STRAY-SAFE {self.animal_type.upper()} Loading] {new_status}")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()


@contextmanager
def show_loading(
    animal_type: str = "dog",
    status: str = "Loading...",
    duration: Optional[float] = None,
    fps: int = 12
):
    """
    Context manager for displaying the STRAY-SAFE animal loading animation.
    """
    loader = StraySafeLoadingScreen(animal_type=animal_type, status=status, fps=fps)
    loader.start()
    try:
        if duration:
            time.sleep(duration)
        yield loader
    finally:
        loader.stop()


def with_loading_screen(animal_type: str = "dog", status: str = "Processing..."):
    """
    Decorator for wrapping long-running functions with the animal loading screen.
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with StraySafeLoadingScreen(animal_type=animal_type, status=status):
                return func(*args, **kwargs)
        return wrapper
    return decorator


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="STRAY-SAFE Dynamic Animal Loading Animation")
    parser.add_argument("--gui", action="store_true", help="Run the GUI window loop directly")
    parser.add_argument("--animal", "-a", type=str, default="dog", help="Animal type: 'cat' or 'dog'")
    parser.add_argument("--status", type=str, default="Loading...", help="Status text")
    parser.add_argument("--fps", type=int, default=12, help="Frames per second")
    parser.add_argument("--duration", type=float, default=None, help="Duration in seconds before closing")
    args = parser.parse_args()

    norm_animal = normalize_animal_type(args.animal)

    if args.gui:
        _run_gui_window(animal_type=norm_animal, status=args.status, fps=args.fps, duration=args.duration)
    else:
        # Standalone interactive demo
        print("=" * 60)
        print(f">> STRAY-SAFE {norm_animal.upper()} Loading Animation <<")
        if norm_animal == "cat":
            print("Loaded running Cat GIF (running_cat.gif)")
        else:
            print("Loaded running Dog GIF (straysafe_loading_edited.gif)")
        print("=" * 60)
        demo_sec = args.duration or 3.5
        print(f"Launching centered {norm_animal} loading screen for {demo_sec} seconds...")
        with StraySafeLoadingScreen(animal_type=norm_animal, status=f"Submitting {norm_animal.capitalize()} Report...", fps=args.fps) as loader:
            time.sleep(demo_sec * 0.3)
            loader.set_status(f"Uploading {norm_animal} sighting evidence...")
            time.sleep(demo_sec * 0.4)
            loader.set_status("Dispatching to community responders...")
            time.sleep(demo_sec * 0.3)
        print("Loading screen closed cleanly with zero UI freezing!")
