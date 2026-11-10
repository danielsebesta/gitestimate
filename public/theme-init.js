// apply saved color mode before first paint (same attrs github.com uses)
(function () {
  var d = document.documentElement;
  d.dataset.colorMode = localStorage.getItem("color-mode") || "auto";
  d.dataset.lightTheme = "light";
  d.dataset.darkTheme = "dark";
})();
