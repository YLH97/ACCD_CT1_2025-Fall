let video;
let handposeModel;
let predictions = [];

const BALL_RADIUS = 12;
const PADDLE_WIDTH = 140;
const PADDLE_HEIGHT = 18;

let paddleX;
let paddleY;
let paddleTargetX;
let paddleTargetY;

let ball;
let score = 0;
let lives = 3;

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  paddleX = width / 2;
  paddleY = height - 40;
  paddleTargetX = paddleX;
  paddleTargetY = paddleY;

  initBall();

  handposeModel = ml5.handpose(video, () => {
    console.log('Handpose model ready');
  });
  handposeModel.on('predict', (results) => {
    predictions = results;
  });
}

function draw() {
  background(20);

  // draw mirrored webcam feed
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  updatePaddle();
  updateBall();
  drawBall();
  drawPaddle();
  drawScore();
  drawHandOverlay();

  if (lives <= 0) {
    showGameOver();
    noLoop();
  }
}

function updatePaddle() {
  if (predictions.length > 0 && video.width > 0 && video.height > 0) {
    const hand = predictions[0];
    // landmark 9 ~ base of middle finger, stable for paddle positioning
    const [rawX, rawY] = hand.landmarks[9];
    const canvasX = map(rawX, 0, video.width, 0, width);
    const canvasY = map(rawY, 0, video.height, 0, height);
    paddleTargetX = constrain(width - canvasX, PADDLE_WIDTH / 2, width - PADDLE_WIDTH / 2);
    paddleTargetY = constrain(canvasY + 30, height / 2, height - 20);
  } else {
    // default paddle position when no hand detected
    paddleTargetX = width / 2;
    paddleTargetY = height - 30;
  }

  paddleX = lerp(paddleX, paddleTargetX, 0.35);
  paddleY = lerp(paddleY, paddleTargetY, 0.2);
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x < BALL_RADIUS || ball.x > width - BALL_RADIUS) {
    ball.vx *= -1;
    ball.x = constrain(ball.x, BALL_RADIUS, width - BALL_RADIUS);
  }

  if (ball.y < BALL_RADIUS) {
    ball.vy *= -1;
    ball.y = BALL_RADIUS;
  }

  const withinPaddleWidth = ball.x > paddleX - PADDLE_WIDTH / 2 && ball.x < paddleX + PADDLE_WIDTH / 2;
  const hittingPaddle = ball.y + BALL_RADIUS >= paddleY - PADDLE_HEIGHT / 2 && ball.y - BALL_RADIUS <= paddleY + PADDLE_HEIGHT / 2;

  if (withinPaddleWidth && hittingPaddle && ball.vy > 0) {
    ball.vy *= -1;
    ball.y = paddleY - PADDLE_HEIGHT / 2 - BALL_RADIUS;
    score += 1;
    // change horizontal speed slightly for variety
    ball.vx += random(-0.3, 0.3);
    ball.vx = constrain(ball.vx, -6, 6);
    ball.vy = constrain(ball.vy * 1.05, 3, 8);
  }

  if (ball.y > height + BALL_RADIUS) {
    lives -= 1;
    initBall();
  }
}

function drawBall() {
  fill(255, 200, 0);
  noStroke();
  circle(ball.x, ball.y, BALL_RADIUS * 2);
}

function drawPaddle() {
  fill(0, 220, 255, 180);
  rectMode(CENTER);
  noStroke();
  rect(paddleX, paddleY, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
}

function drawScore() {
  fill(255);
  textSize(18);
  textAlign(LEFT, TOP);
  text(`Score: ${score}`, 12, 10);
  text(`Lives: ${lives}`, 12, 32);
}

function drawHandOverlay() {
  if (predictions.length === 0) return;

  predictions[0].landmarks.forEach(([x, y]) => {
    const mirroredX = width - map(x, 0, video.width, 0, width);
    const mappedY = map(y, 0, video.height, 0, height);
    fill(0, 255, 120, 160);
    noStroke();
    circle(mirroredX, mappedY, 8);
  });
}

function showGameOver() {
  fill(0, 180);
  rect(0, 0, width, height);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text('Game Over\nRefresh to play again', width / 2, height / 2);
}

function initBall() {
  const direction = random([ -1, 1 ]);
  ball = {
    x: width / 2,
    y: height / 2,
    vx: direction * random(3, 4.5),
    vy: random(3, 5)
  };
}
