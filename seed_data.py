import json
import urllib.error
import urllib.request
from datetime import date

# PASTE YOUR API GATEWAY URL HERE (no trailing slash)
API_BASE = "https://1zsyi1450e.execute-api.ap-southeast-2.amazonaws.com"
TODAY = date.today().isoformat()


def post(path, payload):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print("AWS Error:", e.code, e.read().decode("utf-8"))
        raise


# 1. Seed 38 realistic student meal opt-outs
meals = ["Breakfast", "Lunch", "Dinner"]
print("Seeding meal opt-outs...")
for i in range(101, 139):
    post("/optout", {
        "student_id": f"STU_{i}",
        "meal": meals[i % 3],
        "date": TODAY,
    })
print("✓ 38 opt-outs added.")

# 2. Seed 6 realistic maintenance tickets (1 Critical, 3 High, 2 Normal)
tickets = [
    ("B-204", "Electrical", "Switchboard spark and burning smell near study desk — urgent!"),
    ("A-112", "Plumbing", "Water pipe leak in washroom corridor."),
    ("C-308", "Wi-Fi", "Wi-Fi router down on 3rd floor wing since morning."),
    ("B-109", "Electrical", "Ceiling fan regulator stopped working and power socket is loose."),
    ("A-215", "Furniture", "Study chair leg is loose and wobbling."),
    ("C-104", "General", "Window mesh has a small tear near the balcony."),
]

print("Seeding maintenance tickets...")
for room, cat, desc in tickets:
    res = post("/ticket", {"room": room, "category": cat, "description": desc})
    t = res.get("ticket", {})
    print(f"  ✓ {t.get('priority')} | Room {room} ({t.get('ticket_id')})")

print("\nDone! Refresh your Warden Dashboard to see the live data.")