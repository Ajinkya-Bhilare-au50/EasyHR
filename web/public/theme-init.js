// Runs from <head> before first paint (loaded by app/layout.tsx). Applies the saved theme,
// else the OS preference, and hides the credit banner if it was dismissed this session.
// Keys must match components/shell/theme.tsx.
(function () {
  var d = document.documentElement;
  try {
    var t = localStorage.getItem("easyhr.theme");
    if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    d.dataset.theme = t;
  } catch (e) {
    d.dataset.theme = "light";
  }
  try {
    if (sessionStorage.getItem("easyhr.credit") === "hidden") d.dataset.credit = "hidden";
  } catch (e) {}
})();
