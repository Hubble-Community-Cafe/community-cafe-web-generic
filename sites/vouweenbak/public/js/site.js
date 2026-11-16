/*
 * Vouw een bak: the site's own script.
 *
 * It replaces two things from the WordPress original:
 *
 *   1. The theme's assets/scripts/scripts.js. That file also carried dead weight (an
 *      empty-<p> cleanup for Foundation accordions, and a responsive-embed wrapper for
 *      YouTube and Vimeo iframes) for markup this site has never had, so only the
 *      Foundation bootstrap and the top bar scroll behaviour survive.
 *   2. The per-page inline <script> that drained the glasses. WordPress wrote one out
 *      for every single bakvouwtijd, with the time compiled into the jQuery call. The
 *      time now sits in a data-drain attribute on the glass, and this reads it, so the
 *      CSP in shared/nginx/headers.conf can stay strict.
 *
 * Nothing here writes to the page's content. If this file fails to load, every glass
 * simply stays full and the times stay hidden (css/noscript.css only applies with
 * JavaScript off). If jQuery or Foundation fails to load, only the small-screen menu
 * is lost: the glasses still drain and reveal their times.
 */
(function () {
  'use strict'

  // Foundation drives the off-canvas menu on small screens and the dropdown nav above
  // it. Both are markup-driven (data-off-canvas, data-responsive-menu), so this is the
  // whole initialisation.
  //
  // Guarded, because it runs first: if jquery.min.js or foundation.min.js failed to
  // load, an unguarded call throws and takes the glasses below down with it, and with
  // JavaScript on, css/noscript.css does not step in. Only the small-screen menu should
  // be lost then, not every time on the page.
  if (window.jQuery && window.jQuery.fn && window.jQuery.fn.foundation) {
    try {
      window.jQuery(document).foundation()
    } catch (err) {
      if (window.console) window.console.error('Foundation failed to start', err)
    }
  }

  /*
   * The top bar is transparent over the hero and solid once you scroll past it. The
   * theme did this by writing background-color and a transition duration into the
   * element's style on every scroll event; the same look now lives in css/site.css and
   * this only toggles the class.
   */
  var topBar = document.querySelector('.top-bar')
  if (topBar) {
    var onScroll = function () {
      topBar.classList.toggle('is-scrolled', window.pageYOffset > 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  /*
   * Drain each glass over the time that was recorded in it, then reveal the number.
   * A glass without a data-drain is one with no time for that size: it stays full,
   * next to the infinity sign the page already shows.
   */
  var reveal = function (glass) {
    var container = glass.closest('[id^="bav"], [id^="ice"]')
    var time = container && container.querySelector('.hiddendiv')
    if (time) time.style.display = 'inline'
  }

  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  Array.prototype.forEach.call(document.querySelectorAll('[data-drain]'), function (glass) {
    var seconds = parseFloat(glass.getAttribute('data-drain'))
    if (!(seconds > 0)) return

    if (reduceMotion) {
      glass.style.height = '0'
      reveal(glass)
      return
    }

    // Pin the height the stylesheet gave the glass, in pixels, so the transition has a
    // start value to leave from. Reading offsetHeight in between forces the layout that
    // makes it stick. Starting the drain here rather than in a requestAnimationFrame
    // keeps it in step with the timer below, which runs even on a tab nobody is looking
    // at while animation frames do not.
    glass.style.height = window.getComputedStyle(glass).height
    void glass.offsetHeight
    glass.style.transition = 'height ' + seconds + 's ease-in-out'
    glass.style.height = '0'

    // transitionend is not reliable on a tab that was never visible, and one of these
    // runs for 88 seconds. A timer is simply the honest way to wait.
    window.setTimeout(function () {
      reveal(glass)
    }, seconds * 1000)
  })
})()
