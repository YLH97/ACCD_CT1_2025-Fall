let fishes = [];
let foods = [];

function setup() {
  let canvas = createCanvas(600, 400);
  canvas.parent('canvas-container');
  for (let i = 0; i < 5; i++) {
    fishes.push(new Fish(random(width), random(height)));
  }
}

function draw() {
  background(100, 180, 255);

  for (let food of foods) {
    food.display();
  }

  for (let fish of fishes) {
    fish.move();
    fish.checkFood(foods);
    fish.display();
  }

  foods = foods.filter(food => !food.eaten);
}

function mousePressed() {
  foods.push(new Food(mouseX, mouseY));
}

class Fish {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(1.2);
    this.size = 20;
  }

  move() {
    this.pos.add(this.vel);
    // bounce off walls
    if (this.pos.x < 0 || this.pos.x > width) this.vel.x *= -1;
    if (this.pos.y < 0 || this.pos.y > height) this.vel.y *= -1;
  }

  checkFood(foodArray) {
    for (let food of foodArray) {
      let d = dist(this.pos.x, this.pos.y, food.pos.x, food.pos.y);
      if (d < this.size / 2 + food.size / 2) {
      
        this.size += 3;     
        food.eaten = true;   
      }
    }
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    noStroke();
    fill(255, 150, 50);
    triangle(-this.size / 2, -this.size / 3,
             -this.size / 2,  this.size / 3,
              this.size / 2,  0);
    pop();
  }
}

class Food {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.size = 8;
    this.eaten = false;
  }

  display() {
    fill(255, 230, 100);
    noStroke();
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}
