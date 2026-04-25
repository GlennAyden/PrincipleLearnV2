"""Convert PROJECT_OVERVIEW.md to .docx with rendered mermaid diagrams.

Pipeline:
  1. Parse markdown, extract every ```mermaid ... ``` fenced block.
  2. Render each block to PNG via the mermaid CLI (mmdc).
  3. Substitute the fenced block with an inline image reference.
  4. Hand the rewritten markdown to pandoc (via pypandoc) for .docx output.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

import pypandoc

DOCS_DIR = Path(__file__).resolve().parent
SRC_MD = DOCS_DIR / "PROJECT_OVERVIEW.md"
OUT_DOCX = DOCS_DIR / "PROJECT_OVERVIEW.docx"
DIAGRAM_DIR = DOCS_DIR / "diagrams"
TEMP_MD = DOCS_DIR / "_PROJECT_OVERVIEW.rendered.md"

MERMAID_RE = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)


def render_diagrams(markdown: str) -> str:
    """Render each mermaid block to a PNG and replace with an image reference."""
    DIAGRAM_DIR.mkdir(exist_ok=True)
    matches = list(MERMAID_RE.finditer(markdown))
    if not matches:
        return markdown

    print(f"Found {len(matches)} mermaid block(s) — rendering to PNG...")

    # Replace from the last match backward so earlier offsets stay valid.
    rewritten = markdown
    for idx, match in enumerate(reversed(matches), start=1):
        forward_idx = len(matches) - idx + 1
        mmd_src = match.group(1)
        mmd_path = DIAGRAM_DIR / f"diagram_{forward_idx:02d}.mmd"
        png_path = DIAGRAM_DIR / f"diagram_{forward_idx:02d}.png"
        mmd_path.write_text(mmd_src, encoding="utf-8")

        cmd = [
            "mmdc",
            "-i", str(mmd_path),
            "-o", str(png_path),
            "-b", "white",
            "-s", "2",
            "-w", "1400",
        ]
        print(f"  [{forward_idx}/{len(matches)}] mmdc -> {png_path.name}")
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=str(DOCS_DIR),
        )
        if result.returncode != 0:
            print(f"    WARNING: mmdc failed (exit {result.returncode}).")
            print(f"    stderr: {result.stderr.strip()[:300]}")
            continue

        replacement = f"![Diagram {forward_idx}](diagrams/{png_path.name})"
        rewritten = rewritten[: match.start()] + replacement + rewritten[match.end():]

    return rewritten


def convert_to_docx(markdown_path: Path, docx_path: Path) -> None:
    extra_args = [
        "--toc",
        "--toc-depth=2",
        "--standalone",
        f"--resource-path={DOCS_DIR}",
    ]
    print(f"Pandoc -> {docx_path.name}")
    pypandoc.convert_file(
        str(markdown_path),
        to="docx",
        format="markdown+pipe_tables+grid_tables+yaml_metadata_block",
        outputfile=str(docx_path),
        extra_args=extra_args,
    )


def main() -> int:
    if not SRC_MD.exists():
        print(f"ERROR: {SRC_MD} not found.", file=sys.stderr)
        return 1
    if not shutil.which("mmdc"):
        print("WARNING: mmdc not on PATH — diagrams will be left as code blocks.")

    markdown = SRC_MD.read_text(encoding="utf-8")
    rewritten = render_diagrams(markdown)
    TEMP_MD.write_text(rewritten, encoding="utf-8")

    try:
        convert_to_docx(TEMP_MD, OUT_DOCX)
    finally:
        if TEMP_MD.exists():
            TEMP_MD.unlink()

    size_kb = OUT_DOCX.stat().st_size / 1024
    print(f"OK: {OUT_DOCX} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
