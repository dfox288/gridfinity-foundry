// Lip plug label for light bins without the flex groove (2026-11-02; after the MakerWorld "Gridfinity Snap-In
// Label", which fits our lip to 0.05 mm): a solid block in the front of the lip, from side wall to side wall, its front
// following the lip's inner face down to the bulge, so it sits on the bulge's 45 deg shoulder and cannot drop in; its
// ends press on the side walls' lip by fit / 2 each (the bendy walls hold it). It fills the stacking zone: nothing
// stacks on a bin with a plug. Labels the full width, so for 1- and 2-wide bins.
//
// Lip (scad/label_clip.scad; y inwards from the outer face, z down from the lip top): 0.69 at the top, 45 deg to 1.91
// at -1.22, vertical to -2.99, 45 deg to the bulge 2.63 at -3.71, vertical to -4.94, then back to the wall underneath.
//
// Printed upside down: the top face (text cut into it) on the bed.
//   openscad -D cells=1 -D fit=0.2 -o lip-plug-1.stl lip_plug.scad
// DejaVu Sans: from the system fonts (fonts-dejavu in the OpenSCAD image)

cells = 1;           // bin width in cells
fit = 0.2;           // press fit at the side walls (total)
clr = 0.08;          // gap to the front wall's lip
depth = 15.3;        // inner edge from the outer face
top = -0.55;         // top face below the lip top
bottom = -6.0;       // body bottom (inside the bulge)
txt = "";
txt_size = 6;
txt_depth = 0.4;
EF = 0.3;            // bed edge chamfer
print = true;

$fn = 48;
R = 3.75;
DZ = 0.1;
BW0 = 42 * cells - 0.5; BD = 42 - 0.5;
BW = BW0 + fit;      // follow the lip of a bin this much wider: the ends press by fit / 2

module outline() { offset(r = R) offset(delta = -R) square([BW, BD], center = true); }
module outline0() { offset(r = R) offset(delta = -R) square([BW0, BD], center = true); }
// the lip's inner face at depth z, plus clr; under the bulge the body steps in to 3.75 and chamfers to the bottom
function lip(z) = z >= -1.22 ? 0.69 - z : z >= -2.99 ? 1.91 : z >= -3.71 ? 1.91 + (-2.99 - z) : 2.63;
function yf(z) = z >= -4.96 ? lip(z) + clr : 3.75 + (-4.96 - z);

// the bed edge (top face) chamfered by EF against elephant foot
function ye(z) = yf(z) + max(0, EF - (top - z));
// press only on the straight side walls: the bin's corners do not give (2026-11-03: the 2-wide fit 0.2 would not go in)
module slice(z) {
  intersection() {
    union() {
      offset(r = -ye(z)) outline0();
      intersection() { offset(r = -ye(z)) outline(); translate([-BW, -BD / 2 + R + 0.5]) square([2 * BW, BD]); }
    }
    translate([-BW0, -BD / 2]) square([2 * BW0, depth]);
  }
}

module plug() {
  difference() {
    for (z = [bottom : DZ : top - DZ / 2]) translate([0, 0, z]) linear_extrude(DZ + 0.002) slice(z + DZ / 2);
    // the lip is flat at the top over each joint (7.6 wide, to 1.91 at -1.1 to -0.5): a notch there
    for (j = [1 : 1 : cells - 1]) translate([-BW0 / 2 - 0.25 + 42 * j - 4.2, -BD / 2 - 1, -1.35]) cube([8.4, 1 + 1.91 + clr + 0.1, 2]);
    if (txt != "") translate([0, -BD / 2 + (yf(top) + depth) / 2, top - txt_depth]) linear_extrude(txt_depth + 0.01)
      text(txt, size = txt_size, font = "DejaVu Sans", halign = "center", valign = "center");
  }
}

if (print == true) rotate([180, 0, 0]) translate([0, 0, -top]) plug(); else if (print == false) plug();   // print = false: seated, z 0 at the lip top
