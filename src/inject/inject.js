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

var dbg = (typeof console !== 'undefined') ? function(s) {
    // console.log("Readability: " + s);
    // console.log.apply(console, arguments);
} : function() {};

var info = (typeof console !== 'undefined') ? function() {
    console.info.apply(console,  arguments);
} : function() {};

var dir = (typeof console !== 'undefined') ? function() {
    console.dir.apply(console,  arguments);
} : function() {};

var readability = {
    convertLinksToFootnotes: true,
    biggestFrame: false,
    wholePageCache: null,
    bodyCache: null,
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
        info("Started Readability~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~" );
        if (/\b(google|facebook|twitter|dropbox|quizlet|youtube)\b/i.test(window.document.location.hostname)) return null;
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

        readability.createBodyIfNeeded();
        
        if(document.body && !readability.bodyCache) {
            readability.wholePageCache = document.cloneNode(true);
            readability.wholePageCache.normalize();
            readability.bodyCache = readability.wholePageCache.querySelector("body");
        }

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

        /* Build readability's DOM tree */
        var style = document.createElement("LINK");
        style.href = chrome.extension.getURL("/css/lens.css");
        style.rel = "stylesheet";
        var body = document.createElement("DIV");
        body.id = "article";
        body.appendChild(articleTools);

        /* Apply user-selected styling */
        // readability.wholePageCache.dir = readability.getSuggestedDirection(articleTitle.innerHTML);

        readability.postProcessContent(articleContent);

        /* Glue the structure of our document together. */
        var page = articleContent.firstChild;
        page.insertBefore(articleTitle, page.firstChild);
        body.appendChild(articleContent);
        articleContent.appendChild(articleFooter);
        articleFooter.classList.add("page");
        body.appendChild(style);


        document.body.style.visibility = "hidden";
        picoModal({
            content: body
        }).afterClose(function(modal){
            style.disabled = true;
            var styles = document.styleSheets;
            for (var i = 0; i< styles.length; i++){
                if (styles[i].lensDisabled){
                    styles[i].disabled = false;
                } else {
                    styles[i].disabled = true;
                }
            }
            document.body.style.visibility = "visible";
            modal.destroy();
        }).afterShow(function(){
            window.scrollTo(0, 0);
            body.focus();
            body.click();
        }).show();

        if (nextPageLink) {
            // * 
            //  * Append any additional pages after a small timeout so that people
            //  * can start reading without having to wait for this to finish processing.
            //  *
            window.setTimeout(function() {
                readability.appendNextPage(nextPageLink);
            }, 0);
        }
    },

    /**
     * Run any post-process modifications to article content as necessary.
     *
     * @param Element
     * @return void
     **/
    postProcessContent: function(articleContent) {
        readability.addFootnotes(articleContent);

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
    // fixImageFloats: function(articleContent) {
        // var imageWidthThreshold = Math.min(articleContent.offsetWidth, 800) * 0.55,
        //     images = articleContent.getElementsByTagName('img');

        // for (var i = 0, il = images.length; i < il; i += 1) {
        //     var image = images[i];

        //     if (image.offsetWidth > imageWidthThreshold) {
        //         image.className += " blockImage";
        //     }
        // }
    // },

    /**
     * Get the article tools Element that has buttons like reload, print, email.
     *
     * @return void
     **/
    getArticleTools: function() {
        var articleTools = document.createElement("DIV");
        articleTools.className = "tools";
        var neverAgain = document.createElement("A");
        neverAgain.className = "lensLink";
        neverAgain.text = "Never on this Domain";

        neverAgain.onclick = function(){
            localStorage.setItem("lens-user-never-again-GH3UEgL6CbcpK4hNtQeR8Fc", "n");
        };
        articleTools.appendChild(neverAgain);

        return articleTools;
    },

    /**
     * retuns the suggested direction of the string
     *
     * @return "rtl" || "ltr"
     **/
    // getSuggestedDirection: function(text) {
    //     function sanitizeText() {
    //         return text.replace(/@\w+/, "");
    //     }

    //     function countMatches(match) {
    //         var matches = text.match(new RegExp(match, "g"));
    //         return matches !== null ? matches.length : 0;
    //     }

    //     function isRTL() {
    //         var count_heb = countMatches("[\\u05B0-\\u05F4\\uFB1D-\\uFBF4]");
    //         var count_arb = countMatches("[\\u060C-\\u06FE\\uFB50-\\uFEFC]");

    //         // if 20% of chars are Hebrew or Arbic then direction is rtl
    //         return (count_heb + count_arb) * 100 / text.length > 20;
    //     }

    //     text = sanitizeText(text);
    //     return isRTL() ? "rtl" : "ltr";
    // },


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
    createBodyIfNeeded: function() {
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

            if(articleLink.className && articleLink.className.indexOf('readability-DoNotFootnote') !== -1 || linkText.match(readability.regexps.skipFootnoteLink)) {
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
        readability.cleanConditionally(articleContent, "input");
        readability.clean(articleContent, "h1");
        // readability.clean(articleContent, "object");

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

        // try {
        //     articleContent.innerHTML = articleContent.innerHTML.replace(/<br[^>]*>\s*<p/gi, '<p');
        // } catch (e) {
        //     dbg("Cleaning innerHTML of breaks failed. This is an IE strict-block-elements bug. Ignoring.: " + e);
        // }
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

        // IMPORTANT
        var siblingScoreThreshold = Math.max(10, topCandidate.readability.contentScore * 0.2);
        var siblingNodes = topCandidate.parentNode.childNodes;


        for (var s = 0, sl = siblingNodes.length; s < sl; s += 1) {
            var siblingNode = siblingNodes[s];
            var append = false;
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

        if (afterLength < 1000 || afterLength/beforeLength < 0.60) {
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
            // This may be a bad idea - for example consider links that pass parameters in the url for tracking purposes.
            // Currently this is not a problem.
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

            var linkData = ' '+ linkText + ' ' + link.className + ' ' + link.id;
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
            if (linkData.match(readability.regexps.negative)) {
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
    getClassWeight: function(element) {
        if (!readability.flagIsActive(readability.FLAG_WEIGHT_CLASSES)) {
            return 0;
        }

        var weight = 0;

        /* Look for a special classname */
        if (typeof(element.className) === 'string' && element.className !== '') {
            if (element.className.search(readability.regexps.negative) !== -1) {
                weight -= 25;
            }

            if (element.className.search(readability.regexps.positive) !== -1) {
                weight += 25;
            }
        }

        /* Look for a special ID */
        if (typeof(element.id) === 'string' && element.id !== '') {
            if (element.id.search(readability.regexps.negative) !== -1) {
                weight -= 25;
            }

            if (element.id.search(readability.regexps.positive) !== -1) {
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