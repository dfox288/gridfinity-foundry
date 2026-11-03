// The final light bin (2026-11-01): divider positions at the joints between cells only (one per cell
// boundary: a 2-wide bin takes one divider, a 3-wide two, a 1-wide none). At each joint the divider is held three ways:
// a groove down the middle of a short rib under the lip on the front and the back wall (2.4 deep, 10 tall; ),
// and a groove in a ridge on the floor's joint strip (a groove sunk into the floor does not fit: the baseplate's ridge
// sits 0.3 under the strip).
// With `flex` the bin also gets the flex-label groove (scad/flex_label.scad) in the front and side walls; the divider's
// top stays under the label.
//
// Light bin, measured on out/hex_light-2x1x6.stl (y inwards from the outer face, z up from the bin's bottom): inner wall
// face at y 1.21; the lip's bulge reaches y 2.63, so the divider's ends stay outside it (2.75) and it drops in from the
// top (the flex groove cuts the bulge away anyway). The joint strip on the floor is flat at 5.69, 4 wide, but only about 0.7 thick over the hollow between
// the base cells (the baseplate's ridge goes there), so the floor groove sits in a ridge built on top of it.
// Ribs end 6.5 below the lip top, the divider 5.6 below it: under the flex label (its groove floor at 5.25) and clear of
// the stacking line (3.74).
//
//   part = "bin":      the bin STL `bin` (cells_x x cells_y, `height` units) with ribs, floor ridges and (flex) the label groove
//   part = "divider":  a divider for a bin cells_y deep, `height` units; printed flat
//   openscad -D 'part="bin"' -D 'bin="out/hex_light-2x1x6.stl"' -D cells_x=2 -D height=6 -o final-2x1x6.stl rib_bin.scad
use <flex_label.scad>

part = "bin";
bin = "";
cells_x = 2;
cells_y = 1;
height = 6;
flex = true;         // cut the flex-label groove too
// Honeycomb per cell (2026-11-02: the ribs covered half hexes; filling them looked like a hex missing): with
// `pattern` the bin given is the plain solid light bin and the hex holes are cut here, the generator's own 1-cell panel
// (as on the side wall of a 1-deep hex bin) on every cell of every wall, so each joint gets a clear 12 mm lane for its
// rib. A half cell gets the middle column alone (the generator leaves a half-cell wall plain). Layouts measured on
// out/archive/light/hex_light-1x1x<h>.stl.
pattern = false;
joint_hex = false;   // also a hex column in the lane at each joint, as far as the rib leaves room (no, the plain lane)
tab = false;         // divider: its top up to the label's top, the end stop for a corner label (flex_label.scad
                     // tab = true; 2026-11-02: for wide bins already printed, which have no stops).
LABEL_TOP = 4.15; LABEL_IN = 16.2 + 0.5;   // flex label top below the lip top, its inner edge from the outer face (+0.5)
snap = false;        // snap groove for labels with a bead (scad/flex_label.scad; 2026-11-02: the plain labels fell out): on once tested
stops = false;       // leave a stop in the groove at each joint (corner labels, 2026-11-02): on once the test print holds

WALL = 1.21;
RIB_W = 4;           // rib width along the wall
RIB_Y = 3.65;        // rib face (from the outer face): 2.44 off the wall (slim and short). Deeper ribs (5.0,
                     //) with a 1.4 groove fused shut with the author's 0.6 nozzle; the divider holds well in these (2026-11-02)
RIB_H = 10;          // rib height, just under the lip
G_Y = 2.6;           // rib groove bottom
G_W = 1.5;           // groove width (divider + 0.3; 0.2 closes up with a 0.6 nozzle)
T = 1.2;             // divider thickness
END = 2.75;          // divider end (from the outer face): past the lip's bulge (2.63), 0.15 clear of the groove bottom
STRIP = 5.69;        // the floor's joint strip
RIDGE_W = 4.5; RIDGE_H = 1.6;   // floor ridge on the strip, its groove 1.4 deep
TOP = 7 * height + 3.74;
RIB_TOP = TOP - 6.5;
DIV_TOP = TOP - 5.6;
W = 42 * cells_x - 0.5; D = 42 * cells_y - 0.5;

function joints() = [for (j = [1 : 1 : cells_x - 1]) -21 * cells_x + 42 * j];

module rib() {
  // bottom 45 deg up from the wall (prints without support), top flat
  zb = RIB_TOP - RIB_H;
  difference() {
    hull() {
      translate([-RIB_W / 2, WALL - 0.3, zb]) cube([RIB_W, 0.01, RIB_H]);
      translate([-RIB_W / 2, RIB_Y - 0.01, zb + RIB_Y - WALL]) cube([RIB_W, 0.01, RIB_H - (RIB_Y - WALL)]);
    }
    translate([-G_W / 2, G_Y, 0]) cube([G_W, 10, TOP]);
    translate([0, RIB_Y, RIB_TOP]) rotate([45, 0, 0]) cube([G_W + 1, 1.2, 1.2], center = true);   // lead-in
  }
}

