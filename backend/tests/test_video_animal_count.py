"""
A video's animal count is the most animals seen in one frame, not the total over all sampled frames (one dog seen in
8 frames used to count as 8+ animals: "Multiple Animals Detected (10+)").
Run from the backend folder:  python tests/test_video_animal_count.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from app.utils.video_processing import analyze_video_frames  # noqa: E402

results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok   " if ok else "  FAIL ") + label + ("" if ok else f"  -> {extra}"))


class _Boxes:
    def __init__(self, n):
        self.cls = [16] * n                                   # 16 = dog in the COCO labels
        self.xyxy = [[10.0 + 120 * i, 10.0, 100.0 + 120 * i, 90.0] for i in range(n)]   # separate animals
        self.conf = [0.9] * n


class _Result:
    names = {16: "dog"}

    def __init__(self, n):
        self.boxes = _Boxes(n)


class FakeYolo:
    """Returns a fixed number of dogs per frame, frame by frame."""

    def __init__(self, per_frame):
        self.per_frame = list(per_frame)

    def __call__(self, frame):
        return [_Result(self.per_frame.pop(0))]


frames = [Image.new("RGB", (100, 100)) for _ in range(8)]

_, labels, _, count = analyze_video_frames(frames, FakeYolo([1] * 8))
check("one dog seen in all 8 frames counts as 1 animal", count == 1, count)
check("...and the chosen frame has that one dog", labels == ["Dog"], labels)

_, _, _, count = analyze_video_frames(frames, FakeYolo([1, 1, 2, 1, 0, 1, 1, 1]))
check("two dogs together in one frame count as 2", count == 2, count)

_, _, _, count = analyze_video_frames(frames, FakeYolo([0] * 8))
check("no animal in any frame counts as 0", count == 0, count)

# one animal boxed twice in a frame (YOLO keeps a "cat" and a "dog" box over the same cat; body + head boxes)
from app.utils.video_processing import count_distinct_animals  # noqa: E402
cat = [100.0, 100.0, 300.0, 280.0]
check("one cat boxed as both cat and dog counts once", count_distinct_animals([cat, [105.0, 98.0, 295.0, 285.0]], [0.88, 0.52]) == 1)
check("a head box inside the body box counts once", count_distinct_animals([cat, [120.0, 105.0, 190.0, 170.0]], [0.9, 0.6]) == 1)
check("a weak extra box (blur, shadow) doesn't add an animal", count_distinct_animals([cat, [400.0, 50.0, 470.0, 120.0]], [0.9, 0.3]) == 1)
check("two cats side by side count as 2", count_distinct_animals([cat, [320.0, 100.0, 520.0, 280.0]], [0.9, 0.8]) == 2)
check("a single weak box still counts as 1 animal", count_distinct_animals([cat], [0.3]) == 1)
check("no boxes, no animals", count_distinct_animals([], []) == 0)


class _DupBoxes:
    def __init__(self):
        self.cls = [15, 16]                                     # cat, dog over the same animal
        self.xyxy = [[10.0, 10.0, 60.0, 60.0], [12.0, 11.0, 61.0, 58.0]]
        self.conf = [0.85, 0.5]


class _DupResult:
    names = {15: "cat", 16: "dog"}
    boxes = _DupBoxes()


_, _, _, count = analyze_video_frames(frames, lambda f: [_DupResult()])
check("a cat video where every frame boxes the cat twice counts 1", count == 1, count)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
