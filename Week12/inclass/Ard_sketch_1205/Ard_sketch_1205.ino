#define POT1_PIN A0
#define POT2_PIN A1
#define BTN_PIN 13

void setup() {
  pinMode(POT1_PIN, INPUT);
  pinMode(POT2_PIN, INPUT);
  pinMode(BTN_PIN, INPUT);

  Serial.begin(115200);

}

void loop() {
  // put your main code here, to run repeatedly:
  Serial.print(analogRead(POT1_PIN));
  Serial.print(',');
  Serial.print(analogRead(POT2_PIN));
  Serial.print(',');
  Serial.println(digitalRead(BTN_PIN));
  delay(100);

}