// the ridge along the joint strip, wall to wall, its groove in line with the rib grooves
module ridge() {
  difference() {
    translate([-RIDGE_W / 2, -D / 2 + WALL - 0.3, STRIP - 0.3]) cube([RIDGE_W, D - 2 * WALL + 0.6, RIDGE_H + 0.3]);
    translate([-G_W / 2, -D / 2, STRIP + 0.2]) cube([G_W, D, 10]);
  }
}

// per height: columns [x from the cell centre, row set], row set 0, row set 1 (z of the hole centres)
// 3, 6 and 9U as measured; taller bins continue the 6/9U rule (rows from 11.2 to 8.9 under the top, about 10.7 apart, the
// middle column between them), so the honeycomb reaches the top of any height
// (rows at least 9 apart; 4U has room for one row only, laid out as 3U)
function rows(h) = let(top = 7 * h - 8.9, n0 = round((top - 11.2) / 10.725) + 1, n = (top - 11.2) / max(n0 - 1, 1) < 9 ? n0 - 1 : n0)
  [for (i = [0 : n - 1]) 11.2 + i * (top - 11.2) / (n - 1)];
function layout(h) = h == 3 ? [[[-8.5, 0], [8.5, 0]], [11.65], []]
  : h == 4 ? [[[-8.5, 0], [8.5, 0]], [(11.2 + 7 * h - 8.9) / 2], []]
  : h == 6 ? [[[-10.5, 0], [0, 1], [10.5, 0]], [11.2, 22.15, 33.1], [16.675, 27.625]]
  : h == 9 ? [[[-10.5, 0], [0, 1], [10.5, 0]], [11.2, 21.92, 32.65, 43.375, 54.1], [16.56, 27.29, 38.01, 48.74]]
  : let(r = rows(h)) [[[-10.5, 0], [0, 1], [10.5, 0]], r, [for (i = [0 : len(r) - 2]) (r[i] + r[i + 1]) / 2]];

// Gridfinity Extended makes the wall thicker on tall bins (up to 1.6), so from 10U the holes go deeper (to 9U as before)
function wall_in(h) = WALL + (h <= 9 ? 0 : 0.75);
module hex_hole(x, z) { translate([x, -1, z]) rotate([-90, 0, 0]) cylinder(r = 4.5, h = wall_in(height) + 1.05, $fn = 6); }
// the holes for one wall `n` cells long (whole cells, then a half one), wall along x, its outer face at y 0
module wall_holes(n, z_max = 1000) {
  L = layout(height); full = floor(n); x0 = -21 * n;
  for (i = [0 : 1 : full - 1], c = L[0], z = L[1 + c[1]]) hex_hole(x0 + 21 + 42 * i + c[0], z);
  if (n > full) for (z = L[1]) hex_hole(x0 + 42 * full + 10.5, z);
  // the middle column's rows in the lane, under the rib (z_max: the top of the highest hole), not with the 3U layout
  if (joint_hex && len(L[2])) for (j = [1 : 1 : full - 1], z = L[2]) if (z + 3.9 <= z_max) hex_hole(x0 + 42 * j, z);
}
module pattern_holes() {
  translate([0, -D / 2, 0]) wall_holes(cells_x, RIB_TOP - RIB_H - 1);   // 1 mm of wall under the rib
  translate([0, D / 2, 0]) mirror([0, 1, 0]) wall_holes(cells_x, RIB_TOP - RIB_H - 1);
  translate([-W / 2, 0, 0]) rotate([0, 0, -90]) wall_holes(cells_y);
  translate([W / 2, 0, 0]) rotate([0, 0, 90]) wall_holes(cells_y);
}

module bin_final() {
  difference() {
    union() {
      difference() { import(bin); if (pattern) pattern_holes(); }
      for (x = joints()) translate([x, 0, 0]) {
        translate([0, -D / 2, 0]) rib();                     // front wall
        translate([0, D / 2, 0]) mirror([0, 1, 0]) rib();    // back wall
        ridge();
      }
    }
    if (flex) translate([0, 0, TOP]) groove(W, D, [1, 1, 1, 1], stops, snap);   // all round: the same on every wall, the label goes in front or back
  }
}

// divider: a plain plate, its foot in the floor groove, the ends in the rib grooves
module divider_outline() {
  zb = STRIP + 0.3;
  // with the tab the whole top is at the label's top: a level edge (2026-11-03, a step at the front only looked odd)
  top = tab ? TOP - LABEL_TOP : DIV_TOP;
  difference() {
    translate([END, zb]) square([D - 2 * END, top - zb]);
    translate([D / 2, top]) circle(r = 7, $fn = 48);   // finger notch to lift it out
  }
}

if (part == "bin") bin_final();
if (part == "divider") linear_extrude(T) translate([-D / 2, 0]) divider_outline();   // printed flat; y along the bin's depth
