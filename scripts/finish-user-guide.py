"""Merges the cover and body of the user guide and adds PDF bookmarks.

    python scripts/finish-user-guide.py
"""
import os
import re
import sys
from pypdf import PdfReader, PdfWriter

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
folder = os.path.join(root, "docs", "user-guide")
beginner = len(sys.argv) > 1 and sys.argv[1] == "beginner"
out_path = os.path.join(root, "docs", "YourTour-Beginner-Guide.pdf" if beginner else "YourTour-User-Guide.pdf")

cover = PdfReader(os.path.join(folder, "_cover.pdf"))
body = PdfReader(os.path.join(folder, "_body.pdf"))

writer = PdfWriter()
for page in cover.pages[:1]:
    writer.add_page(page)
for page in body.pages:
    writer.add_page(page)

# Chapter titles as they appear in guide.html (number + title).
html = open(os.path.join(folder, "beginner.html" if beginner else "guide.html"), encoding="utf8").read()
chapters = re.findall(r'<h2><span class="num">([0-9A-Z]+)</span>(.*?)</h2>', html)
clean = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s).replace("&amp;", "&")).strip()

texts = [re.sub(r"\s+", " ", (p.extract_text() or "")) for p in body.pages]
writer.add_outline_item("Cover", 0)
writer.add_outline_item("Contents", 1)
start = 0
for num, title in chapters:
    title = clean(title)
    probe = title[:28]
    for i in range(start, len(texts)):
        if probe in texts[i]:
            writer.add_outline_item(f"{num}. {title}", i + 1)
            start = i
            break
    else:
        print("bookmark not found:", num, title)

writer.add_metadata({
    "/Title": "YourTour — Beginner's guide" if beginner else "YourTour — User guide",
    "/Subject": "Website and WhatsApp customer system — guide for the YourTour team",
    "/Author": "YourTour",
})
writer.page_mode = "/UseOutlines"
with open(out_path, "wb") as fh:
    writer.write(fh)
for name in ("_cover.pdf", "_body.pdf"):
    os.remove(os.path.join(folder, name))
print("written", out_path, "pages:", len(writer.pages), "size KB:", os.path.getsize(out_path) // 1024)
