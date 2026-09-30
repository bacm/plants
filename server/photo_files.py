"""Photo files stored next to the sync database (tickets 093, 100).

Each account has its own directory, `<root>/<account id>/<photo id>.<ext>`.
The photo id and the account id both become path components, so
`valid_photo_id` and `valid_account_id` are the path-traversal guards: nothing
else ever reaches the filesystem.
"""

import os
import re
import tempfile

PHOTO_ID_PATTERN = re.compile(r"[A-Za-z0-9-]{1,64}")
# Account ids are uuid4 strings we generated; checked anyway before use in a path.
ACCOUNT_ID_PATTERN = re.compile(r"[0-9a-f-]{36}")
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


def valid_account_id(account_id):
    return isinstance(account_id, str) and ACCOUNT_ID_PATTERN.fullmatch(account_id) is not None


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

    def _account_directory(self, account_id):
        if not valid_account_id(account_id):
            raise ValueError("invalid account id")
        return os.path.join(self.directory, account_id)

    def path_for(self, account_id, photo_id):
        """Path of this account's stored file for this id, or None."""
        directory = self._account_directory(account_id)
        if not valid_photo_id(photo_id):
            return None
        for ext in MEDIA_TYPES:
            path = os.path.join(directory, f"{photo_id}.{ext}")
            if os.path.isfile(path):
                return path
        return None

    def save(self, account_id, photo_id, data, ext):
        directory = self._account_directory(account_id)
        if not valid_photo_id(photo_id) or ext not in MEDIA_TYPES:
            raise ValueError("invalid photo id or extension")
        os.makedirs(directory, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(dir=directory, prefix=".upload-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(temp_path, os.path.join(directory, f"{photo_id}.{ext}"))
        except BaseException:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

    def delete(self, account_id, photo_id):
        """Remove the file if present; a missing file is not an error."""
        path = self.path_for(account_id, photo_id)
        if path is not None:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

    def usage_bytes(self, account_id):
        """Total size of this account's files; 0 if it has none yet."""
        directory = self._account_directory(account_id)
        total = 0
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    if entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
        except FileNotFoundError:
            return 0
        return total

    def count(self, account_id):
        """Number of stored photo files of this account (temp uploads excluded)."""
        directory = self._account_directory(account_id)
        total = 0
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    stem, dot, ext = entry.name.rpartition(".")
                    if dot and stem and ext in MEDIA_TYPES:
                        total += 1
        except FileNotFoundError:
            return 0
        return total

    def legacy_files(self):
        """Files sitting directly in the root: the flat layout from before 100."""
        try:
            with os.scandir(self.directory) as entries:
                return [e.name for e in entries if e.is_file(follow_symlinks=False)]
        except FileNotFoundError:
            return []
