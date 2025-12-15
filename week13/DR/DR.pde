import processing.serial.*;
import processing.sound.*;

SoundFile BassDrum;
SoundFile SnareDrum;
SoundFile HitHat;
SoundFile CloseHiHat;

Serial connection;

void setup(){
  size(600, 200);
  
  BassDrum = new SoundFile(this,"BT0A0D0.WAV");
  SnareDrum = new SoundFile(this,"BT3A0D3.WAV");
  HitHat = new SoundFile(this,"CLOP4.WAV");
  CloseHiHat = new SoundFile(this,"ST0T0SA.WAV");
  printArray(Serial.list());
  connection = new Serial(this, Serial.list()[2], 115200);
  connection.bufferUntil('\n');
}

void draw(){
}

void serialEvent(Serial conn){
  String incoming = conn.readString();
  String[] values = split(trim(incoming), ',');
  
  printArray(values);
  if (values.length == 4){
    if(float(values[0])>0){
      BassDrum.play();
    }
    if(float(values[1])>0){
      SnareDrum.play();
    }
    if(float(values[2])>0){
      HitHat.play();
    }
    if(float(values[3])>0){
      CloseHiHat.play();
    }
  }
}
