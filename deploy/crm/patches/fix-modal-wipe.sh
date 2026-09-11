#!/usr/bin/env bash
# Fix: the "Add client" (and every other) modal blanks itself while you type.
#
# Cause: refreshUsage() polls /api/dashboard every 20s and calls render() on the
# dashboard/clients/pipeline views. render() calls renderModal(), which rebuilds
# the modal with root.innerHTML. Form values live only in the DOM, and a new
# client renders every input as value="", so the poll wipes whatever was typed.
#
# Fix: skip the repaint while a modal or detail panel is open. state is still
# updated, so the next poll after closing paints the fresh numbers.
#
# Verified with a headless-browser test: type into #f_name, wait 23s for the
# poll. Before: the field reads "". After: it still reads what was typed.
#
# Run on the VPS, then rebuild:
#   bash fix-modal-wipe.sh && cd /root/crm-stack && docker compose up -d --build
set -euo pipefail

TARGET="${1:-/root/crm-stack/vantriq-backend/public/index.html}"
[ -f "$TARGET" ] || { echo "Not found: $TARGET"; exit 1; }
cp "$TARGET" "$TARGET.bak"

python3 - "$TARGET" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "    if(['dashboard','clients','pipeline'].includes(currentView)) render();"
new = ("    // Never repaint while a modal or detail panel is open: render() rebuilds\n"
       "    // both with innerHTML, which wipes whatever has been typed into the form.\n"
       "    // state is already updated above, so the next poll paints the fresh numbers.\n"
       "    if(openModal || openPanel) return;\n"
       "    if(['dashboard','clients','pipeline'].includes(currentView)) render();")
if "if(openModal || openPanel) return;" in s:
    print("already patched, nothing to do"); sys.exit(0)
if s.count(old) != 1:
    print(f"expected 1 match, found {s.count(old)} - not patching"); sys.exit(1)
open(p, "w").write(s.replace(old, new))
print("patched", p)
PY
