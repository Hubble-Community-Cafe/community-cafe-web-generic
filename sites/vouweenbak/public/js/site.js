/*
 * Vouw een bak: the site's own script.
 *
 * It replaces three things from the WordPress original:
 *
 *   1. jQuery and Foundation's JavaScript, 67 KB gzipped on every page, which this site
 *      used for one thing: the off-canvas menu on small screens. The menus have no
 *      submenus, so Foundation's dropdown and accordion plugins did nothing visible.
 *   2. The theme's assets/scripts/scripts.js. That file also carried dead weight (an
 *      empty-<p> cleanup for Foundation accordions, and a responsive-embed wrapper for
 *      YouTube and Vimeo iframes) for markup this site has never had, so only the top
 *      bar scroll behaviour survives.
 *   3. The per-page inline <script> that drained the glasses. WordPress wrote one out
 *      for every single bakvouwtijd, with the time compiled into the jQuery call. The
 *      time now sits in a data-drain attribute on the glass, and this reads it, so the
 *      CSP in shared/nginx/headers.conf can stay strict.
 *
 * Nothing here writes to the page's content. If this file fails to load, the menu
 * button does nothing, every glass stays full and the times stay hidden
 * (css/noscript.css only applies with JavaScript off).
 */
(function () {
  'use strict'

  /*
   * The off-canvas menu. Foundation's CSS (css/foundation.min.css) still does all the
   * styling and the slide; this sets the same state classes and attributes Foundation's
   * plugin did, recorded from the live page, so the menu looks and moves exactly as it
   * did. Escape closing it is new.
   */
  var panel = document.getElementById('off-canvas')
  var content = document.querySelector('[data-off-canvas-content]')
  var toggles = document.querySelectorAll('[data-toggle="off-canvas"]')

  if (panel && content && toggles.length) {
    var overlay = document.createElement('div')
    overlay.className = 'js-off-canvas-overlay is-overlay-fixed'
    content.parentNode.insertBefore(overlay, content)

    panel.classList.add('is-transition-push', 'is-closed')
    panel.setAttribute('aria-hidden', 'true')
    Array.prototype.forEach.call(toggles, function (toggle) {
      toggle.setAttribute('aria-controls', panel.id)
      toggle.setAttribute('aria-expanded', 'false')
    })

    var isOpen = false
    var hideTimer = null

    var setOpen = function (open) {
      if (open === isOpen) return
      isOpen = open
      window.clearTimeout(hideTimer)

      panel.classList.toggle('is-open', open)
      panel.setAttribute('aria-hidden', String(!open))
      overlay.classList.toggle('is-visible', open)
      overlay.classList.toggle('is-closable', open)
      content.classList.toggle('is-open-right', open)
      content.classList.add('has-transition-push', 'has-position-right')
      Array.prototype.forEach.call(toggles, function (toggle) {
        toggle.setAttribute('aria-expanded', String(open))
      })

      if (open) {
        panel.classList.remove('is-closed')
      } else {
        // is-closed hides the panel (visibility: hidden), which also takes its links out
        // of the tab order. Added once the slide out has finished, as Foundation did.
        var seconds = parseFloat(window.getComputedStyle(panel).transitionDuration) || 0
        hideTimer = window.setTimeout(function () {
          panel.classList.add('is-closed')
        }, seconds * 1000)
      }
    }

    Array.prototype.forEach.call(toggles, function (toggle) {
      toggle.addEventListener('click', function () {
        setOpen(!isOpen)
      })
    })
    overlay.addEventListener('click', function () {
      setOpen(false)
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen) {
        setOpen(false)
        toggles[0].focus()
      }
    })

    // The button only exists below Foundation's medium breakpoint (40em). Widening the
    // window past it with the menu open would otherwise leave the page pushed aside.
    if (window.matchMedia) {
      var medium = window.matchMedia('(min-width: 40em)')
      var onBreakpoint = function () {
        if (medium.matches) setOpen(false)
      }
      if (medium.addEventListener) medium.addEventListener('change', onBreakpoint)
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
