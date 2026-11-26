"""Convert two completed finish recordings and measured clock anchors to a review bundle."""
import argparse
import json
from fractions import Fraction
from pathlib import Path
import subprocess
import tempfile


def export_camera(folder, calibration, out):
    capture = json.loads((folder / "capture.json").read_text())
    side = capture["camera"]
    if capture["version"] != 1 or side not in ("A", "B"):
        raise ValueError("Unknown camera receipt")
    frames = capture["frames"]
    movie = str(folder / "finish.mov")
    probe = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_streams", "-show_entries", "frame=pts:stream=time_base", "-of", "json", movie])
    metadata = json.loads(probe)
    unit = Fraction(metadata["streams"][0]["time_base"])
    decoded = [int(f["pts"]) * unit for f in metadata["frames"]]
    if len(decoded) != len(frames) or len(decoded) < 2:
        raise ValueError(f"Camera {side}: decoded frame count differs from receipt")
    anchor = calibration[side]
    first, last = anchor["first"], anchor["last"]
    if last["starterUs"] <= first["starterUs"] or last["localUs"] <= first["localUs"]:
        raise ValueError("Invalid clock anchors")
    origin = Fraction(frames[0]["ptsValue"], frames[0]["ptsScale"])
    index = []
    previous = -1
    for n, (stamp, movie_pts) in enumerate(zip(frames, decoded)):
        source = Fraction(stamp["ptsValue"], stamp["ptsScale"])
        local = stamp["localUs"]
        if not first["localUs"] <= local <= last["localUs"] or local <= previous:
            raise ValueError(f"Camera {side}: calibration gap or unordered timestamps")
        if abs(source * 1_000_000 - local) > Fraction(1, 2):
            raise ValueError("Receipt time domains disagree")
        if abs(movie_pts - decoded[0] - (source - origin)) > unit:
            raise ValueError(f"Camera {side}: movie and receipt disagree at frame {n}")
        previous = local
        index.append({"localUs": local, "file": f"{side}-{n:06}.jpg"})
    subprocess.run(["ffmpeg", "-v", "error", "-i", movie, "-map", "0:v:0",
                    "-vsync", "0", "-q:v", "2", "-start_number", "0", str(out / f"{side}-%06d.jpg")], check=True)
    if len(list(out.glob(f"{side}-*.jpg"))) != len(index):
        raise ValueError(f"Camera {side}: incomplete image export")
    return {"id": side, "first": first, "last": last, "frames": index}


def export(config, a, b, output):
    if output.exists():
        raise ValueError("Choose a new output directory")
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        out = Path(tmp) / "review"
        out.mkdir()
        cameras = [export_camera(folder, config["calibration"], out) for folder in (a, b)]
        if {c["id"] for c in cameras} != {"A", "B"}:
            raise ValueError("Provide one recording from each finish side")
        heat = {k: config[k] for k in ("title", "startUs", "roster")}
        heat.update(version=1, cameras=cameras, marks=[])
        (out / "heat.json").write_text(json.dumps(heat, indent=2))
        out.rename(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("config", "finish_a", "finish_b", "output"):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    export(json.loads(args.config.read_text()), args.finish_a, args.finish_b, args.output)
