// Flex label (idea from MakerWorld "Gridfinity Flex label", 2026-11-01): a groove in the inside of the lip, the
// label a 1 mm plate bent in and sprung into the groove on the front and both sides. Everything stays under the
// stacking line (a bin stacked on top reaches down to 3.74 below the lip top), so the bins still stack.
//
// Light bin lip (scad/label_clip.scad has the measurements; y inwards from the outer face, z down from the lip top):
// the groove takes the place of the lip's bulge. Back at y = 1.0 (1.0 of wall stays), ceiling 45 deg (prints without
// support), floor flat at -5.25 on the lip's lower chamfer (1.3 mm ledge). Label 1.0 thick from -5.15 to -4.15; the
// ceiling holds its edge from above for 0.8 mm (the opening above it is at y 1.985).
//
//   part = "bin":   the light bin STL `bin` with the groove cut (cells_x x cells_y, any height)
//   part = "label": the label for a bin cells_x wide, `depth` deep, rounded front corners to follow the groove
//
// Stops (2026-11-02: 1- and 2-wide labels in a corner of a wider bin): at every joint between cells the groove
// is left out for STOP_W on the front and the back wall, so the lip's bulge stands there (to y 2.63) and stops a short
// label sliding out of its corner. A label crossing a joint has a notch for the stop (full-width labels too; notched
// labels still fit bins without stops). Corner label: `corner = "left"` or "right", `cells_x` long, in a bin `bin_x`
// wide; its end sits STOP_W / 2 + clr short of the joint. Spring it in like the full-width one (bow it slightly).
//
// Snap (2026-11-02: the corner labels and even a 2-wide label in a 2-wide bin fell out: the 1 mm plate lies loose
// in the groove, nothing holds its edge in). With `snap` the groove floor is a trench at the back (y GB to TRENCH_Y, down
// to -5.3) and a ledge in front of it (the rest of the lip's bulge, top at -4.9); the label gets a bead `snap` high under
// its edge that drops into the trench. To come out the bead has to climb the ledge, and the groove's ceiling over the
// label's edge leaves it no room to: it clicks in and out by bending (interference about snap - 0.25). Plate 0.9, top at
// -4.0, under the stacking line (-3.74). Snap labels print upside down (face with the text on the bed, the bead up).
// DejaVu Sans: from the system fonts (fonts-dejavu in the OpenSCAD image)

part = "label";
bin = "";            // the light bin STL to cut (part = "bin")
cells_x = 1;
cells_y = 1;
top = 0;             // z of the bin's lip top (part = "bin"; 7 * height + 3.74)
depth = 15;          // label depth, from the groove at the front
thick = 1.0;
clr = 0.2;           // label edge to the groove's back
walls = [1, 1, 1];   // groove in the front, left, right wall (the label is held on these three)
corner = "none";     // label: "none" = full width of a cells_x bin; "left" / "right" = corner label cells_x long in a bin_x bin
bin_x = 0;           // corner label: the bin's width in cells (0 = cells_x + 1; only the corner's shape matters)
centre = true;       // corner label: centred on x for printing (false: where it sits in the bin, for checks)
fit = undef;         // label: press fit instead of clr: the ends reach fit / 2 past the groove's back (side walls, divider tab), so the
                     // bendy walls press on them (2026-11-02: the loose labels fell out of the bins already printed)
tab = false;         // corner label: ends at a divider's tab (scad/rib_bin.scad tab = true) instead of a stop
DIV_T = 1.2;         // divider thickness (scad/rib_bin.scad T)
snap = 0;            // label: bead height under the edge (0 = none; for bins with the snap groove)
snap_thick = 0.9;    // snap label plate (1.0 touches the lip at the bin's corners by 0.05)
txt = "";
txt_size = 6;
txt_depth = 0.4;

$fn = 48;
R = 3.75;
GB = 1.0;                       // groove back
G_TOP = -4.05; G_FLOOR = -5.25; // groove flat back from G_TOP to G_FLOOR
STOP_W = 2.0;                   // stop at each joint: the groove is left out this wide
BULGE_Y = 2.63;                 // the lip's bulge (left standing at a stop)
TRENCH_Y = 1.95; SNAP_FLOOR = -5.3; SNAP_LEDGE = -4.9;   // snap groove: trench to TRENCH_Y, the ledge in front of it
BEAD_W = 0.65;                  // snap label: bead width from the edge (0.15 clear of the trench at the front)
W = 42 * cells_x - 0.5; D = 42 * cells_y - 0.5;

