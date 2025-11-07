class Particle {
    constructor(_x,_y){
        this.pos = createVector(_x,_y)
        this.vel = createVector(random(-3, 3), random(-4, 4))
        this.acc = createVector(0, 0)

        this.radius = random(2, 4)
        this.clr = color(random(TWO_PI), 0.9, 0.9)
    }

    move(){
        this.vel.add(this.acc)
        this.pos.add(this.vel)
        this.acc.mult(0)
    }

    applyforce(_force){
        this.acc.add(_force)
        this.acc.limit(3)
    }

    inBounce(){
        if(
            this.pos.x - this.radius < 0 ||
            this.pos.x + this.radius > width ||
            this.pos.y + this.radius > height
        ){
            return false
        }
        else {
            return true
        }
    }

    bounce(){
        if (this.pos.x + this.radius > width){
          this.pos.x = width - this.radius
          this.vel.x *= -1 
        }
        if (this.pos.x - this.radius < 0){
          this.pos.x = 0 + this.radius
          this.vel.x *= -1
        }
         if (this.pos.y + this.radius > height){
          this.pos.y = height - this.radius
          this.vel.y *= -1 
        }
        if (this.pos.y - this.radius < 0){
          this.pos.y = 0 + this.radius
          this.vel.y *= -1
        }
    }
    display(){
       fill(this.clr)
       circle(this.pos.x, this.pos.y, this.radius*2)
    }
}
