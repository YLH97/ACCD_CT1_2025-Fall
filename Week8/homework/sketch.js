let handPose;
let video;
let hands = [];

const THUMB_TIP = 4;
const INDEX_FINGER_TIP = 8;

const { Engine, Body, Bodies, Composite, Composites, Vector } = Matter;

let engine;
let bridge;

let num = 10;
let radius = 10;
let length = 25;

let circles = [];

function preload() {
  handPose = ml5.handPose({ maxHands: 1, flipped: true });
}

function setup() {
  createCanvas(640, 480);

  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  engine = Engine.create();
  bridge = new Bridge(num, radius, length);
}

function draw() {
  background(220);
  Engine.update(engine);
  image(video, 0, 0, width, height);


  if (random() < 0.1) {
    circles.push(new Circle());
  }

  for (let i = circles.length - 1; i >= 0; i--) {
    circles[i].checkDone();
    circles[i].display();

    if (circles[i].done) {
      circles[i].removeCircle();
      circles.splice(i, 1);
    }
  }

  if (hands.length > 0) {
    let thumb = hands[0].keypoints[THUMB_TIP];
    let index = hands[0].keypoints[INDEX_FINGER_TIP];

    fill(0, 255, 0);
    noStroke();
    circle(thumb.x, thumb.y, 10);
    circle(index.x, index.y, 10);

    bridge.bodies[0].position.x = thumb.x;
    bridge.bodies[0].position.y = thumb.y;

    bridge.bodies[bridge.bodies.length - 1].position.x = index.x;
    bridge.bodies[bridge.bodies.length - 1].position.y = index.y;

    bridge.display();
  }
}

function gotHands(results) {
  hands = results;
}

class Bridge {
  constructor(num, radius, length) {
    this.bodies = [];
    this.num = num;
    this.radius = radius;
    this.length = length;
    this.initialize();
  }

  initialize() {
    for (let i = 0; i < this.num; i++) {
      this.bodies[i] = Bodies.circle(0, 0, this.radius);
    }

    this.chains = Composite.create();
    Composite.add(this.chains, this.bodies);

    Composites.chain(this.chains, 0, 0, 0, 0, {
      stiffness: 1,
      length: this.length
    });

    Composite.add(engine.world, [this.chains]);
  }

  display() {
    noFill();
    stroke(0);
    strokeWeight(8);

    beginShape();
    for (let i = 0; i < this.bodies.length; i++) {
      let x = this.bodies[i].position.x;
      let y = this.bodies[i].position.y;
      curveVertex(x, y);
    }
    endShape();
  }
}

class Circle {
  constructor() {
    let x = width / 2;
    let y = 40;

    this.r = 10;
    this.c = color(random(255), random(255), random(255));
    this.done = false;

    this.body = Bodies.circle(x, y, this.r, { restitution: 0.6 });
    Body.setVelocity(this.body, Vector.create(random(-1, 1), random(-1, 1)));

    Composite.add(engine.world, this.body);
  }

  display() {
    fill(this.c);
    noStroke();
    ellipse(this.body.position.x, this.body.position.y, this.r * 2, this.r * 2);
  }

  checkDone() {
    this.done = this.body.position.y > height + this.r * 2;
  }

  removeCircle() {
    Composite.remove(engine.world, this.body);
  }
}
