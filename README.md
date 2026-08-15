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
