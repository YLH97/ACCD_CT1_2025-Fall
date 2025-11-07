let particles = []

function setup() {
  createCanvas(600, 600);
  colorMode(HSB, TWO_PI, 1, 1)
  
  for(let i = 0; i < 10; i++){
    particles.push(new Particle())
  }
}

function draw() {
  background(0,9);
  particles.forEach((Bob, i)=>{
    Bob.move()
    Bob.bounce()
    Bob.display()
  })
}

function mouseReleased() {
  particles.push(new Particle(mouseX, mouseY))
}
