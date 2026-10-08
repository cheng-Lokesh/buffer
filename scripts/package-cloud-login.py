"""Package generated, credential-free code with Linux executable metadata."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
with ZipFile(root / 'dist-cloud-login.zip', 'w', compression=ZIP_DEFLATED) as archive:
    for name in ('index.js', 'package.json', 'scf_bootstrap'):
        entry = ZipInfo(name)
        entry.create_system = 3
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = (0o100755 if name == 'scf_bootstrap' else 0o100644) << 16
        archive.writestr(entry, (root / 'dist-cloud-login' / name).read_bytes())
with ZipFile(root / 'dist-cloud-login.zip') as archive:
    assert archive.getinfo('scf_bootstrap').external_attr >> 16 == 0o100755
    assert b'\r' not in archive.read('scf_bootstrap')
print('cloud_login_zip_executable_verified')
