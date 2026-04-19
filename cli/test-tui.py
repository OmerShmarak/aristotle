#!/usr/bin/env python3
"""
TUI observability harness for aristotle.

Spawns `node bin/aristotle.js <topic>` under a real PTY (via Python's built-in
`pty` module — no native deps) so Ink renders like a real terminal. Captures
every stdout chunk with a monotonic timestamp, scripts turn 2 (diagnosis
answer) and turn 3 (approval), and scans for static windows (gaps > threshold
with no screen updates).

Why this matters: Ink redraws its live area on every React state change. A
spinner/progress bar that's animating triggers a redraw every 80-400ms, so
any gap > ~1s in PTY output means nothing was animating — the display was
static, which is the "50 seconds of nothing" bug.

Usage:
    python3 test-tui.py "coin flips"
    python3 test-tui.py "coin flips" --max-gap 2.0
"""
import pty, os, sys, time, json, select, re, signal, argparse

ARISTOTLE_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "aristotle.js")
ARGS = argparse.ArgumentParser()
ARGS.add_argument("topic", nargs="?", default="coin flips")
ARGS.add_argument("--max-gap", type=float, default=2.0, help="fail if any PTY output gap exceeds this (seconds)")
ARGS.add_argument("--hard-timeout", type=float, default=900.0, help="overall hard timeout (seconds)")
ARGS.add_argument("--log-dir", default="/tmp")
ns = ARGS.parse_args()

stamp = int(time.time() * 1000)
raw_log = os.path.join(ns.log_dir, f"aristotle-tui-{stamp}.log")
json_log = raw_log + ".chunks.jsonl"
with open(raw_log, "w") as f: pass
with open(json_log, "w") as f: pass

started = time.monotonic()
def ts(): return f"{time.monotonic() - started:7.2f}s"
def log(*a): print(f"[{ts()}]", *a, file=sys.stderr, flush=True)

log(f"topic     : {ns.topic}")
log(f"raw log   : {raw_log}")
log(f"json log  : {json_log}")
log(f"max gap   : {ns.max_gap}s")

# --- Fork a PTY ---
pid, fd = pty.fork()
if pid == 0:
    # child: exec node bin/aristotle.js <topic>
    os.execvp("node", ["node", ARISTOTLE_BIN, ns.topic])

# parent:
chunks = []
buffer = b""
last_data_at = time.monotonic()
stage = 0  # 0=await-diagnosis, 1=await-outline, 2=await-done
staged_at = {0: time.monotonic()}
saw_done = False

ANSI_RE = re.compile(rb"\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][0-9A-Za-z]")

def stripped(b):
    return ANSI_RE.sub(b"", b).decode("utf-8", errors="replace")

def write_chunk(data, gap_s):
    now = time.monotonic() - started
    entry = {
        "t": round(now, 3),
        "gap": round(gap_s, 3),
        "bytes": len(data),
        "text": stripped(data)[-200:],
    }
    chunks.append(entry)
    with open(json_log, "a") as f:
        f.write(json.dumps(entry) + "\n")
    with open(raw_log, "ab") as f:
        f.write(data)

def send(text, label):
    log(f"→ send [{label}]: {text!r}")
    os.write(fd, (text + "\r").encode("utf-8"))

def visible_text():
    return stripped(buffer)

hard_deadline = time.monotonic() + ns.hard_timeout

try:
    while True:
        if time.monotonic() > hard_deadline:
            log("hard timeout reached, killing")
            break
        r, _, _ = select.select([fd], [], [], 0.5)
        if r:
            try:
                data = os.read(fd, 8192)
            except OSError:
                break
            if not data:
                break
            now = time.monotonic()
            gap = now - last_data_at
            write_chunk(data, gap)
            buffer += data
            last_data_at = now

            txt = visible_text()
            if stage == 0 and re.search(r"question|diagnos|know|calibrat", txt, re.I) and time.monotonic() - staged_at[0] > 3:
                time.sleep(1.0)
                send("I don't know any of the answers to your questions.", "turn 2 (ignorance)")
                stage = 1; staged_at[1] = time.monotonic()
            elif stage == 1 and re.search(r"approve|sound good|sound right|proceed|want me to|ready to write", txt, re.I) and time.monotonic() - staged_at[1] > 3:
                time.sleep(1.0)
                send("ok", "turn 3 (approval)")
                stage = 2; staged_at[2] = time.monotonic()
            elif stage == 2 and re.search(r"open .*\.html|breakdown\.html", txt, re.I):
                saw_done = True
                log("saw completion hint")
                # give it a moment to exit cleanly
                try:
                    os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    pass
                break
        else:
            # no data for 500ms; check whether child exited
            try:
                wpid, status = os.waitpid(pid, os.WNOHANG)
                if wpid != 0:
                    log(f"child exited (status={status})")
                    break
            except ChildProcessError:
                break
finally:
    try:
        os.kill(pid, signal.SIGTERM)
        time.sleep(0.3)
        os.kill(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try: os.close(fd)
    except: pass

# --- Analyze ---
log("\n— analysis —")
log(f"chunks captured   : {len(chunks)}")
if not chunks:
    log("  🔴 no output captured at all")
    sys.exit(3)
log(f"total duration    : {chunks[-1]['t']:.1f}s")

gaps = sorted([c for c in chunks if c["gap"] > 1.0], key=lambda c: -c["gap"])
log(f"gaps > 1.0s       : {len(gaps)}")
for g in gaps[:15]:
    preview = g["text"].strip().replace("\n", " ⏎ ")[:100]
    log(f"  gap={g['gap']:5.2f}s  @ t={g['t']:6.1f}s  next=\"{preview}\"")

longest = max(chunks, key=lambda c: c["gap"])
log(f"longest gap       : {longest['gap']:.2f}s @ t={longest['t']:.1f}s")
log(f"saw completion    : {saw_done}")

fails = [g for g in gaps if g["gap"] > ns.max_gap]
if fails:
    log(f"\n  🔴 FAIL — {len(fails)} static windows exceeded {ns.max_gap}s (longest {longest['gap']:.2f}s)")
    log(f"  full chunk log: {json_log}")
    sys.exit(2)
else:
    log(f"\n  ✅ PASS — no static window exceeded {ns.max_gap}s (longest {longest['gap']:.2f}s)")
    sys.exit(0)
