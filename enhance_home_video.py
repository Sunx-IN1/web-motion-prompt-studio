from pathlib import Path

import cv2


ROOT = Path(__file__).parent
SRC = ROOT / "assets" / "hero-particle-video.mp4"
OUT = ROOT / "assets" / "hero-particle-video-clear.mp4"
TARGET_SIZE = (1920, 1080)


def enhance_frame(frame):
    frame = cv2.resize(frame, TARGET_SIZE, interpolation=cv2.INTER_LANCZOS4)

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.12, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    frame = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    smooth = cv2.GaussianBlur(frame, (0, 0), 1.2)
    frame = cv2.addWeighted(frame, 1.08, smooth, -0.08, 0)
    return cv2.convertScaleAbs(frame, alpha=1.03, beta=1)


def main():
    cap = cv2.VideoCapture(str(SRC))
    if not cap.isOpened():
        raise SystemExit(f"Cannot open {SRC}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(OUT), fourcc, fps, TARGET_SIZE)
    if not writer.isOpened():
        raise SystemExit(f"Cannot write {OUT}")

    count = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        writer.write(enhance_frame(frame))
        count += 1

    cap.release()
    writer.release()
    print(f"{OUT} frames={count} fps={fps}")


if __name__ == "__main__":
    main()
