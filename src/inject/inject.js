// ==UserScript==
// @name         Lens
// @namespace    http://your.homepage/
// @version      0.2
// @description  Read the article, and get on with your life.
// @author       You
// @include        *
// @grant        none
// @noframe
// ==/UserScript==

// PICO MODAL
(function(window, document) {
    "use strict";

    /** Returns whether a value is a dom node */
    function isNode(value) {
        if ( typeof Node === "object" ) {
            return value instanceof Node;
        }
        else {
            return value &&
                typeof value === "object" &&
                typeof value.nodeType === "number";
        }
    }

    /** Returns whether a value is a string */
    function isString(value) {
        return typeof value === "string";
    }

    /**
     * Generates observable objects that can be watched and triggered
     */
    function observable() {
        var callbacks = [];
        return {
            watch: callbacks.push.bind(callbacks),
            trigger: function( modal ) {

                var unprevented = true;
                var event = {
                    preventDefault: function preventDefault () {
                        unprevented = false;
                    }
                };

                for (var i = 0; i < callbacks.length; i++) {
                    callbacks[i](modal, event);
                }

                return unprevented;
            }
        };
    }


    /**
     * A small interface for creating and managing a dom element
     */
    function Elem( elem ) {
        this.elem = elem;
    }

    /**
     * Creates a new div
     */
    Elem.div = function ( parent ) {
        var elem = document.createElement('div');
        (parent || document.body).appendChild(elem);
        return new Elem(elem);
    };

    Elem.prototype = {

        /** Creates a child of this node */
        child: function () {
            return Elem.div(this.elem);
        },

        /** Applies a set of styles to an element */
        stylize: function(styles) {
            styles = styles || {};

            if ( typeof styles.opacity !== "undefined" ) {
                styles.filter =
                    "alpha(opacity=" + (styles.opacity * 100) + ")";
            }

            for (var prop in styles) {
                if (styles.hasOwnProperty(prop)) {
                    this.elem.style[prop] = styles[prop];
                }
            }

            return this;
        },

        /** Adds a class name */
        clazz: function (clazz) {
            this.elem.className += " " + clazz;
            return this;
        },

        /** Sets the HTML */
        html: function (content) {
            if ( isNode(content) ) {
                this.elem.appendChild( content );
            }
            else {
                this.elem.innerHTML = content;
            }
            return this;
        },

        /** Adds a click handler to this element */
        onClick: function(callback) {
            this.elem.addEventListener('click', callback);
            return this;
        },

        /** Removes this element from the DOM */
        destroy: function() {
            document.body.removeChild(this.elem);
        },

        /** Hides this element */
        hide: function() {
            this.elem.style.display = "none";
        },

        /** Shows this element */
        show: function() {
            this.elem.style.display = "block";
        },

        /** Sets an attribute on this element */
        attr: function ( name, value ) {
            this.elem.setAttribute(name, value);
            return this;
        },

        /** Executes a callback on all the ancestors of an element */
        anyAncestor: function ( predicate ) {
            var elem = this.elem;
            while ( elem ) {
                if ( predicate( new Elem(elem) ) ) {
                    return true;
                }
                else {
                    elem = elem.parentNode;
                }
            }
            return false;
        }
    };


    /** Generates the grey-out effect */
    function buildOverlay( getOption, close ) {
        return Elem.div()
            .clazz("pico-overlay")
            .clazz( getOption("overlayClass", "") )
            .stylize({
                display: "block",
                position: "fixed",
                top: "0px",
                left: "0px",
                height: "100%",
                width: "100%",
                visibility: "visible",
                zIndex: "2000000000"
            })
            .stylize(getOption('overlayStyles', {
                opacity: 0.5,
                background: "#000"
            }))
            .onClick(function () {
                if ( getOption('overlayClose', true) ) {
                    close();
                }
            });
    }

    /** Builds the content of a modal */
    function buildModal( getOption, close ) {
        var width = getOption('width', '85%');
        if ( typeof width === "number" ) {
            width = "" + width + "px";
        }

        var elem = Elem.div()
            .clazz("pico-content")
            .clazz( getOption("modalClass", "") )
            .stylize({
                display: 'block',
                position: 'fixed',
                height: "calc(100% - 10px)",
                overflow: "auto",
                visibility: "visible",
                zIndex: "9000000000",
                left: "50%",
                top: "0",
                width: width,
                '-ms-transform': 'translateX(-50%)',
                '-moz-transform': 'translateX(-50%)',
                '-webkit-transform': 'translateX(-50%)',
                '-o-transform': 'translateX(-50%)',
                'transform': 'translateX(-50%)'
            })
            .stylize(getOption('modalStyles', {
                backgroundColor: "white",
                borderRadius: "5px"
            }))
            .html( getOption('content') )
            .attr("role", "dialog")
            .onClick(function (event) {
                var isCloseClick = new Elem(event.target)
                    .anyAncestor(function (elem) {
                        return (/\bpico-close\b/).test(elem.elem.className);
                    });
                if ( isCloseClick ) {
                    close();
                }
            });

        return elem;
    }

    /** Builds the close button */
    function buildClose ( elem, getOption ) {
        if ( getOption('closeButton', true) ) {
            return elem.child()
                .html( getOption('closeHtml', "&#xD7;") )
                .clazz("pico-close")
                .clazz( getOption("closeClass") )
                .stylize( getOption('closeStyles', {
                    borderRadius: "2px",
                    cursor: "pointer",
                    height: "15px",
                    width: "15px",
                    position: "absolute",
                    top: "5px",
                    right: "5px",
                    fontSize: "16px",
                    textAlign: "center",
                    lineHeight: "15px",
                    background: "#CCC"
                }) );
        }
    }

    /** Builds a method that calls a method and returns an element */
    function buildElemAccessor( builder ) {
        return function () {
            return builder().elem;
        };
    }


    /**
     * Displays a modal
     */
    function picoModal(options) {

        if ( isString(options) || isNode(options) ) {
            options = { content: options };
        }

        var afterCreateEvent = observable();
        var beforeShowEvent = observable();
        var afterShowEvent = observable();
        var beforeCloseEvent = observable();
        var afterCloseEvent = observable();

        /**
         * Returns a named option if it has been explicitly defined. Otherwise,
         * it returns the given default value
         */
        function getOption ( opt, defaultValue ) {
            var value = options[opt];
            if ( typeof value === "function" ) {
                value = value( defaultValue );
            }
            return value === undefined ? defaultValue : value;
        }

        /** Hides this modal */
        function forceClose () {
            shadowElem().hide();
            modalElem().hide();
            afterCloseEvent.trigger(iface);
        }

        /** Gracefully hides this modal */
        function close () {
            if ( beforeCloseEvent.trigger(iface) ) {
                forceClose();
            }
        }

        /** Wraps a method so it returns the modal interface */
        function returnIface ( callback ) {
            return function () {
                callback.apply(this, arguments);
                return iface;
            };
        }


        // The constructed dom nodes
        var built;

        /** Builds a method that calls a method and returns an element */
        function build ( name ) {
            if ( !built ) {
                var modal = buildModal(getOption, close);
                built = {
                    modal: modal,
                    overlay: buildOverlay(getOption, close),
                    close: buildClose(modal, getOption)
                };
                afterCreateEvent.trigger(iface);
            }
            return built[name];
        }

        var modalElem = build.bind(window, 'modal');
        var shadowElem = build.bind(window, 'overlay');
        var closeElem = build.bind(window, 'close');


        var iface = {

            /** Returns the wrapping modal element */
            modalElem: buildElemAccessor(modalElem),

            /** Returns the close button element */
            closeElem: buildElemAccessor(closeElem),

            /** Returns the overlay element */
            overlayElem: buildElemAccessor(shadowElem),

            /** Shows this modal */
            show: function () {
                if ( beforeShowEvent.trigger(iface) ) {
                    shadowElem().show();
                    closeElem();
                    modalElem().show();
                    afterShowEvent.trigger(iface);
                }
                return this;
            },

            /** Hides this modal */
            close: returnIface(close),

            /**
             * Force closes this modal. This will not call beforeClose
             * events and will just immediately hide the modal
             */
            forceClose: returnIface(forceClose),

            /** Destroys this modal */
            destroy: function () {
                modalElem = modalElem().destroy();
                shadowElem = shadowElem().destroy();
                closeElem = undefined;
            },

            /**
             * Updates the options for this modal. This will only let you
             * change options that are re-evaluted regularly, such as
             * `overlayClose`.
             */
            options: function ( opts ) {
                options = opts;
            },

            /** Executes after the DOM nodes are created */
            afterCreate: returnIface(afterCreateEvent.watch),

            /** Executes a callback before this modal is closed */
            beforeShow: returnIface(beforeShowEvent.watch),

            /** Executes a callback after this modal is shown */
            afterShow: returnIface(afterShowEvent.watch),

            /** Executes a callback before this modal is closed */
            beforeClose: returnIface(beforeCloseEvent.watch),

            /** Executes a callback after this modal is closed */
            afterClose: returnIface(afterCloseEvent.watch)
        };

        return iface;
    }

    window.picoModal = picoModal;
}(window, document));


var dbg = (typeof console !== 'undefined') ? function(s) {
    // console.log("Readability: " + s);
    console.log.apply(console, arguments);
} : function() {};

var info = (typeof console !== 'undefined') ? function() {
    console.info.apply(console,  arguments);
} : function() {};


