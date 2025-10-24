let numLines = 10;

function setup() {
    createCanvas(400, 400);
    colorMode(HSB, TWO_PI, 1, 1);
}
function draw() {
    background(TWO_PI * 0.75, 0.2, 0.9);
    rotate(QUARTER_PI);

    drawGrid();

    rotate(QUARTER_PI * 0.2)

}

function drawGrid(numLines = 10) {
    for(let y = 0; y < numLines; y++) {
        line(0, y * height / numLines, width, y * height / numLines);
    }
    for (let x = 0; x < numLines; x++) {
        line(x * width / numLines, 0, x * width / numLines, height);
    }
}
    