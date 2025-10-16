let posX;
let posY;

let velX
let velY

let radius = 20


function setup() {
  createCanvas(600, 600);
  colorMode(RGB);
  posX = width * 0.5;
  posY = height * 0.5;

  velX = 2
  velY = 3

}

function draw() {
  posX = posX + velX
  posY += velY

  if ( posY + radius >= height || posY - radius<= 0) {
    velY = -1 * velY
  }
  if ( posX + radius >= width || posX - radius<= 0) {
    velX = -1 * velX
  }

  background(0, 0, 220);

  noStroke()

  fill(250, 0, 200)

  circle(posX, posY, radius * 2);
}