let handPose;
let video;
let hands = [];

const THUMB_TIP = 4;
const INDEX_FINGER_TIP = 8;

const { Engine, Body, Bodies, Composite, Composites, Vector } = Matter;

let engine;

let num = 10;
let radius = 10;
let length = 25;

let circles = [];

let basket;
let score = 0;

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
  plank = new Plank();

  basket = new Basket();
}

function draw() {
  background(220);
  Engine.update(engine);
  image(video, 0, 0, width, height);

  basket.update();
  basket.display();

  if (random() < 0.1) {
    circles.push(new Circle());
  }

  for (let i = circles.length - 1; i >= 0; i--) {
    circles[i].checkDone();

    circles[i].checkScore(basket);

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

  plank.updateFromHands(thumb, index);
  plank.display();
  }

  drawScore();
}

function drawScore() {
  push();
  textAlign(CENTER, TOP);
  textSize(28);
  fill(0);
  noStroke();
  text(score, width / 2, 10);
  pop();
}

function gotHands(results) {
  hands = results;
}

class Plank {
  constructor() {
    this.baseW = 200;
    this.h = 20;

    // physics body
    this.body = Bodies.rectangle(
      width / 2,
      height / 2,
      this.baseW,
      this.h,
      {
        restitution: 0.4,
        friction: 0.2,
        density: 0.005
      }
    );

    Composite.add(engine.world, this.body);

    this.prevX = width / 2;
    this.prevY = height / 2;
    this.prevA = 0;
    this.currentScale = 1;
  }

  updateFromHands(thumb, index) {
    let mx = (thumb.x + index.x) / 2;
    let my = (thumb.y + index.y) / 2;
    let angle = atan2(index.y - thumb.y, index.x - thumb.x);
    let d = dist(thumb.x, thumb.y, index.x, index.y);

    let targetW = constrain(d, 60, 300);
    let targetScale = targetW / this.baseW;

    let scaleFactor = targetScale / this.currentScale;
    scaleFactor = constrain(scaleFactor, 0.92, 1.08);

    Body.scale(this.body, scaleFactor, 1);
    this.currentScale *= scaleFactor;

    let vx = mx - this.prevX;
    let vy = my - this.prevY;

    let va = angle - this.prevA;
    if (va > PI) va -= TWO_PI;
    if (va < -PI) va += TWO_PI;

    Body.setPosition(this.body, { x: mx, y: my });
    Body.setAngle(this.body, angle);
    Body.setVelocity(this.body, { x: vx, y: vy });
    Body.setAngularVelocity(this.body, va);

    this.prevX = mx;
    this.prevY = my;
    this.prevA = angle;
  }

  display() {
    let pos = this.body.position;
    let angle = this.body.angle;

    push();
    translate(pos.x, pos.y);
    rotate(angle);
    rectMode(CENTER);
    noStroke();
    fill(80);

    // draw using current scale
    rect(0, 0, this.baseW * this.currentScale, this.h);
    pop();
  }
}

class Circle {
  constructor() {
    let x = width * 0.2;
    let y = 40;

    this.r = 10;
    this.c = color(random(255), random(255), random(255));
    this.done = false;

    this.scored = false;

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

  checkScore(basketObj) {
    if (this.scored) return;

    const x = this.body.position.x;
    const y = this.body.position.y;

    const left = basketObj.x - basketObj.w / 2;
    const right = basketObj.x + basketObj.w / 2;
    const top = basketObj.y - basketObj.h / 2;
    const bottom = basketObj.y + basketObj.h / 2;

    if (x > left + this.r && x < right - this.r && y > top + this.r && y < bottom - this.r) {
      this.scored = true;
      score += 1;

      this.done = true;
    }
  }

  removeCircle() {
    Composite.remove(engine.world, this.body);
  }
}

class Basket {
  constructor() {
    this.w = 140;
    this.h = 80;
    this.thickness = 12;

    this.x = width * 0.85;
    this.y = height - 90;

    this.leftWall = Bodies.rectangle(
      this.x - this.w / 2,
      this.y,
      this.thickness,
      this.h,
      { isStatic: true }
    );

    this.rightWall = Bodies.rectangle(
      this.x + this.w / 2,
      this.y,
      this.thickness,
      this.h,
      { isStatic: true }
    );

    this.bottom = Bodies.rectangle(
      this.x,
      this.y + this.h / 2,
      this.w + this.thickness,
      this.thickness,
      { isStatic: true }
    );

    Composite.add(engine.world, [
      this.leftWall,
      this.rightWall,
      this.bottom
    ]);
  }

  update() {
    Body.setPosition(this.leftWall, {
      x: this.x - this.w / 2,
      y: this.y
    });
    Body.setPosition(this.rightWall, {
      x: this.x + this.w / 2,
      y: this.y
    });
    Body.setPosition(this.bottom, {
      x: this.x,
      y: this.y + this.h / 2
    });

    Body.setVelocity(this.leftWall, { x: 0, y: 0 });
    Body.setVelocity(this.rightWall, { x: 0, y: 0 });
    Body.setVelocity(this.bottom, { x: 0, y: 0 });
  }

  display() {
    push();
    noFill();
    stroke(0);
    strokeWeight(3);

    rectMode(CENTER);
    rect(this.x, this.y, this.w, this.h);

    strokeWeight(6);
    line(
      this.x - this.w / 2,
      this.y - this.h / 2,
      this.x - this.w / 2,
      this.y + this.h / 2
    );
    line(
      this.x + this.w / 2,
      this.y - this.h / 2,
      this.x + this.w / 2,
      this.y + this.h / 2
    );
    line(
      this.x - this.w / 2,
      this.y + this.h / 2,
      this.x + this.w / 2,
      this.y + this.h / 2
    );

    pop();
  }
}