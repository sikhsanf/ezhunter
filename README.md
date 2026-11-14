# Ezhunter — Ashen Wilds

A first-person sword-and-magic survival hunt that runs in the browser (three.js, no build step).
Your hunger never stops: hunt monsters, eat what you kill, and survive as many days as you can.

- **Three maps** joined by waygates: Verdant Vale, Frostfang Tundra, Cinder Wastes — each with its own monsters.
- **Temperaments:** prey flees, neutral beasts fight back only if struck, hunters come for you.
- **Mini-map** showing camp, gates and nearby creatures.
- **Keyboard + mouse or touchscreen**, and installable as an app (PWA) with offline play.

## Play

Serve the folder over HTTP and open it:

```bash
python server.py
```

Then visit http://localhost:5173. Add `--lan` to play from a phone on the same Wi-Fi.
It can also be hosted as a static site (for example GitHub Pages); once opened there, use the browser's
"Install app" / "Add to Home Screen" to install it.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / look | W A S D / mouse | left thumb / right thumb |
| Sword combo | left click | Attack (hold to chain) |
| Cast spell | right click | Cast |
| Select spell | 1 2 3 or wheel | tap a spell slot |
| Sprint | Shift | push the stick to the edge |
| Jump / dodge | Space / Q | Jump / Dodge |
| Eat meat | F | Eat |

## Code

- `index.html` — page, HUD and touch layout
- `src/main.js` — player, combat, hands, mini-map, HUD
- `src/world.js` — maps, terrain, sky, grass, trees, waygates
- `src/monsters.js` — creature models, AI and per-map rosters
- `src/audio.js` — synthesised sound
- `sw.js`, `manifest.webmanifest`, `icons/` — install and offline support
