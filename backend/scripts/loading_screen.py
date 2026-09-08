"""
STRAY-SAFE Dynamic Loading Animation Runner
Run this script to display the loading screen for cats or dogs.

Usage examples:
    python loading_screen.py cat
    python loading_screen.py dog
    python loading_screen.py cat 3.5
    python loading_screen.py --animal cat --duration 3
"""

import os
import sys
import time
import argparse

# Add parent directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.utils.loading_animation import (
    StraySafeLoadingScreen,
    normalize_animal_type,
    show_loading,
    with_loading_screen
)

def main():
    parser = argparse.ArgumentParser(description="STRAY-SAFE Dynamic Animal Loading Animation Runner")
    parser.add_argument("pos_animal_or_duration", nargs="?", default=None, help="Animal type ('cat'/'dog') or duration in seconds")
    parser.add_argument("pos_duration", nargs="?", default=None, type=float, help="Optional duration in seconds")
    parser.add_argument("--animal", "-a", type=str, default=None, help="Animal type: 'cat' or 'dog'")
    parser.add_argument("--duration", "-d", type=float, default=None, help="Duration in seconds before closing")
    parser.add_argument("--status", "-s", type=str, default=None, help="Initial status message")
    parser.add_argument("--fps", type=int, default=12, help="Animation FPS")
    args = parser.parse_args()

    # Determine animal type
    animal = "dog"
    duration = 3.5

    if args.animal:
        animal = args.animal
    elif args.pos_animal_or_duration:
        try:
            duration = float(args.pos_animal_or_duration)
        except ValueError:
            animal = args.pos_animal_or_duration

    if args.duration is not None:
        duration = args.duration
    elif args.pos_duration is not None:
        duration = args.pos_duration

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    norm_animal = normalize_animal_type(animal)
    is_cat = (norm_animal == "cat")
    animal_label = "Cat [Cat]" if is_cat else "Dog [Dog]"

    initial_status = args.status or f"Submitting {norm_animal.capitalize()} Report..."

    print(f"Starting STRAY-SAFE {norm_animal.upper()} Loading Animation ({duration:.1f}s)...")
    print(f"Animal type: {norm_animal} | Asset: {'running_cat.gif' if is_cat else 'straysafe_loading_edited.gif'}")

    with StraySafeLoadingScreen(animal_type=norm_animal, status=initial_status, fps=args.fps) as loader:
        time.sleep(duration * 0.35)
        loader.set_status(f"Processing {norm_animal} sighting evidence & media...")
        time.sleep(duration * 0.35)
        loader.set_status("Dispatched to community responders!")
        time.sleep(duration * 0.3)

    print("Loading screen finished cleanly.")

if __name__ == "__main__":
    main()

