# Light Direction 🔦

Read the form, place the light — trains the values instinct of tracing a
highlight and terminator back to the light source. A hidden sun lambert-shades
a matte form (spheres, then lumpy blended blobs, contrast falling and
elevations going extreme as the round ramps); you place a sun marker on an
azimuth ring (direction) + elevation arc (tilt) and lock it in. After every
guess the true sun is revealed for 4s with side-by-side patches of **your**
light and the true light on that same form, the two misses named on their own
dials, and the 3D miss in degrees.

Nothing on the sheet is faked: the form is shaded per pixel from real surface
normals against a real light vector, and the cast shadow is the sphere set
projected along that vector onto the ground plane under a declared 16° camera
pitch — so shadow length comes from the sun's true altitude over the floor
(long and faint when it rakes, a tight pool when it is overhead) and can never
contradict the shading above it.

Scoring is pure geometry: per form `100 · clamp(1 − max(0, angErr − 3°) / 42°)`
— 100 within a 3° grace cone, 0 at 45° off — where `angErr` is the 3D angle
between your light vector and the true one; a round is the mean of 6 forms.
Drag the ring or the arc, `enter` locks, arrows aim, and a double-tap on the
form locks on touch. "new round" mid-round asks before it scraps your work.

Run it: `python3 -m http.server 8080` in this folder — zero build, zero deps.

Part of [Art Daily](https://artdaily.sadeali.com/) · more at [sadeali.com](https://sadeali.com/)

## What changed in the input-fairness pass

The shadow edge — the "terminator" the coaching lines lean on — is drawn
and labelled on the reveal, so the word is earned rather than assumed.
A live preview of the form under YOUR current light sits beside it while
you aim, which turns a blind guess into a visual match. The reveal waits
for an explicit "next" on the first two forms of a first round and holds
7s after that (it was a flat 4s), and the arc's "raking"/"frontal" labels
now read "from the side" / "from behind you".

## Input fairness
Hit zones go through `ArtDaily.startRadius()`: the azimuth ring reads ±34px
on a trackpad, ±54 on a finger and ±58 on a pen, the elevation arc ±44/±70/±75.
Widening them meant the ring's band can now overlap the form's double-tap
zone, so the hit test resolves by NEAREST target rather than by priority —
every control reports how far the press missed it and the smallest miss
inside its own band wins. (Under the old priority order a pen's widened ring
would have swallowed the form and killed the lock gesture outright.)
Scoring is untouched: `GRACE_DEG = 3`, `ZERO_SPAN = 42` on every device.


Scores are only ever compared against your own history, so the drill
eases its tolerances for the hardware in your hand and says which one it
eased for (the "scoring for…" chip in the HUD). A pen keeps the strict
reference; a mouse or trackpad, which pivots at the wrist and cannot
creep, gets roughly double the room; a finger sits between. Start and
grab zones move the other way — a screenless tablet needs the *biggest*
targets, because the hand is out of sight. Relative tolerances carry an
absolute pixel floor so a phone is never held to a stricter standard
than a desktop for the same drill.

