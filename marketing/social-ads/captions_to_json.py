"""Rebuild captions.json from captions.md (the .md is the one people edit).

A section whose heading starts with C (e.g. "## C01 · ...") is a carousel; its
slides are every vantriqai-carousel-<nn>-<k>.png in this folder, in order.

An optional "**Post on:** YYYY-MM-DD" line schedules a post for that day. Posts
without one (and dated posts once their day has passed) rotate as evergreen.
"""
import json, pathlib, re

here = pathlib.Path(__file__).parent
md = (here / "captions.md").read_text()

def quote(block):
    lines = [l[2:] if l.startswith("> ") else "" for l in block.strip().splitlines() if l.startswith(">")]
    return "\n".join(lines).strip()

posts = []
for sec in re.split(r"\n## ", md)[1:]:
    pid = sec.split(" ", 1)[0]
    headline = re.search(r"\*\*Headline \(ad field\):\*\* (.*)", sec).group(1).strip()
    fb = sec.split("**Primary text / Facebook:**")[1].split("**Instagram:**")[0]
    ig = sec.split("**Instagram:**")[1].split("\n---")[0]
    post = {"id": pid, "headline": headline, "facebook": quote(fb), "instagram": quote(ig)}
    date = re.search(r"\*\*Post on:\*\* (\d{4}-\d{2}-\d{2})", sec)
    if date:
        post["date"] = date.group(1)
    if pid.startswith("C"):
        n = pid[1:]
        slides = sorted(here.glob(f"vantriqai-carousel-{n}-*.png"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
        if not 2 <= len(slides) <= 10:
            raise SystemExit(f"{pid}: carousels need 2–10 slides, found {len(slides)}")
        post.update(type="carousel", images=[p.name for p in slides])
    else:
        image = f"vantriqai-ad-{pid}.png"
        if not (here / image).exists():
            raise SystemExit(f"{pid}: {image} is missing")
        post.update(type="image", image=image)
    posts.append(post)

dates = [p["date"] for p in posts if "date" in p]
if len(dates) != len(set(dates)):
    raise SystemExit("Two posts share a Post on date; one would never be posted.")

(here / "captions.json").write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
print(f"captions.json: {len(posts)} posts ({sum(p['type'] == 'carousel' for p in posts)} carousel)")
