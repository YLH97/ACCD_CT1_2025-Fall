let cBox = document.getElementById("celement");
let colorbtn = document.getElementById("changecolor");
let imageBox = document.getElementById("meme1");
let toglebtn = document.getElementById("togglememe");



let assignrandomcolor = function()
{
    let rCom = 255 * Math.random()
    let gCom = 255 * Math.random()
    let bCom = 255 * Math.random()
    cBox.style.backgroundColor = "rgb(" + rCom + ", " + gCom + ", " + bCom + ")";
}

const toggleme = () => 
{
    console.log(imageBox.src)
    if (imageBox.src.includes("meme1.jpg"))
    {
        imageBox.src = "image/meme2.jpg"
    }
    else
    {
        imageBox.src = "image/meme1.jpg"
    }
}

colorbtn.addEventListener("click", assignrandomcolor)
toglebtn.addEventListener("click", toggleme)