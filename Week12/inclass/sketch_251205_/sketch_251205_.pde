import processing.serial.*;

Serial myConnection;
String incomingString;

PVector pos;
float diam;
float mode;

void setup(){
  size(800,600);
  printArray(Serial.list());
  
  pos = new PVector(width*0.5, height*0.5, 200);
  diam = 0;
  mode = 0;
  
  myConnection = new Serial(this, Serial.list()[2], 115200);
  myConnection.bufferUntil('\n');
}

void draw(){
  if(mode == 1){
    background(0);
  }
  
  else{
  background(115);
  
  }
  
  fill(27,0,100);
  circle(pos.x, pos.y, diam);
}

void serialEvent(Serial conn){
  incomingString = conn.readString();
  String[] values = split(trim(incomingString), ',');
  
  if(values.length == 3){
    diam = map(float(values[0]), 0, 4095, 0, height); //pot1
    pos.x = map(float(values[1]), 0, 4095, 0, width); //pot2
    mode = float(values[2]); //buttom
  }
}
