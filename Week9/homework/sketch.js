let handPose;
let video;
let hands = [];
let painting;

let drawPX = 0;
let drawPY = 0;

let brushColor; 
let middleThumbWasPinched = false;

function preload() {
  handPose = ml5.handPose({ flipped: true });
}

function setup() {
  createCanvas(1080, 720);
  painting = createGraphics(1080, 720);
  video = createCapture(VIDEO);
  video.size(1080, 720);
  video.hide();

  handPose.detectStart(video, gotHands);

  brushColor = color(0, 255, 0);
}

function draw() {
  // 1. 先畫鏡像的攝影機畫面
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0);
  pop();

  // 2. 如果有偵測到手
  if (hands.length > 0) {
    // 找出左手、右手（假設 hand 裡有 handedness: "Left" / "Right"）
    let rightHand = hands.find(h => h.handedness === "Right");
    let leftHand  = hands.find(h => h.handedness === "Left");

    // 右手：畫線
    if (rightHand) {
      let index = rightHand.index_finger_tip;
      let thumb = rightHand.thumb_tip;
      let middle = rightHand.middle_finger_tip;   // ⭐ 中指指尖
    
      // ---- 右手畫線（食指 + 拇指）----
      let x = (index.x + thumb.x) / 2;
      let y = (index.y + thumb.y) / 2;
    
      let d = dist(index.x, index.y, thumb.x, thumb.y);
    
      if (d < 40) {               // 食指 + 拇指 pinch → 畫線
        painting.noErase();
        painting.stroke(brushColor);   // ⭐ 用變數的顏色
        painting.strokeWeight(15);
        painting.line(drawPX, drawPY, x, y);
      }
    
      drawPX = x;
      drawPY = y;
    
      // ---- 中指 + 拇指 pinch → 換畫筆顏色 ----
      if (middle && thumb) {
        let md = dist(middle.x, middle.y, thumb.x, thumb.y);
    
        // md < 30 表示中指指尖碰近拇指
        if (md < 20 && !middleThumbWasPinched) {
          // ⭐ 每次「剛開始碰到」時換一次顏色
          brushColor = color(random(255), random(255), random(255));
        }
    
        // 記錄這一幀的狀態，下一幀用來判斷「剛開始碰到」
        middleThumbWasPinched = (md < 20);
      }
    }

    // 左手：橡皮擦（透明畫筆）
    if (leftHand) {
      let lIndex = leftHand.index_finger_tip;
      let lThumb = leftHand.thumb_tip;
    
      let ld = dist(lIndex.x, lIndex.y, lThumb.x, lThumb.y);
    
      if (ld < 110) {  // pinch 啟動橡皮擦
        let ex = (lIndex.x + lThumb.x) / 2;
        let ey = (lIndex.y + lThumb.y) / 2;
    
        // 橡皮擦大小（直徑）
        let eSize = ld * 2;
        eSize = constrain(eSize, 20, 150);
    
        // 1. 在主畫布畫橡皮擦的外框
        noFill();
        stroke(0, 0, 0);
        strokeWeight(3);
        circle(ex, ey, eSize);
  
        // 2. 在 painting 畫布上真正擦除
        painting.erase();
        painting.circle(ex, ey, eSize);
        painting.noErase();
      }
    }    
  }

  // 3. 把 painting 這張「繪畫圖層」貼到主畫布上
  image(painting, 0, 0);
}

function gotHands(results) {
  hands = results;
}