var readability = {
    version: '1.8.0',
    // iframeLoads: 0,
    convertLinksToFootnotes: true,
    // reversePageScroll: false,
    /* If they hold shift and hit space, scroll up */
    // frameHack: false,
    /**
     * The frame hack is to workaround a firefox bug where if you
     * pull content out of a frame and stick it into the parent element, the scrollbar won't appear.
     * So we fake a scrollbar in the wrapping div.
     **/
    biggestFrame: false,
    wholePageCache: null,
    bodyCache: null,
    /* Cache the body HTML in case we need to re-use it later */
    flags: 0x1 | 0x2 | 0x4,
    /* Start with all flags set. */

    /* constants */
    FLAG_STRIP_UNLIKELYS: 0x1,
    FLAG_WEIGHT_CLASSES: 0x2,
    FLAG_CLEAN_CONDITIONALLY: 0x4,

    maxPages: 10,
    /* The maximum number of pages to loop through before we call it quits and just show a link. */
    parsedPages: {},
    /* The list of pages we've parsed in this call of readability, for autopaging. As a key store for easier searching. */
    pageETags: {},
    /* A list of the ETag headers of pages we've parsed, in case they happen to match, we'll know it's a duplicate. */

    /**
     * All of the regular expressions in use within readability.
     * Defined up here so we don't instantiate them repeatedly in loops.
     **/
    regexps: {
        unlikelyCandidates: /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|aside|nocontent/i,
        okMaybeItsACandidate: /and|article|body|column|main|shadow|canvas|svg/i,
        stripFromText: /img|a/i,
        positive: /article|body|content|entry|hentry|main|page|pagination|post|text|blog|story|code|svg|canvas/i,
        negative: /combx|comment|com-|contact|header|foot|footer|footnote|masthead|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget|nocontent|share|bookmark/i,
        extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single/i,
        divToPElements: /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
        replaceBrs: /(<br[^>]*>[ \n\r\t]*){2,}/gi,
        replaceFonts: /<(\/?)font[^>]*>/gi,
        trim: /^\s+|\s+$/g,
        normalize: /\s{2,}/g,
        killBreaks: /(<br\s*\/?>(\s|&nbsp;?)*){1,}/g,
        videos: /http:\/\/(www\.)?(youtube|vimeo)\.com/i,
        skipFootnoteLink: /^\s*(\[?[a-z0-9]{1,2}\]?|^|edit|citation needed)\s*$/i,
        nextLink: /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i, // Match: next, continue, >, >>, » but not >|, »| as those usually mean last.
        prevLink: /(prev|earl|old|new|<|«)/i,
        likelyURLpath: /[-_]/
    },
    nextPageLink: null,
    /**
     * Runs readability.
     *
     * Workflow:
     *  1. Prep the document by removing script tags, css, etc.
     *  2. Build readability's DOM tree.
     *  3. Grab the article content from the current dom tree.
     *  4. Replace the current DOM tree with the new one.
     *  5. Read peacefully.
     *
     * @return void
     **/
    init: function() {
        /**
         * Don't use this on root page (NOT UNIVERSAL)
         **/
        if (/\b(google|facebook|twitter|quizlet|dropbox)\b/i.test(window.document.location.hostname)) return null;
        if (localStorage.getItem("lens-user-never-again-GH3UEgL6CbcpK4hNtQeR8Fc") === "n") return null;

        // readability.flags = localStorage.getItem("lens-flag-GH3UEgL6CbcpK4hNtQeR8Fc") || readability.flags;
        // don't use on forums
        var linksOnSameDomain = function(query){
            links = document.querySelectorAll(query);
            var total = 0;
            for (var i = 0; i < links.length; i++) {
                try {
                    if (links.href.split('/')[2] === location.hostname){
                        total+=1;
                    }
                } catch (err) {}
            }
            return total;
        };
        if (linksOnSameDomain("a[href*='forum']") > 5 || linksOnSameDomain("a[href*='thread']") > 5) {
            info("forum");
            return null;
        }
        // don't use of stackoverflow like pages, may want to try to find something more general (like textarea) although comments...
        if (document.querySelector("html[itemtype='http://schema.org/QAPage']") !== null) {
            info("page like stackoverflow");
            return null;
        }

        info("Started Readability~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~" );
        readability.prepDocument();
        
        if(document.body && !readability.bodyCache) {
            readability.wholePageCache = document.cloneNode(true);
            readability.wholePageCache.normalize();
            readability.bodyCache = readability.wholePageCache.querySelector("body");
        }


        // if (! readability.regexps.likelyURLpath.test(window.document.location.pathname)) {
        //     dbg("unlikely URLpath");
        //     return null;
        // }


        readability.removeScripts(readability.wholePageCache);

        /* Make sure this document is added to the list of parsed pages first, so we don't double up on the first page */
        readability.parsedPages[window.location.href.replace(/\/$/, '')] = true;

        /* Pull out any possible next page link first */
        var nextPageLink = readability.findNextPageLink(readability.bodyCache);
        readability.nextPageLink = nextPageLink;
        var articleTools = readability.getArticleTools();
        var articleTitle = readability.getArticleTitle();
        var articleContent = readability.grabArticle(readability.bodyCache);
        if (!articleContent) {
            info("no article");
            return;
        }
        var styles = document.styleSheets;
        for (var i = 0; i< styles.length; i++){
            styles[i].disabled = true;
            styles[i].lensDisabled = true;
        }


        var articleFooter = readability.getArticleFooter();
        readability.readFooter = articleFooter;
        // TODO: Expand This to return if we only selected less than 80% of the page.

        /* Build readability's DOM tree */
        var style = document.createElement("STYLE");
        style.type = "text/css";
        styleText = document.createTextNode('img {max-width: 100% !important; } body, td, input, select, textarea, button {color: hsl(273, 10%, 20%) !important; } h1 {font-size: 1.25em !important; } h2 {font-size: 1.125em !important; } h3 {font-size: 1.05em !important; } a {text-decoration: none !important; color: #35C !important; } a:hover {text-decoration: underline !important; background-color: #fafafa !important; } blockquote {border-left: 5px solid #eaeef1 !important; color: #555 !important; margin-left: 0px !important; margin-right: 0px !important; padding: 0px 20px !important; } hr {height: 0px !important; border: none !important; border-top: 1px solid #ddd !important; } br {clear: left !important; } #article {display: inline-block !important; font: 19px Georgia, Times, "Times New Roman", serif !important; line-height: 160% !important; text-align: justify !important; text-shadow: none !important; } #article.rtl {direction: rtl !important; text-align: right !important; } .page {border: 1px solid #C3C3C3 !important; background-color: #fdfdfd !important; padding: 45px 70px !important; margin: 12px 12px 0px 12px !important; -webkit-user-select: auto !important; } .page:first-of-type {margin-top: 20px !important; } .page:last-of-type {margin-bottom: 20px !important; } .page table {font-size: 0.9em !important; text-align: left !important; } .page.rtl table {text-align: right !important; } #title {display: none !important; font-weight: bold !important; font-size: 1.33em !important; line-height: 1.25em !important; margin-bottom: 1.5em !important; /*opt*/ padding: 45px 70px !important; /*opt*/ padding-bottom: 0px !important; } .page:first-of-type #title {display: block !important; } .content {word-wrap: break-word !important; } .content pre, .content xmp, .content plaintext, .content listing {/*opt*/ white-space: normal !important; } .content pre, .content code {border: 1px dashed #d3c8cf !important; border-left: 5px solid #f5edf2 !important; padding: 5px 5px 5px 10px !important; } .content img {float: left !important; margin: 12px 12px 12px 0px !important; max-width: 100% !important; height: auto !important; } .content.disableImages img {display: none  !important; } .content img.tinyImage {float: none !important; margin: 0 !important; } .content img.largeImage {float: none !important; margin: 1em auto !important; display: block !important; clear: both !important; } .content a img {border: none !important; } .content .float {margin: 8px 0 !important; font-size: 70% !important; line-height: 1.4 !important; text-align: left !important; } #article.rtl .content .float {text-align: right !important; } .content .float.left {float: left !important; margin-right: 20px !important; } .content .float.right {float: right !important; margin-left: 20px  !important; } .content .float.full-width {float: none !important; display: block !important; } ::-webkit-scrollbar:horizontal, ::-webkit-scrollbar-track:disabled {display: none !important; } ::-webkit-scrollbar-thumb {-webkit-border-image: url("https://i.imgur.com/JiF4KuF.png") 19 0 19 0 !important; border-width: 19px 0 !important; min-height: 40px !important; } ::-webkit-scrollbar-track {margin-top: 20px !important; margin-bottom: 20px !important; -webkit-border-image: url("https://i.imgur.com/wLYCOTH.png") 21 0 21 0 !important; border-width: 21px 0 !important; } ::-webkit-scrollbar {width: 21px !important; } @media print {body {background: #fff  !important; } #controls, .footer, .loader {display: none  !important; } #articleContainer {width: auto  !important; height: auto  !important; } #article, .page, .contentWrapper {border: none !important; margin: 0px  !important; padding: 0px  !important; font-size: 12pt !important; } .page {background: #fff  !important; } .page, a:link, a:visited {color: #000  !important; } a:link, a:visited {color: #520  !important; background: transparent !important; /*opt*/ text-decoration: underline !important; } .content a:link:after, .content a:visited:after {/*opt*/ content: " (" attr(href) ") " !important; font-size: 80% !important; color: #853  !important; } .page:last-of-type .articleInfo {display: block  !important; } .page .pageNumber {float: none !important; background: #fafafa !important; color: #000 !important; border: solid 2px #eee !important; border-left: none !important; border-right: none !important; border-radius: 0px !important; margin-top: 15px !important; margin-bottom: 15px !important; } }');
        style.appendChild(styleText);
        var body = document.createElement("DIV");
        body.id = "article";
        body.appendChild(articleTools);


        // /* Apply user-selected styling */
        readability.wholePageCache.dir = readability.getSuggestedDirection(articleTitle.innerHTML);

        if (typeof(readConvertLinksToFootnotes) !== 'undefined' && readConvertLinksToFootnotes === true) {
            readability.convertLinksToFootnotes = true;
        }
        readability.postProcessContent(articleContent);

        /* Glue the structure of our document together. */
        // innerDiv.appendChild(articleTitle);
        var page = articleContent.firstChild;
        page.insertBefore(articleTitle, page.firstChild);
        body.appendChild(articleContent);
        articleContent.appendChild(articleFooter);
        articleFooter.classList.add("page");
        // overlay.appendChild(articleTools);
        // overlay.appendChild(innerDiv);
        body.appendChild(style);

        // if (document.body.shadowRoot !== null){
        //     readability.shadowCache = document.body.shadowRoot.innerHTML;
        // }  
        // var shadow = document.body.createShadowRoot();
        // readability.dom = shadow;
        // shadow.appendChild(body);

        document.body.style.visibility = "hidden";
        picoModal({
            content: body,
            overlayStyles: {
                backgroundColor: 'white',
                height: "100%",
                width: "100%"
                // opacity: 0.99
            }
        }).afterClose(function(modal){
            var styles = document.styleSheets;
            for (var i = 0; i< styles.length; i++){
                if (styles[i].lensDisabled){
                    styles[i].disabled = false;
                }
            }
            document.body.style.visibility = "visible";
            modal.destroy();
        }).afterShow(function(){
            window.scrollTo(0, 0);
            body.focus();
        }).show();


        /* If we're using the Typekit library, select the font */
        // if (readStyle === "style-athelas" || readStyle === "style-apertura") {
        //     readability.useRdbTypekit();
        // }

        if (nextPageLink) {
            // * 
            //  * Append any additional pages after a small timeout so that people
            //  * can start reading without having to wait for this to finish processing.
            //  *
            window.setTimeout(function() {
                readability.appendNextPage(nextPageLink);
            }, 500);
        }

        // /** Smooth scrolling **/
        // document.onkeydown = function(e) {
        //     var code = (window.event) ? event.keyCode : e.keyCode;
        //     if (code === 16) {
        //         readability.reversePageScroll = true;
        //         return;
        //     }

        //     if (code === 32) {
        //         readability.curScrollStep = 0;
        //         var windowHeight = window.innerHeight ? window.innerHeight : (document.documentElement.clientHeight ? document.documentElement.clientHeight : document.body.clientHeight);

        //         if (readability.reversePageScroll) {
        //             readability.scrollTo(readability.scrollTop(), readability.scrollTop() - (windowHeight - 50), 20, 10);
        //         } else {
        //             readability.scrollTo(readability.scrollTop(), readability.scrollTop() + (windowHeight - 50), 20, 10);
        //         }

        //         return false;
        //     }
        // };

        // document.onkeyup = function(e) {
        //     var code = (window.event) ? event.keyCode : e.keyCode;
        //     if (code === 16) {
        //         readability.reversePageScroll = false;
        //         return;
        //     }
        // };
    },

    /**
     * Run any post-process modifications to article content as necessary.
     *
     * @param Element
     * @return void
     **/
    postProcessContent: function(articleContent) {
        // debugger;

        if (readability.convertLinksToFootnotes && !window.location.href.match(/wikipedia\.org/g)) {
            readability.addFootnotes(articleContent);
        }

        // readability.fixImageFloats(articleContent);
    },

    /**
     * Some content ends up looking ugly if the image is too large to be floated.
     * If the image is wider than a threshold (currently 55%), no longer float it,
     * center it instead.
     *
     * @param Element
     * @return void
     **/
    fixImageFloats: function(articleContent) {
        // var imageWidthThreshold = Math.min(articleContent.offsetWidth, 800) * 0.55,
        //     images = articleContent.getElementsByTagName('img');

        // for (var i = 0, il = images.length; i < il; i += 1) {
        //     var image = images[i];

        //     if (image.offsetWidth > imageWidthThreshold) {
        //         image.className += " blockImage";
        //     }
        // }
    },

    /**
     * Get the article tools Element that has buttons like reload, print, email.
     *
     * @return void
     **/
    getArticleTools: function() {
        var articleTools = document.createElement("DIV");
        articleTools.innerHTML = "";

        return articleTools;
    },

    /**
     * retuns the suggested direction of the string
     *
     * @return "rtl" || "ltr"
     **/
    getSuggestedDirection: function(text) {
        function sanitizeText() {
            return text.replace(/@\w+/, "");
        }

        function countMatches(match) {
            var matches = text.match(new RegExp(match, "g"));
            return matches !== null ? matches.length : 0;
        }

        function isRTL() {
            var count_heb = countMatches("[\\u05B0-\\u05F4\\uFB1D-\\uFBF4]");
            var count_arb = countMatches("[\\u060C-\\u06FE\\uFB50-\\uFEFC]");

            // if 20% of chars are Hebrew or Arbic then direction is rtl
            return (count_heb + count_arb) * 100 / text.length > 20;
        }

        text = sanitizeText(text);
        return isRTL() ? "rtl" : "ltr";
    },


    /**
     * Get the article title as an H1.
     *
     * @return void
     **/
    getArticleTitle: function() {
        var curTitle = "",
            origTitle = "";

        try {
            curTitle = origTitle = document.title;

            if (typeof curTitle !== "string") { /* If they had an element with id "title" in their HTML */
                curTitle = origTitle = readability.getInnerText(document.getElementsByTagName('title')[0]);
            }
        } catch (e) {}

        if (curTitle.match(/ [\|\-] /)) {
            curTitle = origTitle.replace(/(.*)[\|\-] .*/gi, '$1');

            if (curTitle.split(' ').length < 3) {
                curTitle = origTitle.replace(/[^\|\-]*[\|\-](.*)/gi, '$1');
            }
        } else if (curTitle.indexOf(': ') !== -1) {
            curTitle = origTitle.replace(/.*:(.*)/gi, '$1');

            if (curTitle.split(' ').length < 3) {
                curTitle = origTitle.replace(/[^:]*[:](.*)/gi, '$1');
            }
        } else if (curTitle.length > 150 || curTitle.length < 15) {
            var hOnes = document.getElementsByTagName('h1');
            if (hOnes.length === 1) {
                curTitle = readability.getInnerText(hOnes[0]);
            }
        }

        curTitle = curTitle.replace(readability.regexps.trim, "");

        if (curTitle.split(' ').length <= 4) {
            curTitle = origTitle;
        }

        var articleTitle = document.createElement("H1");
        articleTitle.innerHTML = curTitle;

        return articleTitle;
    },

    /**
     * Get the footer with the readability mark etc.
     *
     * @return void
     **/
    getArticleFooter: function() {
        var articleFooter = document.createElement("DIV");

        articleFooter.id = "readFooter";
        articleFooter.innerHTML = [
            "<div id='rdb-footer-print'>Excerpted from <cite>" + document.title + "</cite><br />" + window.location.href + "</div>",
            "</div>"
        ].join('');

        return articleFooter;
    },

    /**
     * Prepare the HTML document for readability to scrape it.
     * This includes things like stripping javascript, CSS, and handling terrible markup.
     *
     * @return void
     **/
    prepDocument: function() {
        /**
         * In some cases a body element can't be found (if the HTML is totally hosed for example)
         * so we create a new body node and append it to the document.
         */
        if (document.body === null) {
            var body = document.createElement("body");
            try {
                document.body = body;
            } catch (e) {
                document.documentElement.appendChild(body);
                dbg(e);
            }
        }
    },

    /**
     * For easier reading, convert this document to have footnotes at the bottom rather than inline links.
     * @see http://www.roughtype.com/archives/2010/05/experiments_in.php
     *
     * @return void
     **/
    addFootnotes: function(articleContent) {
        

        var footnotesWrapper = readability['readability-footnotes'],
            articleFootnotes = readability['readability-footnotes-list'];



        if (!footnotesWrapper) {
            footnotesWrapper = document.createElement("DIV");
            readability['readability-footnotes'] = footnotesWrapper;
            footnotesWrapper.id = 'readability-footnotes';
            footnotesWrapper.innerHTML = '<h3>References</h3>';
            footnotesWrapper.style.display = 'none'; /* Until we know we have footnotes, don't show the references block. */

            articleFootnotes = document.createElement('ol');
            articleFootnotes.id = 'readability-footnotes-list';
            readability['readability-footnotes-list'] = articleFootnotes;


            footnotesWrapper.appendChild(articleFootnotes);
            readability.readFooter.appendChild(footnotesWrapper);
        }

        var articleLinks = articleContent.getElementsByTagName('a');
        var linkCount = articleFootnotes.getElementsByTagName('li').length;
        for (var i = 0; i < articleLinks.length; i += 1) {
            var articleLink = articleLinks[i],
                footnoteLink = articleLink.cloneNode(true),
                refLink = document.createElement('a'),
                footnote = document.createElement('li'),
                linkDomain = footnoteLink.host ? footnoteLink.host : document.location.host,
                linkText = readability.getInnerText(articleLink);

            if (articleLink.className && articleLink.className.indexOf('readability-DoNotFootnote') !== -1 || linkText.match(readability.regexps.skipFootnoteLink)) {
                continue;
            }

            linkCount += 1;

            /** Add a superscript reference after the article link */
            refLink.href = '#readabilityFootnoteLink-' + linkCount;
            refLink.innerHTML = '<small><sup>[' + linkCount + ']</sup></small>';
            refLink.className = 'readability-DoNotFootnote';
            try {
                refLink.style.color = 'inherit';
            } catch (e) {} /* IE7 doesn't like inherit. */

            if (articleLink.parentNode.lastChild === articleLink) {
                articleLink.parentNode.appendChild(refLink);
            } else {
                articleLink.parentNode.insertBefore(refLink, articleLink.nextSibling);
            }

            articleLink.id = 'readabilityLink-' + linkCount;
            try {
                articleLink.style.color = 'inherit';
            } catch (err) {} /* IE7 doesn't like inherit. */

            footnote.innerHTML = "<small><sup><a href='#readabilityLink-" + linkCount + "' title='Jump to Link in Article'>^</a></sup></small> ";

            footnoteLink.innerHTML = (footnoteLink.title ? footnoteLink.title : linkText);
            footnoteLink.id = 'readabilityFootnoteLink-' + linkCount;

            footnote.appendChild(footnoteLink);
            footnote.innerHTML = footnote.innerHTML + "<small> (" + linkDomain + ")</small>";

            articleFootnotes.appendChild(footnote);
        }

        if (linkCount > 0) {
            footnotesWrapper.style.display = 'block';
        }
    },

    // useRdbTypekit: function() {
    //     var rdbHead = document.getElementsByTagName('head')[0];
    //     var rdbTKScript = document.createElement('script');
    //     var rdbTKCode = null;

    //     var rdbTKLink = document.createElement('a');
    //     rdbTKLink.setAttribute('class', 'rdbTK-powered');
    //     rdbTKLink.setAttribute('title', 'Fonts by Typekit');
    //     rdbTKLink.innerHTML = "Fonts by <span class='rdbTK'>Typekit</span>";

    //     if (readStyle === "style-athelas") {
    //         rdbTKCode = "sxt6vzy";
    //         dbg("Using Athelas Theme");

    //         rdbTKLink.setAttribute('href', 'http://typekit.com/?utm_source=readability&utm_medium=affiliate&utm_campaign=athelas');
    //         rdbTKLink.setAttribute('id', 'rdb-athelas');
    //         document.getElementById("rdb-footer-right").appendChild(rdbTKLink);
    //     }
    //     if (readStyle === "style-apertura") {
    //         rdbTKCode = "bae8ybu";
    //         dbg("Using Inverse Theme");

    //         rdbTKLink.setAttribute('href', 'http://typekit.com/?utm_source=readability&utm_medium=affiliate&utm_campaign=inverse');
    //         rdbTKLink.setAttribute('id', 'rdb-inverse');
    //         document.getElementById("rdb-footer-right").appendChild(rdbTKLink);
    //     }

    //     /**
    //      * Setting new script tag attributes to pull Typekits libraries
    //      **/
    //     rdbTKScript.setAttribute('type', 'text/javascript');
    //     rdbTKScript.setAttribute('src', "http://use.typekit.com/" + rdbTKCode + ".js");
    //     rdbTKScript.setAttribute('charset', 'UTF-8');
    //     rdbHead.appendChild(rdbTKScript);

    //     /**
    //      * In the future, maybe try using the following experimental Callback function?:
    //      * http://gist.github.com/192350
    //      * &
    //      * http://getsatisfaction.com/typekit/topics/support_a_pre_and_post_load_callback_function
    //      **/
    //     var typekitLoader = function() {
    //         dbg("Looking for Typekit.");
    //         if (typeof Typekit !== "undefined") {
    //             try {
    //                 dbg("Caught typekit");
    //                 Typekit.load();
    //                 clearInterval(window.typekitInterval);
    //             } catch (e) {
    //                 dbg("Typekit error: " + e);
    //             }
    //         }
    //     };

    //     window.typekitInterval = window.setInterval(typekitLoader, 100);
    // },

    /**
     * Prepare the article node for display. Clean out any inline styles,
     * iframes, forms, strip extraneous <p> tags, etc.
     *
     * @param Element
     * @return void
     **/
    prepArticle: function(articleContent) {
        // readability.cleanStyles(articleContent);
        // readability.killBreaks(articleContent);

        /* Clean out junk from the article content */
        readability.cleanConditionally(articleContent, "form");
        readability.clean(articleContent, "object");
        readability.clean(articleContent, "h1");

        /**
         * If there is only one h2, they are probably using it
         * as a header and not a subheader, so remove it since we already have a header.
         ***/
        // if (articleContent.getElementsByTagName('h2').length === 1) {
        //     readability.clean(articleContent, "h2");
        // }
        // readability.clean(articleContent, "iframe");

        readability.cleanHeaders(articleContent);

        /* Do these last as the previous stuff may have removed junk that will affect these */
        readability.cleanConditionally(articleContent, "table");
        readability.cleanConditionally(articleContent, "ul");
        readability.cleanConditionally(articleContent, "div");

        /* Remove extra paragraphs */
        var articleParagraphs = articleContent.getElementsByTagName('p');
        for (var i = articleParagraphs.length - 1; i >= 0; i -= 1) {
            var imgCount = articleParagraphs[i].getElementsByTagName('img').length;
            var embedCount = articleParagraphs[i].getElementsByTagName('embed').length;
            var objectCount = articleParagraphs[i].getElementsByTagName('object').length;

            if (imgCount === 0 && embedCount === 0 && objectCount === 0 && readability.getInnerText(articleParagraphs[i], false) === '') {
                articleParagraphs[i].parentNode.removeChild(articleParagraphs[i]);
            }
        }

        try {
            articleContent.innerHTML = articleContent.innerHTML.replace(/<br[^>]*>\s*<p/gi, '<p');
        } catch (e) {
            dbg("Cleaning innerHTML of breaks failed. This is an IE strict-block-elements bug. Ignoring.: " + e);
        }
    },

    /**
     * Initialize a node with the readability object. Also checks the
     * className/id for special names to add to its score.
     *
     * @param Element
     * @return void
     **/
    initializeNode: function(node) {
        node.readability = {
            "contentScore": 0
        };

        switch (node.tagName) {
            case 'DIV':
                node.readability.contentScore += 5;
                break;

            case 'PRE':
            case 'TD':
            case 'BLOCKQUOTE':
                node.readability.contentScore += 3;
                break;

            case 'ADDRESS':
            case 'OL':
            case 'UL':
            case 'DL':
            case 'DD':
            case 'DT':
            case 'LI':
            case 'FORM':
                node.readability.contentScore -= 3;
                break;

            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6':
            case 'TH':
                node.readability.contentScore -= 5;
                break;
        }

        node.readability.contentScore += readability.getClassWeight(node);
    },
    inCodeBlock: function(node, depth) {
        depth = depth || 10;
        for (var i = 0; node !==null && i < depth && node.parentNode !== null; i+=1){
            if (node.tagName === "PRE" || node.tagName === "CODE") {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    },

    getLargestContent: function(element){
        var text = "";
        var container = document.createElement("DIV");
        var children = [];
        var min_length = 500;
        var length = 0;

        element.textContent.split(/\n{4,}/g).forEach(function(el){
            el = el.replace(/\s+/g," ");
            if(el.length > min_length){
                container.innerHTML = el;
                children = container.children;
                for (var i = children.length-1; i >= 0 ; i--) {
                    if (children[i].tagName.search(readability.stripFromText) !== -1){
                        container.removeChild(children[i]);
                    }
                }
                el = container.textContent;
                if (el.length > length){
                    text = el;
                }
            }
        });
        return text;
    },

    /***
     * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
     *               most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
     *
     * @param page a document to run upon. Needs to be a full document, complete with body.
     * @return Element
     **/
    grabArticle: function(page) {

        var stripUnlikelyCandidates = readability.flagIsActive(readability.FLAG_STRIP_UNLIKELYS),
            isPaging = (page !== null) ? true : false;

        page = page ? page : document.body;

        var pageCacheHtml = page.innerHTML;

        var allElements = page.getElementsByTagName('*');

        /**
         * First, node prepping. Trash nodes that look cruddy (like ones with the class name "comment", etc), and turn divs
         * into P tags where they have been used inappropriately (as in, where they contain no other block level elements.)
         *
         * Note: Assignment from index for performance. See http://www.peachpit.com/articles/article.aspx?p=31567&seqNum=5
         * Then again js engines are getting highly unpredictable
         **/
        var node = null;
        var nodesToScore = [];

        for (var nodeIndex = 0; (node = allElements[nodeIndex]); nodeIndex += 1) {
            /* Remove unlikely candidates */
            if (stripUnlikelyCandidates) {
                var unlikelyMatchString = node.className +" "+ node.id ;
                // class/id in unlikelyCandidates  but not in okMaybeItsACandidate
                if (
                    unlikelyMatchString.search(readability.regexps.unlikelyCandidates) !== -1 &&
                    unlikelyMatchString.search(readability.regexps.okMaybeItsACandidate) === -1 &&
                    node.tagName !== "BODY"
                ) {
                    dbg("Removing unlikely candidate - " + unlikelyMatchString);
                    if (node.parentNode !== null && !readability.inCodeBlock(node)){
                        node.parentNode.removeChild(node);
                        nodeIndex -= 1;
                        continue;
                    }
                }
            }

            if (node.tagName === "P" || node.tagName === "TD" || node.tagName === "PRE") {
                nodesToScore[nodesToScore.length] = node;
            }

            /* Turn all divs that don't have children block level elements into p's */
            if (node.tagName === "DIV") {
                if (node.innerHTML.search(readability.regexps.divToPElements) === -1) {
                    var newNode = document.createElement('p');
                    try {
                        newNode.innerHTML = node.innerHTML;
                        node.parentNode.replaceChild(newNode, node);
                        nodeIndex -= 1;

                        nodesToScore[nodesToScore.length] = node;
                    } catch (e) {
                        dbg("Could not alter div to p, probably an IE restriction, reverting back to div.: " + e);
                    }
                } else {
                    /* EXPERIMENTAL */
                    // for (var i = 0, il = node.childNodes.length; i < il; i += 1) {
                    //     var childNode = node.childNodes[i];
                    //     if (childNode.nodeType === 3) { // Node.TEXT_NODE
                    //         var p = document.createElement('p');
                    //         p.innerHTML = childNode.nodeValue;
                    //         p.style.display = 'inline';
                    //         p.className = 'readability-styled';
                    //         childNode.parentNode.replaceChild(p, childNode);
                    //     }
                    // }
                }
            }
        }

        var beforeLength = 0;
        [].slice.call(page.querySelectorAll("p,td,pre")).forEach(function(el){
            beforeLength += el.textContent.length;
        });
        if (beforeLength< 300) {
            info("beforeLength is smaller than 300, stopping");
            info(beforeLength);
            return;
        }
        /**
         * Loop through all paragraphs, and assign a score to them based on how content-y they look.
         * Then add their score to their parent node.
         *
         * A score is determined by things like number of commas, class names, etc. Maybe eventually link density.
         **/
        var candidates = [];
        for (var pt = 0; pt < nodesToScore.length; pt += 1) {
            var parentNode = nodesToScore[pt].parentNode;
            var grandParentNode = parentNode ? parentNode.parentNode : null;
            var innerText = readability.getInnerText(nodesToScore[pt]);

            if (!parentNode || typeof(parentNode.tagName) === 'undefined') {
                continue;
            }

            /* If this paragraph is less than 25 characters, don't even count it. */
            if (innerText.length < 25) {
                continue;
            }

            /* Initialize readability data for the parent. */
            if (typeof parentNode.readability === 'undefined') {
                readability.initializeNode(parentNode);
                candidates.push(parentNode);
            }

            /* Initialize readability data for the grandparent. */
            if (grandParentNode && typeof(grandParentNode.readability) === 'undefined' && typeof(grandParentNode.tagName) !== 'undefined') {
                readability.initializeNode(grandParentNode);
                candidates.push(grandParentNode);
            }

            var contentScore = 0;

            /* Add a point for the paragraph itself as a base. */
            contentScore += 1;

            /* Add points for any commas within this paragraph */
            contentScore += innerText.split(',').length;

            /* For every 100 characters in this paragraph, add another point. Up to 3 points. */
            contentScore += Math.min(Math.floor(innerText.length / 100), 3);

            /* Add the score to the parent. The grandparent gets half. */
            parentNode.readability.contentScore += contentScore;

            if (grandParentNode) {
                grandParentNode.readability.contentScore += contentScore / 2;
            }
        }

        /**
         * After we've calculated scores, loop through all of the possible candidate nodes we found
         * and find the one with the highest score.
         **/
        var topCandidate = null;
        for (var c = 0, cl = candidates.length; c < cl; c += 1) {
            /**
             * Scale the final candidates score based on link density. Good content should have a
             * relatively small link density (5% or less) and be mostly unaffected by this operation.
             **/
            candidates[c].readability.contentScore = candidates[c].readability.contentScore * (1 - readability.getLinkDensity(candidates[c]));

            // dbg('Candidate: ' + candidates[c] + " (" + candidates[c].className + ":" + candidates[c].id + ") with score " + candidates[c].readability.contentScore);

            if (!topCandidate || candidates[c].readability.contentScore > topCandidate.readability.contentScore) {
                topCandidate = candidates[c];
            }
        }

        /**
         * If we still have no top candidate, just use the body as a last resort.
         * We also have to copy the body node so it is something we can modify.
         **/
        if (topCandidate === null || topCandidate.tagName === "BODY") {
            topCandidate = document.createElement("DIV");
            topCandidate.innerHTML = page.innerHTML;
            page.innerHTML = "";
            page.appendChild(topCandidate);
            readability.initializeNode(topCandidate);
        }

        /**
         * Now that we have the top candidate, look through its siblings for content that might also be related.
         * Things like preambles, content split by ads that we removed, etc.
         **/
        var articleContent = document.createElement("DIV");
        readability["readability-content"] = articleContent;
        if (isPaging) {
            articleContent.id = "readability-content";
        }
        var siblingScoreThreshold = Math.max(10, topCandidate.readability.contentScore * 0.2);
        var siblingNodes = topCandidate.parentNode.childNodes;


        for (var s = 0, sl = siblingNodes.length; s < sl; s += 1) {
            var siblingNode = siblingNodes[s];
            var append = false;

            /**
             * Fix for odd IE7 Crash where siblingNode does not exist even though this should be a live nodeList.
             * Example of error visible here: http://www.esquire.com/features/honesty0707
             **/
            if (!siblingNode) {
                continue;
            }

            dbg("Looking at sibling node: " + siblingNode + " (" + siblingNode.className + ":" + siblingNode.id + ")" + ((typeof siblingNode.readability !== 'undefined') ? (" with score " + siblingNode.readability.contentScore) : ''));
            dbg("Sibling has score " + (siblingNode.readability ? siblingNode.readability.contentScore : 'Unknown'));

            if (siblingNode === topCandidate) {
                append = true;
            }

            var contentBonus = 0;
            /* Give a bonus if sibling nodes and top candidates have the example same classname */
            if (siblingNode.className === topCandidate.className && topCandidate.className !== "") {
                contentBonus += topCandidate.readability.contentScore * 0.2;
            }

            if (typeof siblingNode.readability !== 'undefined' && (siblingNode.readability.contentScore + contentBonus) >= siblingScoreThreshold) {
                append = true;
            }

            if (siblingNode.nodeName === "P") {
                var linkDensity = readability.getLinkDensity(siblingNode);
                var nodeContent = readability.getInnerText(siblingNode);
                var nodeLength = nodeContent.length;

                if (nodeLength > 80 && linkDensity < 0.25) {
                    append = true;
                } else if (nodeLength < 80 && linkDensity === 0 && nodeContent.search(/\.( |$)/) !== -1) {
                    append = true;
                }
            }

            if (append) {
                dbg("Appending node: " + siblingNode);

                var nodeToAppend = null;
                if (siblingNode.nodeName !== "DIV" && siblingNode.nodeName !== "P") {
                    /* We have a node that isn't a common block level element, like a form or td tag. Turn it into a div so it doesn't get filtered out later by accident. */

                    dbg("Altering siblingNode of " + siblingNode.nodeName + ' to div.');
                    nodeToAppend = document.createElement("DIV");
                    try {
                        nodeToAppend.id = siblingNode.id;
                        nodeToAppend.innerHTML = siblingNode.innerHTML;
                    } catch (er) {
                        dbg("Could not alter siblingNode to div, probably an IE restriction, reverting back to original.");
                        nodeToAppend = siblingNode;
                        s -= 1;
                        sl -= 1;
                    }
                } else {
                    nodeToAppend = siblingNode;
                    s -= 1;
                    sl -= 1;
                }

                /* To ensure a node does not interfere with readability styles, remove its classnames */
                nodeToAppend.className = "";

                /* Append sibling and subtract from our list because it removes the node when you append to another node */
                articleContent.appendChild(nodeToAppend);
            }
        }

        /**
         * So we have all of the content that we need. Now we clean it up for presentation.
         **/
        readability.prepArticle(articleContent);

        if (readability.curPageNum === 1) {
            articleContent.innerHTML = '<div id="readability-page-1" class="page">' + articleContent.innerHTML + '</div>';
        }

        /**
         * Now that we've gone through the full algorithm, check to see if we got any meaningful content.
         * If we didn't, we may need to re-run grabArticle with different flags set. This gives us a higher
         * likelihood of finding the content, and the sieve approach gives us a higher likelihood of
         * finding the -right- content.
         **/

        var afterLength = 0;
        [].slice.call(articleContent.querySelectorAll("p,td,pre")).forEach(function(el){
            afterLength += el.textContent.length;
        });
        info("Article before, after, ratio: "+ beforeLength + ", " + afterLength + ", " + afterLength/beforeLength);

        if (afterLength < 250 || afterLength/beforeLength < 0.65) {
            page.innerHTML = pageCacheHtml;
            // if (readability.flagIsActive(readability.FLAG_STRIP_UNLIKELYS)) {
            //     readability.removeFlag(readability.FLAG_STRIP_UNLIKELYS);
            //     if(readability.curPageNum === 1){
            //         localStorage.setItem("lens-flag-GH3UEgL6CbcpK4hNtQeR8Fc", readability.flags);
            //     }
            //     return readability.grabArticle(page);
            // } else if (readability.flagIsActive(readability.FLAG_WEIGHT_CLASSES)) {
            //     readability.removeFlag(readability.FLAG_WEIGHT_CLASSES);
            //     if(readability.curPageNum === 1){
            //         localStorage.setItem("lens-flag-GH3UEgL6CbcpK4hNtQeR8Fc", readability.flags);
            //     }
            //     return readability.grabArticle(page);
            // } else 
            // if (readability.flagIsActive(readability.FLAG_CLEAN_CONDITIONALLY)) {
            //     readability.removeFlag(readability.FLAG_CLEAN_CONDITIONALLY);
            //     if(readability.curPageNum === 1){
            //         localStorage.setItem("lens-flag-GH3UEgL6CbcpK4hNtQeR8Fc", readability.flags);
            //     }
            //     return readability.grabArticle(page);
            // }
            // else {
            //     if(readability.curPageNum === 1){
            //         // TODO - turn off for the whole domain or just the host/path?
            //         localStorage.setItem("lens-works-GH3UEgL6CbcpK4hNtQeR8Fc", "n");
            //     }
            //     return null;
            // }
            return null;

        }

        return articleContent;
    },
    getEditDistance: function(a, b){
      var total = Math.abs(a.length - b.length);
      for (var i = 0; i < Math.min(a.length, b.length); i++){
        if (a[i]!=b[i]) {
            total++;
        }
      }
      return total;
    },

    /**
     * Removes script tags from the document.
     *
     * @param Element
     **/
    removeScripts: function(element) {
        var scripts = element.querySelectorAll('script,style,link,noscript');
        for (var i = scripts.length - 1; i >= 0; i -= 1) {
            scripts[i].nodeValue = "";
            scripts[i].removeAttribute('src');
            scripts[i].removeAttribute('rel');
            scripts[i].removeAttribute('href');
            if (scripts[i].parentNode) {
                scripts[i].parentNode.removeChild(scripts[i]);
            }
        }
    },

    /**
     * Get the inner text of a node - cross browser compatibly.
     * This also strips out any excess whitespace to be found.
     *
     * @param Element
     * @return string
     **/
    getInnerText: function(e, normalizeSpaces) {
        var textContent = "";

        if (typeof(e.textContent) === "undefined" && typeof(e.innerText) === "undefined") {
            return "";
        }

        normalizeSpaces = (typeof normalizeSpaces === 'undefined') ? true : normalizeSpaces;

        if (navigator.appName === "Microsoft Internet Explorer") {
            textContent = e.innerText.replace(readability.regexps.trim, "");
        } else {
            textContent = e.textContent.replace(readability.regexps.trim, "");
        }

        if (normalizeSpaces) {
            return textContent.replace(readability.regexps.normalize, " ");
        } else {
            return textContent;
        }
    },

    /**
     * Get the number of times a string s appears in the node e.
     *
     * @param Element
     * @param string - what to split on. Default is ","
     * @return number (integer)
     **/
    getCharCount: function(e, s) {
        s = s || ",";
        return readability.getInnerText(e).split(s).length - 1;
    },

    /**
     * Remove the style attribute on every e and under.
     * TODO: Test if getElementsByTagName(*) is faster.
     *
     * @param Element
     * @return void
     **/
    cleanStyles: function(e) {
        e = e || document;
        var cur = e.firstChild;

        if (!e) {
            return;
        }

        // Remove any root styles, if we're able.
        if (typeof e.removeAttribute === 'function' && e.className !== 'readability-styled') {
            e.removeAttribute('style');
        }

        // Go until there are no more child nodes
        while (cur !== null) {
            if (cur.nodeType === 1) {
                // Remove style attribute(s) :
                if (cur.className !== "readability-styled") {
                    cur.removeAttribute("style");
                }
                readability.cleanStyles(cur);
            }
            cur = cur.nextSibling;
        }
    },

    /**
     * Get the density of links as a percentage of the content
     * This is the amount of text that is inside a link divided by the total text in the node.
     *
     * @param Element
     * @return number (float)
     **/
    getLinkDensity: function(e) {
        var links = e.getElementsByTagName("a");
        var textLength = readability.getInnerText(e).length;
        var linkLength = 0;
        for (var i = 0, il = links.length; i < il; i += 1) {
            linkLength += readability.getInnerText(links[i]).length;
        }

        return linkLength / textLength;
    },

    /**
     * Find a cleaned up version of the current URL, to use for comparing links for possible next-pageyness.
     *
     * @author Dan Lacy
     * @return string the base url
     **/
    findBaseUrl: function() {
        var noUrlParams = window.location.pathname.split("?")[0],
            urlSlashes = noUrlParams.split("/").reverse(),
            cleanedSegments = [],
            possibleType = "";

        for (var i = 0, slashLen = urlSlashes.length; i < slashLen; i += 1) {
            var segment = urlSlashes[i];

            // Split off and save anything that looks like a file type.
            if (segment.indexOf(".") !== -1) {
                possibleType = segment.split(".")[1];

                /* If the type isn't alpha-only, it's probably not actually a file extension. */
                if (!possibleType.match(/[^a-zA-Z]/)) {
                    segment = segment.split(".")[0];
                }
            }

            /**
             * EW-CMS specific segment replacement. Ugly.
             * Example: http://www.ew.com/ew/article/0,,20313460_20369436,00.html
             **/
            if (segment.indexOf(',00') !== -1) {
                segment = segment.replace(',00', '');
            }

            // If our first or second segment has anything looking like a page number, remove it.
            if (segment.match(/((_|-)?p[a-z]*|(_|-))[0-9]{1,2}$/i) && ((i === 1) || (i === 0))) {
                segment = segment.replace(/((_|-)?p[a-z]*|(_|-))[0-9]{1,2}$/i, "");
            }


            var del = false;

            /* If this is purely a number, and it's the first or second segment, it's probably a page number. Remove it. */
            if (i < 2 && segment.match(/^\d{1,2}$/)) {
                del = true;
            }

            /* If this is the first segment and it's just "index", remove it. */
            if (i === 0 && segment.toLowerCase() === "index") {
                del = true;
            }

            /* If our first or second segment is smaller than 3 characters, and the first segment was purely alphas, remove it. */
            if (i < 2 && segment.length < 3 && !urlSlashes[0].match(/[a-z]/i)) {
                del = true;
            }

            /* If it's not marked for deletion, push it to cleanedSegments. */
            if (!del) {
                cleanedSegments.push(segment);
            }
        }

        // This is our final, cleaned, base article URL.
        return window.location.protocol + "//" + window.location.host + cleanedSegments.reverse().join("/");
    },

    /**
     * Look for any paging links that may occur within the document.
     *
     * @param body
     * @return object (array)
     **/
    findNextPageLink: function(elem) {
        var possiblePages = {},
            allLinks = elem.getElementsByTagName('a'),
            articleBaseUrl = readability.findBaseUrl();

        /**
         * Loop through all links, looking for hints that they may be next-page links.
         * Things like having "page" in their textContent, className or id, or being a child
         * of a node with a page-y className or id.
         *
         * Also possible: levenshtein distance? longest common subsequence?
         *
         * After we do that, assign each page a score, and
         **/
        for (var i = 0, il = allLinks.length; i < il; i += 1) {
            var link = allLinks[i],
                linkHref = allLinks[i].href.replace(/#.*$/, '').replace(/\/$/, '');

            /* If we've already seen this page, ignore it */
            if (linkHref === "" || linkHref === articleBaseUrl || linkHref === window.location.href || linkHref in readability.parsedPages) {
                continue;
            }

            /* If it's on a different domain, skip it. */
            if (window.location.host !== linkHref.split(/\/+/g)[1]) {
                continue;
            }

            var linkText = readability.getInnerText(link);

            /* If the linkText looks like it's not the next page, skip it. */
            if (linkText.match(readability.regexps.extraneous) || linkText.length > 25) {
                continue;
            }

            /* If the leftovers of the URL after removing the base URL don't contain any digits, it's certainly not a next page link. */
            var linkHrefLeftover = linkHref.replace(articleBaseUrl, '');
            if (!linkHrefLeftover.match(/\d/)) {
                continue;
            }
            var editDistance = readability.getEditDistance(linkHref, articleBaseUrl);
            if (editDistance > 15){
                continue;
            }

            if (!(linkHref in possiblePages)) {
                possiblePages[linkHref] = {
                    "score": 0,
                    "linkText": linkText,
                    "href": linkHref
                };
            } else {
                possiblePages[linkHref].linkText += ' | ' + linkText;
            }

            var linkObj = possiblePages[linkHref];

            /**
             * If the articleBaseUrl isn't part of this URL, penalize this link. It could still be the link, but the odds are lower.
             * Example: http://www.actionscript.org/resources/articles/745/1/JavaScript-and-VBScript-Injection-in-ActionScript-3/Page1.html
             **/
            if (linkHref.indexOf(articleBaseUrl) !== 0) {
                linkObj.score -= 25;
            }

            var linkData = linkText + ' ' + link.className + ' ' + link.id;
            if (linkData.match(readability.regexps.nextLink)) {
                linkObj.score += 50;
            }
            if (linkData.match(/pag(e|ing|inat)/i)) {
                linkObj.score += 25;
            }
            if (linkData.match(/(first|last)/i)) { // -65 is enough to negate any bonuses gotten from a > or » in the text, 
                /* If we already matched on "next", last is probably fine. If we didn't, then it's bad. Penalize. */
                if (!linkObj.linkText.match(readability.regexps.nextLink)) {
                    linkObj.score -= 65;
                }
            }
            if (linkData.match(readability.regexps.negative) || linkData.match(readability.regexps.extraneous)) {
                linkObj.score -= 50;
            }
            if (linkData.match(readability.regexps.prevLink)) {
                linkObj.score -= 200;
            }

            // linkObj.score += 50 - readability.getEditDistance(linkHref, articleBaseUrl);

            /* If a parentNode contains page or paging or paginat */
            var parentNode = link.parentNode,
                positiveNodeMatch = false,
                negativeNodeMatch = false;
            while (parentNode) {
                var parentNodeClassAndId = parentNode.className + ' ' + parentNode.id;
                if (!positiveNodeMatch && parentNodeClassAndId && parentNodeClassAndId.match(/pag(e|ing|inat)/i)) {
                    positiveNodeMatch = true;
                    linkObj.score += 25;
                }
                if (!negativeNodeMatch && parentNodeClassAndId && parentNodeClassAndId.match(readability.regexps.negative)) {
                    /* If this is just something like "footer", give it a negative. If it's something like "body-and-footer", leave it be. */
                    if (!parentNodeClassAndId.match(readability.regexps.positive)) {
                        linkObj.score -= 25;
                        negativeNodeMatch = true;
                    }
                }

                parentNode = parentNode.parentNode;
            }

            /**
             * If the URL looks like it has paging in it, add to the score.
             * Things like /page/2/, /pagenum/2, ?p=3, ?page=11, ?pagination=34
             **/
            if (linkHref.match(/p(a|g|ag)?(e|ing|ination)?(=|\/)[0-9]{1,2}/i) || linkHref.match(/(page|paging)/i)) {
                linkObj.score += 25;
            }

            /* If the URL contains negative values, give a slight decrease. */
            if (linkHref.match(readability.regexps.extraneous)) {
                linkObj.score -= 15;
            }

            /**
             * Minor punishment to anything that doesn't match our current URL.
             * NOTE: I'm finding this to cause more harm than good where something is exactly 50 points.
             *       Dan, can you show me a counterexample where this is necessary?
             * if (linkHref.indexOf(window.location.href) !== 0) {
             *    linkObj.score -= 1;
             * }
             **/

            /**
             * If the link text can be parsed as a number, give it a minor bonus, with a slight
             * bias towards lower numbered pages. This is so that pages that might not have 'next'
             * in their text can still get scored, and sorted properly by score.
             **/
            var linkTextAsNumber = parseInt(linkText, 10);
            if (linkTextAsNumber) {
                // Punish 1 since we're either already there, or it's probably before what we want anyways.
                if (linkTextAsNumber === 1) {
                    linkObj.score -= 10;
                } else {
                    // Todo: Describe this better
                    linkObj.score += Math.max(0, 10 - linkTextAsNumber);
                }
            }
        }

        /**
         * Loop thrugh all of our possible pages from above and find our top candidate for the next page URL.
         * Require at least a score of 50, which is a relatively high confidence that this page is the next link.
         **/
        var topPage = null;
        for (var page in possiblePages) {
            if (possiblePages.hasOwnProperty(page)) {
                if (possiblePages[page].score >= 50 && (!topPage || topPage.score < possiblePages[page].score)) {
                    topPage = possiblePages[page];
                }
            }
        }

        if (topPage) {
            var nextHref = topPage.href.replace(/\/$/, '');

            info('NEXT PAGE IS ' + nextHref);
            readability.parsedPages[nextHref] = true;
            return nextHref;
        } else {
            return null;
        }
    },

    /**
     * Build a simple cross browser compatible XHR.
     *
     * TODO: This could likely be simplified beyond what we have here right now. There's still a bit of excess junk.
     **/
    xhr: function() {
        if (typeof XMLHttpRequest !== 'undefined' && (window.location.protocol !== 'file:' || !window.ActiveXObject)) {
            return new XMLHttpRequest();
        } else {
            try {
                return new ActiveXObject('Msxml2.XMLHTTP.6.0');
            } catch (sixerr) {}
            try {
                return new ActiveXObject('Msxml2.XMLHTTP.3.0');
            } catch (threrr) {}
            try {
                return new ActiveXObject('Msxml2.XMLHTTP');
            } catch (err) {}
        }

        return false;
    },

    successfulRequest: function(request) {
        return (request.status >= 200 && request.status < 300) || request.status === 304 || (request.status === 0 && request.responseText);
    },

    ajax: function(url, options) {
        var request = readability.xhr();

        function respondToReadyState(readyState) {
            if (request.readyState === 4) {
                if (readability.successfulRequest(request)) {
                    if (options.success) {
                        options.success(request);
                    }
                } else {
                    if (options.error) {
                        options.error(request);
                    }
                }
            }
        }

        if (typeof options === 'undefined') {
            options = {};
        }

        request.onreadystatechange = respondToReadyState;

        request.open('get', url, true);
        request.setRequestHeader('Accept', 'text/html');

        try {
            request.send(options.postBody);
        } catch (e) {
            if (options.error) {
                options.error();
            }
        }

        return request;
    },

    /**
     * Make an AJAX request for each page and append it to the document.
     **/
    curPageNum: 1,

    appendNextPage: function(nextPageLink) {
        readability.curPageNum += 1;
        var articlePage = document.createElement("DIV");
        articlePage.id = 'readability-page-' + readability.curPageNum;
        articlePage.className = 'page';
        articlePage.innerHTML = '<div><p class="page-separator" title="Page ' + readability.curPageNum + '"></p>';

        readability["readability-content"].insertBefore(articlePage, readability["readability-content"].lastChild);


        if (readability.curPageNum > readability.maxPages) {
            var nextPageMarkup = "<div style='text-align: center'><a href='" + nextPageLink + "'>View Next Page</a></div>";

            articlePage.innerHTML = articlePage.innerHTML + nextPageMarkup;
            return;
        }

        /**
         * Now that we've built the article page DOM element, get the page content
         * asynchronously and load the cleaned content into the div we created for it.
         **/
        (function(pageUrl, thisPage) {
            readability.ajax(pageUrl, {
                success: function(r) {

                    /* First, check to see if we have a matching ETag in headers - if we do, this is a duplicate page. */
                    var eTag = r.getResponseHeader('ETag');
                    if (eTag) {
                        if (eTag in readability.pageETags) {
                            dbg("Exact duplicate page found via ETag. Aborting.");
                            articlePage.style.display = 'none';
                            return;
                        } else {
                            readability.pageETags[eTag] = 1;
                        }
                    }

                    // TODO: this ends up doubling up page numbers on NYTimes articles. Need to generically parse those away.
                    var html = document.createElement("HTML");

                    /**
                     * Do some preprocessing to our HTML to make it ready for appending.
                     * • Remove any script tags. Swap and reswap newlines with a unicode character because multiline regex doesn't work in javascript.
                     * • Turn any noscript tags into divs so that we can parse them. This allows us to find any next page links hidden via javascript.
                     * • Turn all double br's into p's - was handled by prepDocument in the original view.
                     *   Maybe in the future abstract out prepDocument to work for both the original document and AJAX-added pages.
                     **/
                    html.innerHTML = r.responseText;
                    var page = html.querySelector("body");

                    /**
                     * Reset all flags for the next page, as they will search through it and disable as necessary at the end of grabArticle.
                     **/
                    readability.flags = 0x1 | 0x2 | 0x4;
                    readability.removeScripts(page);

                    var nextPageLink = readability.findNextPageLink(page),
                        content = readability.grabArticle(page);
                    info("Content");
                    info(content);

                    readability.nextPageLink = nextPageLink;

                    if (!content) {
                        info("No content found in page to append. Aborting. "+ pageUrl);
                        return;
                    }

                    /**
                     * Anti-duplicate mechanism. Essentially, get the first paragraph of our new page.
                     * Compare it against all of the the previous document's we've gotten. If the previous
                     * document contains exactly the innerHTML of this first paragraph, it's probably a duplicate.
                     **/
                    // var firstP = content.getElementsByTagName("P").length ? content.getElementsByTagName("P")[0] : null;
                    // if (firstP && firstP.innerHTML.length > 100) {
                    //     for (var i = 1; i <= readability.curPageNum; i += 1) {
                    //         var rPage = document.getElementById('readability-page-' + i);
                    //         if (rPage && rPage.innerHTML.indexOf(firstP.innerHTML) !== -1) {
                    //             dbg('Duplicate of page ' + i + ' - skipping.');
                    //             articlePage.style.display = 'none';
                    //             readability.parsedPages[pageUrl] = true;
                    //             return;
                    //         }
                    //     }
                    // }

                    

                    thisPage.innerHTML = thisPage.innerHTML + content.innerHTML;

                    /**
                     * After the page has rendered, post process the content. This delay is necessary because,
                     * in webkit at least, offsetWidth is not set in time to determine image width. We have to
                     * wait a little bit for reflow to finish before we can fix floating images.
                     **/
                    window.setTimeout(
                        function() {
                            readability.postProcessContent(thisPage);
                            dbg("CALLED POST PROCESS");
                        },
                        500
                    );

                    if (nextPageLink) {
                        readability.appendNextPage(nextPageLink);
                    }
                }
            });
        }(nextPageLink, articlePage));
    },

    /**
     * Get an elements class/id weight. Uses regular expressions to tell if this
     * element looks good or bad.
     *
     * @param Element
     * @return number (Integer)
     **/
    getClassWeight: function(e) {
        if (!readability.flagIsActive(readability.FLAG_WEIGHT_CLASSES)) {
            return 0;
        }

        var weight = 0;

        /* Look for a special classname */
        if (typeof(e.className) === 'string' && e.className !== '') {
            if (e.className.search(readability.regexps.negative) !== -1) {
                weight -= 25;
            }

            if (e.className.search(readability.regexps.positive) !== -1) {
                weight += 25;
            }
        }

        /* Look for a special ID */
        if (typeof(e.id) === 'string' && e.id !== '') {
            if (e.id.search(readability.regexps.negative) !== -1) {
                weight -= 25;
            }

            if (e.id.search(readability.regexps.positive) !== -1) {
                weight += 25;
            }
        }

        return weight;
    },

    nodeIsVisible: function(node) {
        return (node.offsetWidth !== 0 || node.offsetHeight !== 0) && node.style.display.toLowerCase() !== 'none';
    },

    /**
     * Remove extraneous break tags from a node.
     *
     * @param Element
     * @return void
     **/
    killBreaks: function(e) {
        try {
            e.innerHTML = e.innerHTML.replace(readability.regexps.killBreaks, '<br />');
        } catch (eBreaks) {
            dbg("KillBreaks failed - this is an IE bug. Ignoring.: " + eBreaks);
        }
    },

    /**
     * Clean a node of all elements of type "tag".
     * (Unless it's a youtube/vimeo video. People love movies.)
     *
     * @param Element
     * @param string tag to clean
     * @return void
     **/
    clean: function(e, tag) {
        var targetList = e.getElementsByTagName(tag);
        var isEmbed = (tag === 'object' || tag === 'embed' || tag === 'iframe');

        for (var y = targetList.length - 1; y >= 0; y -= 1) {
            /* Allow youtube and vimeo videos through as people usually want to see those. */
            if (isEmbed) {
                var attributeValues = "";
                for (var i = 0, il = targetList[y].attributes.length; i < il; i += 1) {
                    attributeValues += targetList[y].attributes[i].value + '|';
                }

                /* First, check the elements attributes to see if any of them contain youtube or vimeo */
                if (attributeValues.search(readability.regexps.videos) !== -1) {
                    continue;
                }

                /* Then check the elements inside this element for the same. */
                if (targetList[y].innerHTML.search(readability.regexps.videos) !== -1) {
                    continue;
                }

            }

            targetList[y].parentNode.removeChild(targetList[y]);
        }
    },

    /**
     * Clean an element of all tags of type "tag" if they look fishy.
     * "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
     *
     * @return void
     **/
    cleanConditionally: function(e, tag) {

        if (!readability.flagIsActive(readability.FLAG_CLEAN_CONDITIONALLY)) {
            return;
        }

        var tagsList = e.getElementsByTagName(tag);
        var curTagsLength = tagsList.length;

        /**
         * Gather counts for other typical elements embedded within.
         * Traverse backwards so we can remove nodes at the same time without effecting the traversal.
         *
         * TODO: Consider taking into account original contentScore here.
         **/
        for (var i = curTagsLength - 1; i >= 0; i -= 1) {
            var curTag = tagsList[i];
            var weight = readability.getClassWeight(curTag);
            var contentScore = (typeof curTag.readability !== 'undefined') ? curTag.readability.contentScore : 0;

            dbg("Cleaning Conditionally " + curTag + " (" + curTag.className + ":" + curTag.id + ")" + ((typeof curTag.readability !== 'undefined') ? (" with score " + curTag.readability.contentScore) : ''));
            if (weight + contentScore < 0){
                info("The following tag has negative weight + content score and will be cleaned conditionally. Weight: " + weight + contentScore);
                info(curTag);
            }
            if (weight + contentScore + 2 < 0) {
                curTag.parentNode.removeChild(curTag);
            } else if (readability.getCharCount(curTag, ',') < 10) {
                /**
                 * If there are not very many commas, and the number of
                 * non-paragraph elements is more than paragraphs or other ominous signs, remove the element.
                 **/
                var p = curTag.getElementsByTagName("p").length;
                var img = curTag.getElementsByTagName("img").length;
                var li = curTag.getElementsByTagName("li").length - 100;
                var input = curTag.getElementsByTagName("input").length;

                var embedCount = 0;
                var embeds = curTag.getElementsByTagName("embed");
                for (var ei = 0, il = embeds.length; ei < il; ei += 1) {
                    if (embeds[ei].src.search(readability.regexps.videos) === -1) {
                        embedCount += 1;
                    }
                }

                var linkDensity = readability.getLinkDensity(curTag);
                var contentLength = readability.getInnerText(curTag).length;
                var toRemove = false;

                if (img > p && img > 1) {
                    toRemove = true;
                    info("Cleaning  because img > p");
                    info(curTag);
                } else if (li > p && tag !== "ul" && tag !== "ol") {
                    toRemove = true;
                } else if (input > Math.floor(p / 3)) {
                    toRemove = true;
                } else if (contentLength < 25 && (img === 0 || img > 2)) {
                    toRemove = true;
                } else if (weight < 25 && linkDensity > 0.2) {
                    toRemove = true;
                } else if (weight >= 25 && linkDensity > 0.5) {
                    toRemove = true;
                } else if ((embedCount === 1 && contentLength < 75) || embedCount > 1) {
                    toRemove = true;
                }

                if (toRemove) {
                    curTag.parentNode.removeChild(curTag);
                }
            }
        }
    },

    /**
     * Clean out spurious headers from an Element. Checks things like classnames and link density.
     *
     * @param Element
     * @return void
     **/
    cleanHeaders: function(e) {
        for (var headerIndex = 1; headerIndex < 3; headerIndex += 1) {
            var headers = e.getElementsByTagName('h' + headerIndex);
            for (var i = headers.length - 1; i >= 0; i -= 1) {
                if (readability.getClassWeight(headers[i]) < 0 || readability.getLinkDensity(headers[i]) > 0.33) {
                    headers[i].parentNode.removeChild(headers[i]);
                }
            }
        }
    },

    /*** Smooth scrolling logic ***/

    /**
     * easeInOut animation algorithm - returns an integer that says how far to move at this point in the animation.
     * Borrowed from jQuery's easing library.
     * @return integer
     **/
    easeInOut: function(start, end, totalSteps, actualStep) {
        var delta = end - start;

        if ((actualStep /= totalSteps / 2) < 1) {
            return delta / 2 * actualStep * actualStep + start;
        }
        actualStep -= 1;
        return -delta / 2 * ((actualStep) * (actualStep - 2) - 1) + start;
    },

    /**
     * Helper function to, in a cross compatible way, get or set the current scroll offset of the document.
     * @return mixed integer on get, the result of window.scrollTo on set
     **/
    scrollTop: function(scroll) {
        var setScroll = typeof scroll !== 'undefined';

        if (setScroll) {
            return window.scrollTo(0, scroll);
        }
        if (typeof window.pageYOffset !== 'undefined') {
            return window.pageYOffset;
        } else if (document.documentElement.clientHeight) {
            return document.documentElement.scrollTop;
        } else {
            return document.body.scrollTop;
        }
    },

    /**
     * scrollTo - Smooth scroll to the point of scrollEnd in the document.
     * @return void
     **/
    curScrollStep: 0,
    scrollTo: function(scrollStart, scrollEnd, steps, interval) {
        if (
            (scrollStart < scrollEnd && readability.scrollTop() < scrollEnd) ||
            (scrollStart > scrollEnd && readability.scrollTop() > scrollEnd)
        ) {
            readability.curScrollStep += 1;
            if (readability.curScrollStep > steps) {
                return;
            }

            var oldScrollTop = readability.scrollTop();

            readability.scrollTop(readability.easeInOut(scrollStart, scrollEnd, steps, readability.curScrollStep));

            // We're at the end of the window.
            if (oldScrollTop === readability.scrollTop()) {
                return;
            }

            window.setTimeout(function() {
                readability.scrollTo(scrollStart, scrollEnd, steps, interval);
            }, interval);
        }
    },


    /**
     * Show the email popup.
     *
     * @return void
     **/
    // emailBox: function() {
    //     var emailContainerExists = document.getElementById('email-container');
    //     if (null !== emailContainerExists) {
    //         return;
    //     }

    //     var emailContainer = document.createElement("DIV");
    //     emailContainer.id = 'email-container';
    //     emailContainer.innerHTML = '<iframe src="' + readability.emailSrc + '?pageUrl=' + encodeURIComponent(window.location) + '&pageTitle=' + encodeURIComponent(document.title) + '" scrolling="no" onload="readability.removeFrame()" style="width:500px; height: 490px; border: 0;"></iframe>';

    //     document.body.appendChild(emailContainer);
    // },

    /**
     * Close the email popup. This is a hacktackular way to check if we're in a "close loop".
     * Since we don't have crossdomain access to the frame, we can only know when it has
     * loaded again. If it's loaded over 3 times, we know to close the frame.
     *
     * @return void
     **/
    removeFrame: function() {
        readability.iframeLoads += 1;
        if (readability.iframeLoads > 3) {
            var emailContainer = document.getElementById('email-container');
            if (null !== emailContainer) {
                emailContainer.parentNode.removeChild(emailContainer);
            }

            readability.iframeLoads = 0;
        }
    },

    htmlspecialchars: function(s) {
        if (typeof(s) === "string") {
            s = s.replace(/&/g, "&amp;");
            s = s.replace(/"/g, "&quot;");
            s = s.replace(/'/g, "&#039;");
            s = s.replace(/</g, "&lt;");
            s = s.replace(/>/g, "&gt;");
        }

        return s;
    },

    flagIsActive: function(flag) {
        return (readability.flags & flag) > 0;
    },

    addFlag: function(flag) {
        readability.flags = readability.flags | flag;
    },

    removeFlag: function(flag) {
        readability.flags = readability.flags & ~flag;
    }

};

readability.init();