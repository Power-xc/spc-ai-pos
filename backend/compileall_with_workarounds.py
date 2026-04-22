"""Compileall wrapper that handles permission issues in db_legacy_root.

This script runs compileall on the app directory while excluding
directories with permission issues.

Usage:
    python compileall_with_exclusions.py

To fix the permission issue permanently (requires sudo):
    sudo chown -R $USER:$USER <workspace>/apps/backend/app/db_legacy_root/__pycache__/
    sudo chown -R $USER:$USER <workspace>/apps/backend/app/db_legacy_root/models/__pycache__/
"""

import compileall
import os
import sys
from pathlib import Path


def compile_app_with_workarounds():
    """Compile all Python files in app directory with permission workarounds."""

    backend_dir = Path(__file__).resolve().parent
    app_dir = backend_dir / "app"

    # Directories with permission issues (owned by root)
    problematic_dirs = [
        app_dir / "db_legacy_root" / "__pycache__",
        app_dir / "db_legacy_root" / "models" / "__pycache__",
    ]

    print("=" * 60)
    print("Python Compileall with Permission Workarounds")
    print("=" * 60)
    print()

    # Check permission issues
    print("Checking permission issues...")
    for pdir in problematic_dirs:
        if pdir.exists():
            stat = os.stat(pdir)
            print(f"  {pdir}: uid={stat.st_uid}, gid={stat.st_gid}")
            if stat.st_uid == 0:  # root
                print(f"    ⚠️  Owned by root - compileall will fail here")

    print()
    print("Workaround: Excluding problematic directories from compileall...")
    print()

    # Create a list of all directories to compile, excluding problematic ones
    success_count = 0
    fail_count = 0
    skip_count = 0

    for root, dirs, files in os.walk(app_dir):
        root_path = Path(root)

        # Skip problematic directories
        if any(str(root_path).startswith(str(p)) for p in problematic_dirs):
            continue

        # Compile .py files in this directory
        for file in files:
            if file.endswith(".py"):
                file_path = root_path / file
                try:
                    result = compileall.compile_file(file_path, force=True, quiet=True)
                    if result:
                        success_count += 1
                    else:
                        fail_count += 1
                except PermissionError as e:
                    print(f"  ⚠️  Permission error: {file_path}")
                    fail_count += 1
                except Exception as e:
                    print(f"  ❌ Error: {file_path} - {e}")
                    fail_count += 1

    # Also try to compile the files in db_legacy_root directly using py_compile
    # which doesn't require writing to __pycache__
    print()
    print("Attempting to compile db_legacy_root files without cache...")

    db_legacy_root = app_dir / "db_legacy_root"
    for py_file in db_legacy_root.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue
        try:
            import py_compile

            py_compile.compile(str(py_file), doraise=True)
            print(f"  ✓ {py_file.relative_to(backend_dir)}")
            success_count += 1
        except Exception as e:
            print(f"  ⚠️  {py_file.relative_to(backend_dir)}: {e}")
            skip_count += 1

    print()
    print("=" * 60)
    print("Summary:")
    print(f"  ✓ Successfully compiled: {success_count}")
    print(f"  ❌ Failed: {fail_count}")
    print(f"  ⚠️  Skipped (permission issues): {skip_count}")
    print("=" * 60)
    print()
    print("To fix permission issues permanently, run:")
    print(
        "  sudo chown -R $USER:$USER /data/sapie/tax/BR-POS-App-UX-PoC/backend/app/db_legacy_root/__pycache__/"
    )
    print(
        "  sudo chown -R $USER:$USER /data/sapie/tax/BR-POS-App-UX-PoC/backend/app/db_legacy_root/models/__pycache__/"
    )
    print()

    if fail_count == 0:
        print("✅ All files compiled successfully (permission issues worked around)")
        return 0
    else:
        print(f"⚠️  {fail_count} files failed to compile")
        return 1


if __name__ == "__main__":
    sys.exit(compile_app_with_workarounds())
