let thiscanvas 

let posX = []
let posY = []
let size = []
let numStars = 500

function setup() {
  createCanvas(1000, 700);
  colorMode(HSB, 360, 100, 100);

  for(let i = 0; i < 500; i++) {
    posX.push(random(width))
    posY[i] = random(height)
    size.push(random(2, 20))
  }
  
  frameRate(2)
}

function draw() {
  background(0, 0, 0);
  fill(0, 0, 100)
  for (let i = 0; i < numStars; i++) {
    circle(posX[i], posY[i], random(size[i], size[i] + 1))
  }
  
  for (let i = 0; i < 500; i++) {
    noStroke()
    circle(posX[i], posY[i], 5)
  }
}

/*
function setup() {
  createCanvas(500, 500);
  colorMode(HSB, 360, 100, 100);
  
  frameRate(2)
}

function draw() {
  background(0, 0, 0);
  
  for (let i = 0; i < 1000; i++) {
    noStroke()
    fill(random(360), 80, 100)
    circle(random(width), random(height), 5);
  }
}
*/