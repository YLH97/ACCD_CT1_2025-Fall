document.addEventListener("DOMContentLoaded", () => {
  const showcaseImage = document.querySelector("#showcase-image");
  const thumbnailItems = Array.from(document.querySelectorAll(".gallery-thumb"));

  if (!showcaseImage || !thumbnailItems.length) {
    return;
  }

  const setActiveThumbnail = (item) => {
    const img = item.querySelector("img");
    if (!img) {
      return;
    }

    const fullSrc = img.dataset.full || img.src;

    showcaseImage.src = fullSrc;
    showcaseImage.alt = img.alt || "Showcase image";

    thumbnailItems.forEach((thumb) => thumb.classList.toggle("is-active", thumb === item));
  };

  thumbnailItems.forEach((item, index) => {
    const handleSelect = () => setActiveThumbnail(item);

    item.addEventListener("click", handleSelect);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        handleSelect();
      }
    });

    // Mark the first thumbnail active on load.
    if (index === 0) {
      item.classList.add("is-active");
    }
  });
});
