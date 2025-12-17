let t = 0.0

let sizes = []
let colors = []

let startTime = 0
let delayMs = 4000

function setup() {
  let c = createCanvas(800, 600)
  c.parent("sketch-holder");
  angleMode(RADIANS)
  colorMode(HSB, PI, 1, 1)

  sizes[0] = 480
  sizes[1] = 360
  sizes[2] = 345
  sizes[3] = 260
  sizes[4] = 160
  sizes[5] = 100

  for (let i = 5; i >= 0; i--) {
    colors[i] = color((PI / 6) * i, 0.5, 0.9)
  }

  rectMode(CENTER)
  startTime = millis()
}

function draw() {
  background(0.2)

  let cx = width / 2
  let cy = height / 2

  // time interval control
  let elapsed = millis() - startTime
  let colorActivated = elapsed > delayMs

  push()
  translate(cx, cy)

  for (let i = 0; i < sizes.length; i++) {

    // repeated motion with trig + de-sync
    let speed = 1.0 + i * 0.15
    let phase = i * 0.7
    let layerAngle = sin(t * speed + phase) * 0.6

    // delayed color modulation
    let hueValue
    if (colorActivated) {
      // hue oscillates after delay
      hueValue = (PI / 6) * i + sin(t * 0.8 + i) * 0.4
    } else {
      // static color before delay
      hueValue = (PI / 6) * i
    }

    fill(hueValue, 0.5, 0.9)

    push()
    rotate(layerAngle)
    rect(0, 0, sizes[i], sizes[i])
    pop()
  }

  pop()

  t += 0.03
}