// W, D passed in so scad/rib_bin.scad can `use` the groove for its final bin
module outline(W = W, D = D) { offset(r = R) offset(delta = -R) square([W, D], center = true); }
module inset(y, W = W, D = D) { if (y <= 0) outline(W, D); else offset(r = -y) outline(W, D); }
module band(ya, yb, W = W, D = D) { difference() { inset(ya, W, D); inset(yb, W, D); } }
module slab(z0, z1) { translate([0, 0, z0 - 0.002]) linear_extrude(z1 - z0 + 0.004) children(); }
// the walls that get the groove: front (-y), left (-x), right (+x), optional back (+y); without the back it stops short of the back corners
module wall_zone(W = W, D = D, walls = walls) {
  intersection() {
    square([W + 2, D + 2], center = true);
    union() {
      if (walls[0]) translate([-W / 2 - 1, -D / 2 - 1]) square([W + 2, D / 2 + 1]);
      if (walls[1]) translate([-W / 2 - 1, -D / 2 - 1]) square([W / 2 + 1, D + 2 - 2 * R - 2]);
      if (walls[2]) translate([0, -D / 2 - 1]) square([W / 2 + 1, D + 2 - 2 * R - 2]);
      if (len(walls) > 3 && walls[3]) translate([-W / 2 - 1, 0]) square([W + 2, D / 2 + 1]);   // back: all four, the groove runs round
    }
  }
}

// joints between cells for a bin outline W wide (x positions)
function joints(W) = let(n = round((W + 0.5) / 42 * 2) / 2) [for (j = [1 : 1 : n - 1]) -W / 2 - 0.25 + 42 * j];

module groove(W = W, D = D, walls = walls, stops = false, snap = false) {
  difference() {
    intersection() {
      union() {
        slab(snap ? SNAP_LEDGE : G_FLOOR, G_TOP) band(GB, 4, W, D);               // the flat back and the floor
        if (snap) slab(SNAP_FLOOR, SNAP_LEDGE) band(GB, TRENCH_Y, W, D);          // the trench for the label's bead
        for (z = [G_TOP : 0.1 : -2.5]) slab(z, z + 0.1) band(GB + (z - G_TOP), 4, W, D);   // 45 deg ceiling
      }
      translate([0, 0, -10]) linear_extrude(20) wall_zone(W, D, walls);
    }
    if (stops) for (x = joints(W), s = [-1, 1])   // front and back wall: the bulge stays (it is air past BULGE_Y anyway)
      translate([x - STOP_W / 2, s < 0 ? -D / 2 - 1 : D / 2 - BULGE_Y, -10]) cube([STOP_W, BULGE_Y + 1, 20]);
  }
}

module label() {
  e = GB + clr;   // the label's edge from the outer face
  BX = corner == "none" ? cells_x : (bin_x > 0 ? bin_x : cells_x + 1);
  BW = 42 * BX - 0.5;
  es = is_undef(fit) ? e : GB - fit / 2;                          // the ends (and corners) from the outer face; the front edge stays at e
  x0 = -BW / 2 - 1;                                               // (the outline ends it)
  j1 = -BW / 2 + 42 * cells_x - 0.25;                             // the joint a corner label ends at
  x1 = corner == "none" ? BW / 2 : tab ? j1 - DIV_T / 2 + (is_undef(fit) ? -clr : fit / 2) : j1 - STOP_W / 2 - clr;
  notch = [for (x = joints(BW)) if (x < x1 - 1) x];
  cx = (-BW / 2 + es + x1) / 2;
  mirror([corner == "right" ? 1 : 0, 0, 0]) translate([corner == "none" || !centre ? 0 : -cx, 0, 0]) difference() {
    for (z = snap > 0 ? [[0, snap_thick, 0], [-snap, 0, BEAD_W]] : [[0, thick, 0]]) translate([0, 0, z[0]]) linear_extrude(z[1] - z[0]) difference() {
      intersection() {
        union() {   // fit: the ends press on the straight wall only (the groove's back is up to 0.13 further in round the corners)
          inset(e, BW, D);
          intersection() { inset(es, BW, D); translate([-BW, -D / 2 + R + 0.5]) square([2 * BW, D]); }
        }
        translate([x0, -D / 2 + e]) square([x1 - x0, depth]);
      }
      if (z[2] > 0) inset(e + z[2], BW, D);   // the bead: a band along the edge
      for (x = notch) translate([x - STOP_W / 2 - clr, -D / 2]) square([STOP_W + 2 * clr, BULGE_Y + clr]);
    }
    if (txt != "") translate([cx, -D / 2 + e + depth / 2, (snap > 0 ? snap_thick : thick) - txt_depth]) linear_extrude(txt_depth + 0.01)
      mirror([corner == "right" ? 1 : 0, 0, 0]) text(txt, size = txt_size, font = "DejaVu Sans", halign = "center", valign = "center");
  }
}

if (part == "bin") difference() { import(bin); translate([0, 0, top]) groove(); }
if (part == "label") { if (snap > 0) rotate([180, 0, 0]) translate([0, 0, -snap_thick]) label(); else label(); }
