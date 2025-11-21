let hadnpose
let video

let hands = []
let indexTip, thumbTip


function preload() {
  handPose = ml5.handPose({flipped:true});
}

function setup() {
  createCanvas(640, 480);
  
  video = createCapture(VIDEO, {flipped:true});
  video.size(640, 480);
  video.hide();

  rectMode(CORNERS)
  paddle = (
    x1 = 0,
    y1 = 0,
    x2 = 0,
    y2 = 0,
  )

  
  handPose.detectStart(video, gotHands);
}

function draw() {
  background(220);
  
  image(video, 0, 0, 640, 480)
  
  pong.pos.add(pong.vel)
  if(pong.pos.x - pong.radius <=0){
    
  }
  
  if(hands.length > 0){
    fill(0, 0, 255)
    rect(paddel.x1, paddel.y1, paddel.x2, paddel.y2 )
    
    if(
      pong.pos.x + 
    
     circle(thumbTip.x, thumbTip.y, 10)
     circle(indexTip.x, indexTip.y, 10)
  }
  
}

function gotHands(results){
  console.log(results)
  hands = results
  if(hands.length > 0){
    
     thumbTip = hands[0].thumb_tip
     paddle.x1 = thumbTip.x
     paddle.y1 = thumbTip.y
    
     indexTip = hands[0].index_finger_tip
     paddle.x1 = indexTip.x
     paddle.y1 = indexTip.y
  }
}