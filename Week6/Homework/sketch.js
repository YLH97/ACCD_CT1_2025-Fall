let pets = [];
let foods = [];

function setup() {
  createCanvas(800, 600);

  for (let i = 0; i < 10; i++) {
    pets.push(new Pet(random(width), random(height)));
  }
}

function draw() {
  background(20);

  for (let i = foods.length - 1; i >= 0; i--) {
    foods[i].show();
    if (foods[i].eaten) foods.splice(i, 1);
  }

  for (let p of pets) {
    p.move();
    p.chase(foods);
    p.eat(foods);   
    p.show();
  }
}

function mousePressed() {
  foods.push(new Food(mouseX, mouseY));
}

class Pet {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    this.vx = random(-2, 2);
    this.vy = random(-2, 2);

    this.size = 18;
  }

 move() {
 
  this.vx += random(-0.04, 0.04);
  this.vy += random(-0.04, 0.04);

  this.x += this.vx;
  this.y += this.vy;

 
  let maxSpeed = 0.8;
  this.vx = constrain(this.vx, -maxSpeed, maxSpeed);
  this.vy = constrain(this.vy, -maxSpeed, maxSpeed);

  
  if (this.x < 0 || this.x > width) this.vx *= -1;
  if (this.y < 0 || this.y > height) this.vy *= -1;
}

  chase(foods) {
    let closest = null;
    let closestDist = 99999;

    for (let f of foods) {
      if (f.eaten) continue;

      let d = dist(this.x, this.y, f.x, f.y);
      if (d < closestDist) {
        closestDist = d;
        closest = f;
      }
    }

    if (closest) {
      let dx = closest.x - this.x;
      let dy = closest.y - this.y;

      this.vx += dx * 0.0005;
      this.vy += dy * 0.0005;
    }
  }

  eat(foods) {
    for (let f of foods) {
      if (f.eaten) continue;

      let d = dist(this.x, this.y, f.x, f.y);
      if (d < this.size / 2 + f.size / 2) {
        f.eaten = true;
        this.size += 3;
      }
    }
  }

  show() {
    noStroke();
    fill(180, 200, 255);
    rectMode(CENTER);
    rect(this.x, this.y, this.size, this.size);
  }
}

class Food {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 12;
    this.eaten = false;
  }

  show() {
    noStroke();
    fill(255, 120, 120);
    ellipse(this.x, this.y, this.size);
  }
}