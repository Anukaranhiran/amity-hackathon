#!/usr/bin/env python3
"""Generate Shulker hackathon deck (10 slides) as PPTX."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

# Palette — dark security theme
BG = RGBColor(0x0B, 0x0F, 0x14)
PANEL = RGBColor(0x14, 0x1B, 0x24)
ACCENT = RGBColor(0x22, 0xD3, 0xEE)   # cyan
ACCENT2 = RGBColor(0xF5, 0x9E, 0x0B)  # amber
RED = RGBColor(0xF4, 0x3F, 0x5E)
TXT = RGBColor(0xE6, 0xED, 0xF3)
MUT = RGBColor(0x8B, 0x98, 0xA5)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
W, H = prs.slide_width, prs.slide_height


def add_slide():
    s = prs.slides.add_slide(BLANK)
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = BG
    return s


def box(s, x, y, w, h):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    return tf


def set_run(r, text, size, color=TXT, bold=False, italic=False):
    r.text = text
    f = r.font
    f.size = Pt(size)
    f.color.rgb = color
    f.bold = bold
    f.italic = italic
    f.name = "Segoe UI"


def add_text(tf, text, size=18, color=TXT, bold=False, italic=False, space_after=6, bullet=False, level=0):
    p = tf.paragraphs[0] if (len(tf.paragraphs) == 1 and not tf.paragraphs[0].runs) else tf.add_paragraph()
    p.space_after = Pt(space_after)
    if level:
        p.level = level
    set_run(p.add_run(), ("•  " if bullet else "") + text, size, color, bold, italic)
    return p


def title_bar(s, title, kicker=None):
    tf = box(s, 0.6, 0.35, 12.1, 1.15)
    if kicker:
        add_text(tf, kicker.upper(), 12, ACCENT, bold=True, space_after=2)
        add_text(tf, title, 32, TXT, bold=True, space_after=0)
    else:
        add_text(tf, title, 34, TXT, bold=True, space_after=0)
    line = s.shapes.add_shape(1, Inches(0.65), Inches(1.55), Inches(2.2), Pt(3))
    line.fill.solid(); line.fill.fore_color.rgb = ACCENT; line.line.fill.background()


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text


def card(s, x, y, w, h, fill=PANEL):
    c = s.shapes.add_shape(5, Inches(x), Inches(y), Inches(w), Inches(h))  # rounded rect
    c.fill.solid(); c.fill.fore_color.rgb = fill
    c.line.color.rgb = RGBColor(0x24, 0x2F, 0x3B); c.line.width = Pt(1)
    c.shadow.inherit = False
    tf = c.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.25); tf.margin_right = Inches(0.25)
    tf.margin_top = Inches(0.15); tf.margin_bottom = Inches(0.15)
    tf.vertical_anchor = MSO_ANCHOR.TOP
    return tf


# ---------------- Slide 1 — Title ----------------
s = add_slide()
tf = box(s, 1.0, 1.6, 11.3, 2.2)
add_text(tf, "SHULKER", 66, ACCENT, bold=True, space_after=4)
add_text(tf, "Zero-Trust API Vulnerability Scanner", 30, TXT, bold=True, space_after=14)
add_text(tf, "“Authentication asks who you are. Shulker asks: may you see this?”", 20, MUT, italic=True, space_after=0)
tf2 = box(s, 1.0, 5.6, 11.3, 1.0)
add_text(tf2, "AI-assisted  ·  Evidence-backed  ·  Bounded by design", 16, ACCENT2, bold=True, space_after=4)
add_text(tf2, "AmiHacks · Track C · [Team names]", 14, MUT, space_after=0)
notes(s, "Thirty-second promise: by the end of this deck you'll watch a scanner prove a critical privilege-escalation flaw and three cross-user data leaks — with replayable proof — in under a minute.")

# ---------------- Slide 2 — Problem ----------------
s = add_slide()
title_bar(s, "The gap: nothing proves authorization continuously", "Problem")
tf = box(s, 0.7, 1.9, 12.0, 1.2)
add_text(tf, "API breaches aren't crypto failures — they're authorization failures.", 22, ACCENT2, bold=True)
c = card(s, 0.7, 2.7, 5.9, 2.3)
add_text(c, "BOLA — OWASP API #1", 18, ACCENT, bold=True)
add_text(c, "Change an ID in the URL, read a stranger's data.", 16, bullet=True)
add_text(c, "BFLA — OWASP API #5", 18, ACCENT, bold=True, space_after=2)
add_text(c, "A user-only token reaches admin functions.", 16, bullet=True)
c = card(s, 6.9, 2.7, 5.8, 2.3)
add_text(c, "Why today's tools miss it", 18, ACCENT, bold=True)
add_text(c, "Pen tests: annual, expensive, per-API", 15, bullet=True)
add_text(c, "LLM scanners: confident hallucinations", 15, bullet=True)
add_text(c, "Classic DAST: noise without proof", 15, bullet=True)
tf = box(s, 0.7, 5.4, 12.0, 1.4)
add_text(tf, "Attackers don't break the lock — they sign up, get a valid key, and the server never asks whether they may see that object.", 17, MUT, italic=True)
notes(s, "Attackers don't break the lock — they sign up, get a perfectly valid key, and the server never asks whether they may see that object. Every major API breach in recent memory reduces to this one sentence: the server knew who the caller was, and let them see it anyway.")

# ---------------- Slide 3 — Solution ----------------
s = add_slide()
title_bar(s, "Proof, not guesses", "Solution")
tf = box(s, 0.7, 1.9, 12.0, 0.9)
add_text(tf, "Shulker proves authorization flaws — with HTTP evidence, not LLM confidence.", 22, ACCENT2, bold=True)
c = card(s, 0.7, 2.8, 5.9, 3.0)
add_text(c, "How it works", 18, ACCENT, bold=True)
add_text(c, "Ingest any contract: OpenAPI 3 / Swagger 2 / Postman / HAR / manual", 15, bullet=True)
add_text(c, "One-click specs: Gemini · OpenAI · GitHub · Stripe", 15, bullet=True)
add_text(c, "Two authenticated identities → resource-ownership model → bounded tests", 15, bullet=True)
c = card(s, 6.9, 2.8, 5.8, 3.0)
add_text(c, "Every finding includes", 18, ACCENT, bold=True)
add_text(c, "Expected vs actual behaviour", 15, bullet=True)
add_text(c, "Redacted request/response evidence", 15, bullet=True)
add_text(c, "Copy-paste proof-of-concept curl", 15, bullet=True)
add_text(c, "Rule: no HTTP proof → no finding.", 17, ACCENT2, bold=True, space_after=0)
notes(s, "The insight is that authorization flaws are provable facts. If Alice's token returns Bob's invoice, that's not a hypothesis — it's a reproducible exchange. Shulker automates the boring, careful work humans do in bug bounties: two accounts, an ownership map, and the right replayed requests.")

# ---------------- Slide 4 — Architecture ----------------
s = add_slide()
title_bar(s, "Auditable by construction", "Architecture")
tf = box(s, 0.7, 1.85, 12.0, 0.7)
add_text(tf, "Monorepo · npm workspaces · ~8.7k lines of TypeScript", 18, MUT)
cols = [
    ("packages/scanner-core", "Engine, OpenAPI parser, detectors, SafeHttpClient"),
    ("packages/shared", "Types, severity engine, redaction — zero deps"),
    ("apps/scan-api", "Node backend · SSE · SQLite — zero npm deps"),
    ("apps/web", "React 18 + Vite dashboard (dark, live SSE)"),
    ("apps/cli", "sentinel CLI — CI/CD gate with exit codes"),
    ("apps/sandbox", "ShulkerLab: deliberately vulnerable demo target"),
]
for i, (name, desc) in enumerate(cols):
    x = 0.7 + (i % 3) * 4.1
    y = 2.7 + (i // 3) * 1.85
    c = card(s, x, y, 3.85, 1.65)
    add_text(c, name, 16, ACCENT, bold=True, space_after=3)
    add_text(c, desc, 13.5, TXT, space_after=0)
tf = box(s, 0.7, 6.55, 12.0, 0.6)
add_text(tf, "One engine → dashboard, REST API, and CLI. Identical findings everywhere.", 16, ACCENT2, bold=True)
notes(s, "Security tooling should be auditable, so the backend is zero-dependency Node stdlib — the whole server is ~1,700 readable lines. The same ScanEngine powers the dashboard, the REST API, and the CLI, so findings are identical everywhere.")

# ---------------- Slide 5 — Pipeline ----------------
s = add_slide()
title_bar(s, "Seven bounded phases", "Pipeline")
phases = ["Parse", "Authenticate", "Model + AI hypotheses", "Test", "Analyze", "Findings", "Report"]
for i, ph in enumerate(phases):
    x = 0.55 + i * 1.78
    c = card(s, x, 2.2, 1.62, 1.0, fill=PANEL if i not in (2, 3) else RGBColor(0x1B, 0x2A, 0x36))
    add_text(c, ph, 13, ACCENT if i not in (2, 3) else ACCENT2, bold=True, space_after=0)
    if i < 6:
        ar = s.shapes.add_textbox(Inches(x + 1.52), Inches(2.35), Inches(0.4), Inches(0.6))
        set_run(ar.text_frame.paragraphs[0].add_run(), "→", 20, MUT)
c = card(s, 0.7, 3.8, 5.9, 2.4)
add_text(c, "Detectors", 18, ACCENT, bold=True)
add_text(c, "BOLA — cross-identity replay", 15, bullet=True)
add_text(c, "BFLA — privilege probing", 15, bullet=True)
add_text(c, "Exposure — schema diff of secrets", 15, bullet=True)
add_text(c, "Rate limit — bounded burst probe", 15, bullet=True)
c = card(s, 6.9, 3.8, 5.8, 2.4)
add_text(c, "Safety rails", 18, ACCENT, bold=True)
add_text(c, "Budget meter + 5-min watchdog + cancel", 15, bullet=True)
add_text(c, "All traffic through one chokepoint: SafeHttpClient", 15, bullet=True)
add_text(c, "The scanner physically cannot exceed operator limits", 15, bullet=True)
notes(s, "Walk the phases left to right. Emphasize the chokepoint: every request flows through SafeHttpClient — scope checks, header hygiene, timeouts, budget. The scanner physically cannot exceed the limits the operator set.")

# ---------------- Slide 6 — Features ----------------
s = add_slide()
title_bar(s, "Function-first feature set", "Features")
c = card(s, 0.7, 1.95, 5.9, 2.5)
add_text(c, "Targets & auth", 18, ACCENT, bold=True)
add_text(c, "One-click templates: Gemini · OpenAI · GitHub · Stripe — valid OpenAPI generated in memory", 14.5, bullet=True)
add_text(c, "Auth: API key · Bearer · Basic · custom headers — redacted everywhere", 14.5, bullet=True)
c = card(s, 6.9, 1.95, 5.8, 2.5)
add_text(c, "Dashboard", 18, ACCENT, bold=True)
add_text(c, "Live SSE scan monitor · severity donut · coverage ring", 14.5, bullet=True)
add_text(c, "Attack-surface map · resource graph", 14.5, bullet=True)
add_text(c, "Dark/light professional UI", 14.5, bullet=True)
c = card(s, 0.7, 4.7, 12.0, 1.7)
add_text(c, "Output & CI", 18, ACCENT, bold=True)
add_text(c, "Reports: HTML / Markdown / JSON — evidence and PoCs embedded", 14.5, bullet=True)
add_text(c, "sentinel CLI as a CI gate: --fail-on high exits non-zero on critical findings", 14.5, bullet=True)
notes(s, "Feature-dense but function-first — every widget is real data, no placeholder art. The template demo gets the biggest reaction: click Gemini, and target, auth scheme, and a valid contract appear instantly. Paste a key and you're scanning Google's API.")

# ---------------- Slide 7 — Case study ----------------
s = add_slide()
title_bar(s, "One free account, four findings — the real breach chain", "Case Study · ShulkerLab")
rows = [
    ("1", "Read strangers' vehicles/invoices by changing IDs", "BOLA ×3", "HIGH", RED),
    ("2", "PATCH /users/{id}/role as a normal user", "BFLA", "CRITICAL", RED),
    ("3", "passwordHash in response, undocumented", "Exposure", "HIGH", RED),
    ("4", "Nothing throttles the loop", "Rate limit", "MEDIUM (potential)", ACCENT2),
]
y = 2.05
for n, act, kind, sev, col in rows:
    c = card(s, 0.7, y, 12.0, 1.0)
    add_text(c, f"{n}.  {act}", 17, TXT, bold=True, space_after=2)
    add_text(c, f"{kind}   —   {sev}", 15, col, bold=True, space_after=0)
    y += 1.15
tf = box(s, 0.7, y + 0.05, 12.0, 0.7)
add_text(tf, "Each finding reproduced with redacted evidence + replayable curl. Honest labeling: a scanner can't fully prove a negative.", 15, MUT, italic=True)
notes(s, "This is the Uber-style pattern: no malware, no crypto-breaking — one legitimate account and a server that authenticates but never authorizes. Shulker proves the whole chain in about thirty seconds. Note the honest labeling: missing rate limiting is 'potential', because a scanner can't fully prove a negative.")

# ---------------- Slide 8 — Demo ----------------
s = add_slide()
title_bar(s, "Live demo — proof in 30 seconds", "Demo")
c = card(s, 0.7, 2.0, 5.9, 3.6)
add_text(c, "On stage", 18, ACCENT, bold=True)
add_text(c, "Run Local Demo → 5 confirmed + 1 potential in ~30s", 15, bullet=True)
add_text(c, "Watch the SSE event stream live", 15, bullet=True)
add_text(c, "Open a finding: expected vs actual, [REDACTED] evidence, replayable PoC", 15, bullet=True)
add_text(c, "Then: one-click Gemini template → authorized external scan", 15, bullet=True)
c = card(s, 6.9, 2.0, 5.8, 3.6)
add_text(c, "Fallbacks at every layer", 18, ACCENT, bold=True)
add_text(c, "60-check e2e suite re-proves the engine in 20 seconds", 15, bullet=True)
add_text(c, "Headless verify script — no browser needed", 15, bullet=True)
add_text(c, "Pre-recorded scan report as last resort", 15, bullet=True)
tf = box(s, 0.7, 5.9, 12.0, 0.7)
add_text(tf, "If anything web-side fails on stage, the engine still demonstrates itself headlessly.", 16, ACCENT2, bold=True)
notes(s, "(See shows/DEMO_SCRIPT.md for the full click-and-say script.) If anything web-side fails on stage, the headless verify script re-proves the engine live in 20 seconds — the demo has a fallback at every layer.")

# ---------------- Slide 9 — Technical highlights ----------------
s = add_slide()
title_bar(s, "Why judges can trust the findings", "Technical Highlights")
c = card(s, 0.7, 1.95, 12.0, 1.35)
add_text(c, "Deterministic verification", 18, ACCENT, bold=True)
add_text(c, "AI hypothesizes; only reproduced HTTP creates a finding. A Finding object literally cannot be constructed without a matching test record — hallucinations are structurally impossible.", 15)
c = card(s, 0.7, 3.5, 5.9, 2.6)
add_text(c, "Security engineering", 18, ACCENT, bold=True)
add_text(c, "Redaction at capture: tokens never reach storage, reports, SSE, or browser (e2e-grepped)", 14.5, bullet=True)
add_text(c, "SafeHttpClient: single egress — scope gate, header-injection blocked, budgets", 14.5, bullet=True)
add_text(c, "Two-key external gate: settings toggle AND per-scan authorization", 14.5, bullet=True)
c = card(s, 6.9, 3.5, 5.8, 2.6)
add_text(c, "Quality", 18, ACCENT, bold=True)
add_text(c, "60/60 e2e checks passing", 14.5, bullet=True)
add_text(c, "19/19 unit tests · tsc clean across all workspaces", 14.5, bullet=True)
add_text(c, "Zero-dependency backend — fully auditable", 14.5, bullet=True)
add_text(c, "Positive controls verified live on Swagger Petstore", 14.5, bullet=True)
notes(s, "If judges remember one thing: the LLM never gets the last word. Gemini ranks what to test; a Finding object literally cannot be constructed without a matching test record and evidence. Positive controls — endpoints that correctly deny — are recorded as PASS, proving the harness works.")

# ---------------- Slide 10 — Future scope ----------------
s = add_slide()
title_bar(s, "From annual audit to pre-deploy command", "Future Scope")
c = card(s, 0.7, 2.0, 5.9, 2.9)
add_text(c, "Roadmap", 18, ACCENT, bold=True)
add_text(c, "Record-a-login → auto-derive multi-role actors", 15, bullet=True)
add_text(c, "Diff-scans: CI fails only on new/regressed findings", 15, bullet=True)
add_text(c, "GraphQL schema ingestion", 15, bullet=True)
add_text(c, "Continuous trend tracking across scans", 15, bullet=True)
c = card(s, 6.9, 2.0, 5.8, 2.9)
add_text(c, "Team & links", 18, ACCENT, bold=True)
add_text(c, "[Contributor → area]", 15, bullet=True)
add_text(c, "Repo: github.com/Anukaranhiran/amity-hackathon", 15, bullet=True)
add_text(c, "Live API: cloud-deployed", 15, bullet=True)
tf = box(s, 0.7, 5.5, 12.0, 1.0)
add_text(tf, "“Authentication asks who you are.", 24, TXT, bold=True, space_after=2)
add_text(tf, "Shulker asks: may you see this?”", 24, ACCENT, bold=True, space_after=0)
notes(s, "Close on the mission: turn authorization testing from an annual audit into a pre-deploy command. Then stop talking and take questions — JUDGE_QNA.md has you covered.")

prs.save("Shulker-Pitch-Deck.pptx")
print("Saved Shulker-Pitch-Deck.pptx with", len(prs.slides.__iter__.__self__._sldIdLst), "slides")
