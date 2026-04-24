with open("app.js", "r") as f:
    text = f.read()

open_braces = text.count("{")
close_braces = text.count("}")
open_brackets = text.count("[")
close_brackets = text.count("]")

print(f"Braces: {open_braces} open, {close_braces} closed")
print(f"Brackets: {open_brackets} open, {close_brackets} closed")

lines = text.split("\n")
for i, line in enumerate(lines):
    if "lengths:" in line and "]," not in line and "} " not in line and "}" not in line:
        pass
