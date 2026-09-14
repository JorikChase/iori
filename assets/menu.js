/* site menu — the original checkbox burger (assets/burger.css), unchanged in
   look and motion. This only adds what a checkbox cannot do: Escape and a
   click outside fold the menu again. Placement is decided per page in
   pages.meta.json ("menu_pos"), never at runtime. */
(function () {
  var nav = document.getElementById("site-menu");
  if (!nav) return;
  var box = nav.querySelector(".menuToggle input");
  if (!box) return;
  document.addEventListener("pointerdown", function (e) {
    if (box.checked && !nav.contains(e.target)) box.checked = false;
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && box.checked) { box.checked = false; box.focus(); }
  });
})();
