from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
studio = (root / 'dist/studio.html').read_text()
files = {}

def externalize(match):
    name = f'studio-{len(files)}.js'
    files[name] = match[1].strip() + '\n'
    return f'<script src="{name}"></script>'

studio, count = re.subn(r'<script>(.*?)</script>', externalize, studio, flags=re.S)
if count != 2:
    raise ValueError('Expected the two Studio scripts')
files['studio.html'] = studio
for name in ('manifest.json', 'background.js'):
    files[name] = (root / 'extension' / name).read_bytes()
for name in ('hub.css', 'runs.json'):
    files[name] = (root / 'dist' / name).read_bytes()

with ZipFile(root / 'dist/squeek-hub-chrome-extension.zip', 'w') as archive:
    for name, data in files.items():
        entry = ZipInfo('squeek-hub-chrome-extension/' + name)
        archive.writestr(entry, data, compress_type=ZIP_DEFLATED)
