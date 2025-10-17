let posX, posY, velX, velY;
let diameter = 60;
let yellow, bgColor;
let mySound, amp;

function preload() {
  mySound = loadSound("JBS.mp3");
}

function setup() {
  createCanvas(800, 600);

  yellow = color(255, 204, 0);
  bgColor = color(0,5);
  noStroke();

  posX = width / 2;
  posY = height / 2;

  velX = random(-5, 5);
  velY = random(-5, 5);

  amp = new p5.Amplitude();

  mySound.loop();
}

function draw() {
  background(bgColor);
  fill(yellow);

  let level = amp.getLevel();

  let speed = map(level, 0, 0.3, 1, 10);

  posX += random(-speed, speed);
  posY += random(-speed, speed);

  let size = diameter + level * 500;
  circle(posX, posY, size);

  if (posX + diameter/2 >= width || posX - size/2 <= 0) {
    posX = constrain(posX, size/2, width - size/2);
    velX *= -1;
  }
  if (posY + diameter/2 >= height || posY - size/2 <= 0) {
    posY = constrain(posY, size/2, height - size/2);
    velY *= -1;
  }
}


/*let posX, posY, velX, velY;
let diameter = 60;
let yellow, bgColor;
let mySound, amp;

function preload() {
  // Use your local file:
  mySound = loadSound('JBS.mp3');

  // Or use a hosted example (no download):
  // mySound = loadSound('https://p5js.org/assets/learn/beat.mp3');
}

function setup() {
  createCanvas(800, 600);

  yellow = color(255, 204, 0);
  bgColor = color(0, 5);   // black with slight alpha for trails
  noStroke();

  // Start in the middle
  posX = width / 2;
  posY = height / 2;

  // Initial velocity
  velX = random(-3, 3);
  velY = random(-3, 3);

  // Amplitude analyzer
  amp = new p5.Amplitude();

  // Try to start sound; many browsers still require a click
  mySound.loop();
}

function draw() {
  background(bgColor);
  fill(yellow);

  // Current loudness (0.0 ~ about 0.3 typical)
  const level = amp.getLevel();

  // Convert volume to a jitter force (how much the velocity wiggles)
  const jitter = map(level, 0, 0.3, 0.02, 0.6);

  // Add small random acceleration to velocity based on loudness
  velX += random(-jitter, jitter);
  velY += random(-jitter, jitter);

  // (Optional) cap max speed so it doesn't shoot off
  const maxSpeed = 8;
  velX = constrain(velX, -maxSpeed, maxSpeed);
  velY = constrain(velY, -maxSpeed, maxSpeed);

  // Integrate velocity → position
  posX += velX;
  posY += velY;

  // Size also reacts to volume
  const size = diameter + level * 500;

  // Bounce off edges (use sound-reactive radius)
  const r = size / 2;

  if (posX + r >= width) {
    posX = width - r;
    velX *= -1;
  } else if (posX - r <= 0) {
    posX = r;
    velX *= -1;
  }

  if (posY + r >= height) {
    posY = height - r;
    velY *= -1;
  } else if (posY - r <= 0) {
    posY = r;
    velY *= -1;
  }

  // Draw
  circle(posX, posY, size);
}

// Many browsers block autoplay. Click to enable audio.
function mousePressed() {
  if (getAudioContext().state !== 'running') {
    userStartAudio();
  }
  if (!mySound.isPlaying()) {
    mySound.loop();
  }
}*/
