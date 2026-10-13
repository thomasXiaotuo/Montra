"""Create a portable UTF-8 source ZIP using only the Python standard library."""
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1])
target = Path(sys.argv[2])
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file():
            archive.write(path, Path('montra') / path.relative_to(root))
