"""Build a UTF-8 ZIP with Unix launcher permissions, independent of host OS."""
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1])
target = Path(sys.argv[2])
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and not path.is_symlink():
            relative = path.relative_to(root)
            info = zipfile.ZipInfo((Path(root.name) / relative).as_posix())
            info.create_system = 3
            executable = path.suffix in ('.sh', '.command')
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
