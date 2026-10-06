/* Scripted conversation. Each step is plain English, then one Lisp form. */
(function (root, factory) {
  const steps = factory();
  if (typeof module === "object" && module.exports) module.exports = steps;
  else root.LispSteps = steps;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return [
    {
      say: "Start an image named Pulse. A dark field, the name in the corner, and a caption I can change later.",
      form: `(progn
  (setq *world* '(name "Pulse" x 48 y 150 count 0 trail nil marks nil))
  (defun caption ()
    "awake")
  (defun render (time)
    (list
      (clear "#12151c")
      (text 24 28 (world 'name) "#f6f1e7" 28)
      (text 24 246 (caption) "#9aa3b5" 13))))`,
    },
    {
      say: "Put a brass body on the field. Keep its color in its own function.",
      form: `(progn
  (defun body-color ()
    "#e2b657")
  (defun caption ()
    "still")
  (defun render (time)
    (list
      (clear "#12151c")
      (text 24 28 (world 'name) "#f6f1e7" 28)
      (circle (world 'x) (world 'y) 15 (body-color))
      (text 24 246 (caption) "#9aa3b5" 13))))`,
    },
    {
      say: "Let the body drift, leave a short trail, and count the time it has been moving.",
      form: `(progn
  (defun draw-trail (points)
    (if (null points)
        nil
        (cons
          (circle (car (car points)) (nth 1 (car points)) 2.2 "#667085")
          (draw-trail (cdr points)))))
  (defun tick (dt time)
    (let* ((x (world 'x))
           (nx (wrap (+ x (* dt 46)) 30 450))
           (trail (cons (list x (world 'y)) (world 'trail))))
      (setq *world* (plist-put *world* 'x nx))
      (setq *world* (plist-put *world* 'count (+ (world 'count) dt)))
      (setq *world* (plist-put *world* 'trail (take 26 trail)))
      nx))
  (defun caption ()
    (concat (str (floor (world 'count))) "s"))
  (defun render (time)
    (append
      (list
        (clear "#12151c")
        (text 24 28 (world 'name) "#f6f1e7" 28))
      (draw-trail (world 'trail))
      (list
        (circle (world 'x) (world 'y) 15 (body-color))
        (text 24 246 (caption) "#9aa3b5" 13)))))`,
    },
    {
      say: "Make the path bob. Keep the count, the trail, and the color.",
      form: `(defun tick (dt time)
  (let* ((x (world 'x))
         (nx (wrap (+ x (* dt 46)) 30 450))
         (ny (+ 148 (* 36 (sin (* time 1.7)))))
         (trail (cons (list nx ny) (world 'trail))))
    (setq *world* (plist-put *world* 'x nx))
    (setq *world* (plist-put *world* 'y ny))
    (setq *world* (plist-put *world* 'count (+ (world 'count) dt)))
    (setq *world* (plist-put *world* 'trail (take 26 trail)))
    ny))`,
    },
    {
      say: "When I click the field, drop a mark that stays.",
      form: `(progn
  (defun draw-marks (points)
    (if (null points)
        nil
        (cons
          (ring (car (car points)) (nth 1 (car points)) 9 "#f6f1e7")
          (draw-marks (cdr points)))))
  (defun on-click (px py)
    (setq *world* (plist-put *world* 'marks (cons (list px py) (world 'marks))))
    (length (world 'marks)))
  (defun render (time)
    (append
      (list
        (clear "#12151c")
        (text 24 28 (world 'name) "#f6f1e7" 28))
      (draw-trail (world 'trail))
      (draw-marks (world 'marks))
      (list
        (circle (world 'x) (world 'y) 15 (body-color))
        (text 24 246 (caption) "#9aa3b5" 13)))))`,
    },
    {
      say: "Teach it to shout a string backwards, and use that as the caption.",
      form: `(progn
  (defun reverse-string (text)
    (string-reverse text))
  (defun uppercase-string (text)
    (upcase text))
  (defun shout-backwards (text)
    (reverse-string (uppercase-string text)))
  (defun caption ()
    (shout-backwards "steady")))`,
    },
    {
      say: "Tint the body cyan. Redefine only the color.",
      form: `(defun body-color ()
  "#7ee0d6")`,
    },
  ];
});
