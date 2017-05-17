(function ($) {

  /* cache body element */
  let body = $('body')

  /**
   * Maintain plugin state
   * @type {Object}
   */
  let state = {
    timer:         750,
    timeout:       null,
    status:        'off',
    isOpen:        false,
    isUpdating:    false,
    pendingUpdate: false,
    position:      0,
    widths: {
      wrap: 0
    }
  }

  /**
   * Cache WordPress core elements and watch for events on Preview Changes
   * button and the_content editor (TinyMCE)
   * @type {Object}
   */
  let wpcore = {
    wrap: $('#wpwrap'),
    menu: $('#adminmenu'),
    post: $('#post-body'),
    previewBtn: $('#post-preview'),
    toolbarTabs: false,
    toolbarActions: false,
    watch () {
      body.on('click', '#post-preview', function (e) {
        e.preventDefault()
        actions.open()
      })
    },
    setToolbarEls () {
      this.toolbarTabs = $('#wp-content-editor-tools')
      this.toolbarActions = $('.mce-toolbar-grp')
    }
  }

  /**
   * Actions available to AutoPreview (refresh & close)
   * @type {Object}
   */
  let actions = {
    /**
     * Only refresh when we're not waiting on load, otherwise we end up
     * wasting resources concurrently loading. When refreshing make sure
     * to save scroll position so it can be restored on iframe load. Hide
     * the iframe to reveal the loading spinner while we refresh. Set the
     * state to know we are in the process of updating.
     * @param  {string} action What action triggered the refresh
     */
    refresh (action) {
      if (state.isUpdating === false) {
        state.position = template.iframe[0].contentWindow.document.body.scrollTop
        template.iframe.css({'opacity': 0})
        wpcore.previewBtn.click()
        state.isUpdating = true
      }
    },
    /**
     * Close AutoPreview and reset state
     */
    close () {
      template.root.css({'width': 0, 'opacity': 0})
      wpcore.wrap.css({'width': '100%'})
      wpcore.wrap.next().remove()
      template.iframe.css({'opacity': 0})
      adjustLayout()
      state.status = 'off'
      state.isOpen = false
      state.isUpdating = false
      state.pendingUpdate = false
      state.position = 0
      userInput.unwatch()
    },
    /**
     * When the Preview Changes button is clicked, and the preview is not
     * already open, open it and split the layout!
     */
    open () {
      if (!state.isOpen) {
        state.status = 'on'
        state.isOpen = true
        wpcore.setToolbarEls()
        template.watch()
        userInput.watch()
        template.root.show()
        template.root.css({'opacity': 1})
        splitLayout()
        template.gutter = $('.gutter-horizontal')
        adjustLayout()
      }
    }
  }

  /**
   * In the post body element, watch for clicks, typing, and changes to
   * trigger a refresh of the preview panel. This will allow preview
   * to 'automatically' update as someone edits the content.
   * WYSIWYG and WP Core watchers are on wpcore object.
   *
   * @type {Object}
   */
  let userInput = {
    scope: $('#post-body-content'),
    watch () {
      this.scope.on('click', 'input:checkbox, input:radio', tryUpdate)
      this.scope.on('keyup', 'input:text, textarea', debounceUpdates)
      this.scope.on('change', 'select, input:hidden', tryUpdate)
      watchEditors()
      acf.watchNewEditors()
      $(window).on('resize', resizePanels)
    },
    unwatch () {
      this.scope.off('click', 'input:checkbox, input:radio', tryUpdate)
      this.scope.off('keyup', 'input:text, textarea', debounceUpdates)
      this.scope.off('change', 'select, input:hidden', tryUpdate)
      unwatchEditors()
      $(window).off('resize', resizePanels)
    }
  }

  /**
   * Watch existing TinyMCE editors.
   */
  const watchEditors = () => {
    $('.wp-editor-container')
      .find('iframe')
      .contents()
      .find('body')
      .on('keyup', debounceUpdates)
  }

  /**
   * Unwatch existing TinyMCE editors.
   */
  const unwatchEditors = () => {
    $('.wp-editor-container')
      .find('iframe')
      .contents()
      .find('body')
      .off('keyup', debounceUpdates)
  }

  /**
   * A subset of functionality for ACF-enabled instances.
   *
   * @type  {object}
   */
  const acf = {
    /**
     * Check to see that ACF is loaded.
     *
     * @returns  {boolean}
     */
    enabled() {
      return window.acf && window.acf.add_action;
    },

    /**
     * Hooks into ACF's `after_duplicate` action and polls for any TinyMCE editors
     * that are loaded inside repeater or flexible-content blocks.
     */
    watchNewEditors() {
      if (!this.enabled()) return;

      window.acf.add_action('after_duplicate', (oldBlock, newBlock) => {
        // It takes ACF a moment to attach editors to the DOM, so we'll poll for that
        // attachment; but we'll also set a timeout so polling doesn't continue forever
        // for fields that don't contain editors
        let _poll, _timeout
        _timeout = setTimeout(() => {
          clearInterval(_poll)
          console.log(`autopreview: ${newBlock.attr('id')} - polling timed out`)
        }, 1500)
        _poll = setInterval(() => {
          let iframe = newBlock.find('.mce-container iframe')
          if (iframe.length) {
            clearInterval(_poll)
            clearTimeout(_timeout)
            iframe.on('load', () => {
              iframe.contents()
                .find('body')
                .on('keyup', debounceUpdates)
            })
          }
        }, 100)
      })
    }
  }

  /**
   * Debounce updates by setting and clearing a timeout when input is observed.
   * After timeout, try to update.
   */
  const debounceUpdates = () => {
    clearTimeout(state.timeout)
    state.timeout = setTimeout(function () {
      tryUpdate()
    }, state.timer)
  }

  /**
   * Fired to fix panel sizes and update gutter position
   */
  const resizePanels = () => {
    adjustLayout()
    updateGutter()
  }

  /**
   * Called by actions that should refresh the content preview. Only fire
   * when the preview is open. Only refresh when there is no update already
   * in progress. If there is in update in progress, update state for
   * pending update. This makes sure we don't create a stack of reloads
   * while a user types a paragraph.
   */
  const tryUpdate = () => {
    if (!state.isOpen) return false
    if (!state.isUpdating) {
      actions.refresh('queued')
    } else  {
      state.pendingUpdate = true
    }
  }

  /**
   * Template for auto preview. Created dynamically and mounted after
   * #wpwrap. This is all the markup for auto preview that isn't from core.
   * Watch method adds events for action buttons and iframe load events.
   * @type {Object}
   */
  let template = {
    create () {
      this.root = $('<div/>', { id: 'auto-preview' })
      this.iframe = $('<iframe/>', {
        id: 'auto-preview-iframe',
        name: wpcore.previewBtn.attr('target') || 'wp-preview'
      })
      this.actionBar = $('<div/>', {
        class: 'auto-preview-actions',
        text: 'Preview:'
      })
      this.closeBtn = $('<button/>', {
        class: 'auto-preview-close button button-primary button-large',
        text: 'Close'
      })
      this.refreshBtn = $('<button/>', {
        class: 'auto-preview-refresh button button-primary button-large',
        text: 'Refresh'
      })
      this.loader = $('<div/>', { class: 'loading-spinner' })
      this.actionBar
        .append(this.closeBtn)
        .append(this.refreshBtn)
      this.root
        .append(this.actionBar)
        .append(this.iframe)
        .append(this.loader)
      wpcore.wrap.after(this.root)
    },
    /**
     * Watch action bar buttons and iframe load events.
     */
    watch () {
      this.closeBtn.on('click', function (e) {
        e.preventDefault()
        actions.close()
      })
      this.refreshBtn.on('click', function (e) {
        e.preventDefault()
        actions.refresh('button')
      })
      /**
       * When the iframe loads, restore scroll position, if none was set,
       * the default state is 0 (top of the page). Since the load event
       * fired we can assume there is no longer an update in progress, but
       * check to see if there are changes since before we started to refresh
       * with pendingUpdate. If there is an update pending, try a new update
       * now. Otherwise, go ahead and show the iframe!
       */
      this.iframe.load(function () {
        let iframe = $(this)
        iframe[0].contentWindow.document.body.scrollTop = state.position
        state.isUpdating = false
        if (state.pendingUpdate) {
          state.pendingUpdate = false
          tryUpdate()
        } else {
          iframe.show()
          iframe.css({'opacity': 1})
        }
      })
    }
  }

  /**
   * Use Split.js to split layout into 2 resizable columns [wpcore|preview]
   */
  const splitLayout = () => {
    Split(['#wpwrap','#auto-preview'], {
      sizes: [50, 50],
      minSize: 250,
      gutterSize: 6,
      onDrag: function () {
        resizePanels()
      },
      onDragEnd: function () {
        resizePanels(true)
      }
    })
  }

  /**
   * Update gutter position based on panel widths
   */
  const updateGutter = () => {
    template.gutter.css({ 'left': state.widths.wrap })
  }

  /**
   * Adjust layout will make sure the gutter is properly positioned,
   * fix tinyMCE sizing by setting toolbar widths to 100%, swap responsive
   * classes for WordPress core breakpoints window width is not the width of
   * the actual core content now (core media queries will not work)
   * @param  {number} width width of #wpwrap
   */
  const adjustLayout = () => {
    /**
     * Fix annoying toolbars
     */
    wpcore.toolbarTabs.css('width', '100%')
    wpcore.toolbarActions.css('width', '100%')
    /**
     * Set Width
     */
    state.widths.wrap = wpcore.wrap.width()
     /**
     * Stack/Unstack Editor columns
     */
    if (state.widths.wrap < 851) {
      wpcore.post.removeClass('columns-2')
      wpcore.post.addClass('columns-1')
    } else {
      wpcore.post.removeClass('columns-1')
      wpcore.post.addClass('columns-2')
    }
    /**
     * Fold/Unfold admin menu
     */
    if (state.widths.wrap < 961) {
      body.addClass('folded')
    } else {
      body.removeClass('folded')
    }
  }

  /* Start it up! */
  const init = () => {
    body.addClass('auto-preview-enabled')
    template.create()
    wpcore.watch()
  }

  init()

})(jQuery)
