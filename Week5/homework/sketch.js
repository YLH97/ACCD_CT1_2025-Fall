let angle = 0.0
let sizes = []
let colors = []

function setup() {
  createCanvas(800, 600);
  colorMode(HSB, PI, 1, 1);
  sizes[0] = 480;
  sizes[1] = 360;
  sizes[2] = 345;
  sizes[3] = 260;
  sizes[4] = 160;
  sizes[5] = 100;

  for (let i = 5; i >= 0; i--) {
    colors[i] = color(PI / 6 * i, 0.5, 0.9);
  }

  rectMode(CENTER);
}

function draw() {
  background(0.2);

  push();
  translate(width / 2, height / 2);

  for (let i = 0; i < sizes.length; i++) {
    fill(colors[i]);
    rotate(angle);
    rect(0, 0, sizes[i], sizes[i]);
  }

  pop();
  angle = angle + 0.01;
}



