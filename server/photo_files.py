"""Photo files stored next to the sync database (ticket 093).

The photo id becomes a filename, so `valid_photo_id` is the path-traversal
guard: nothing else ever reaches the filesystem.
"""

import os
import re
import tempfile

PHOTO_ID_PATTERN = re.compile(r"[A-Za-z0-9-]{1,64}")
MAX_PHOTO_BYTES = 15 * 1024 * 1024

# extension -> media type
MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
}
HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"}


def valid_photo_id(photo_id):
    return isinstance(photo_id, str) and PHOTO_ID_PATTERN.fullmatch(photo_id) is not None


def detect_extension(data):
    """Return jpg/png/webp/heic from the leading bytes, or None if unknown."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:8] == b"ftyp" and data[8:12] in HEIC_BRANDS:
        return "heic"
    return None


class PhotoFiles:
    def __init__(self, directory):
        self.directory = str(directory)

    def path_for(self, photo_id):
        """Path of the stored file for this id, or None. Id must be valid."""
        if not valid_photo_id(photo_id):
            return None
        for ext in MEDIA_TYPES:
            path = os.path.join(self.directory, f"{photo_id}.{ext}")
            if os.path.isfile(path):
                return path
        return None

    def save(self, photo_id, data, ext):
        if not valid_photo_id(photo_id) or ext not in MEDIA_TYPES:
            raise ValueError("invalid photo id or extension")
        os.makedirs(self.directory, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(dir=self.directory, prefix=".upload-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(temp_path, os.path.join(self.directory, f"{photo_id}.{ext}"))
        except BaseException:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

    def delete(self, photo_id):
        """Remove the file if present; a missing file is not an error."""
        path = self.path_for(photo_id)
        if path is not None:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
