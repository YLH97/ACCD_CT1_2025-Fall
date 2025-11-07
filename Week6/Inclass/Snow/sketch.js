const particles = [];
const PPF = 5; // particles per frame

let gravity;

function setup() {
  createCanvas(800, 600);
  colorMode(HSB, TWO_PI, 1, 1);

  gravity = createVector(0, 0.01);
}

function draw() {
  background(0);

  for (let i = 0; i < PPF; i++) {
    particles.push(new Particle(random(width), 0));
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.applyforce(gravity);
    p.move();

    if (!p.inBounce()) {
      particles.splice(i, 1);
      continue;
    }

    p.display();
  }
}
