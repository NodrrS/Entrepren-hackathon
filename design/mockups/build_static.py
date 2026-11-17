"""Turn the canvas .dc.html mockups into plain static HTML pages (default tweak values)."""
import re
import sys
from pathlib import Path

src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])

NAMES = {
    "Main.dc.html": "1-phone-setup.html",
    "Phone-Sign.dc.html": "2-phone-signing.html",
    "Phone-Reply.dc.html": "3-phone-reply.html",
    "Counter-Live.dc.html": "4-counter-staff.html",
    "Counter-Signer.dc.html": "5-counter-customer.html",
}

for src_name, out_name in NAMES.items():
    text = (src_dir / src_name).read_text()
    title = re.search(r"<title>(.*?)</title>", text, re.S).group(1)
    helmet = re.search(r"<helmet>(.*?)</helmet>", text, re.S).group(1)
    body = re.search(r"</helmet>(.*?)</x-dc>", text, re.S).group(1)

    # Phone-Reply defaults: picture style.
    body = body.replace("{{styleLabel}}", "Pictures + simple text")
    body = re.sub(r'<sc-if value="\{\{textOnly\}\}"[^>]*>.*?</sc-if>', "", body, flags=re.S)
    body = re.sub(r'<sc-if value="\{\{pictures\}\}"[^>]*>(.*?)</sc-if>', r"\1", body, flags=re.S)
    if "{{" in body or "<sc-" in body:
        raise SystemExit(f"unresolved template syntax left in {src_name}")

    for s, o in NAMES.items():
        body = body.replace(f'href="{s}"', f'href="{o}"')

    page = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{title}</title>\n{helmet.strip()}\n</head>\n<body>\n{body.strip()}\n</body>\n</html>\n"
    )
    (out_dir / out_name).write_text(page)
    print(out_name)
