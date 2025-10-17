let x, y;
let diameter = 80
let r = diameter / 2;
let imglebu, imagelebubu, currentimage
let countDown = 0
let bgm;

function preload() {
  imglebu = loadImage('lebubu.png');
  imagelebubu = loadImage('lebu.png');
  
  bgm = loadSound('You Are My Sunshine.mp3');
}

function setup() {
  createCanvas(600, 600);

  x = width / 2;
  y = height / 2;

  currentimage = imglebu;
}

function mousePressed() {
  if (!bgm?.isPlaying()) {
    bgm.loop();
  }
}

function draw() {
  background(0, 5);
  fill(255);
  noStroke();
  
  ellipse(x, y, 130, 130);
  image(currentimage, x - r, y - r, diameter, diameter);

  x += random(-25, 25);
  y += random(-25, 25);

if (x + r > width) {
  x = width - (x + r - width) - r;
  currentimage = imagelebubu;
  countDown = 16
}
if (x - r < 0) {
  x = r - (x - r);
  currentimage = imagelebubu;
  countDown = 16
} 
if (y + r > height) {
  y = height - (y + r - height) - r;
  currentimage = imagelebubu;
  countDown = 16
}
if (y - r < 0){
  y = r - (y - r);
  currentimage = imagelebubu;
  countDown = 16
}
if (countDown > 0) {
  countDown--;
}
else {
  currentimage = imglebu;
}
}