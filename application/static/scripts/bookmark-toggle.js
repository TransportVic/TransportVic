function toggleBookmark(bookmarkCode) {
    setBookmarked(bookmarkCode, !isBookmarked(bookmarkCode));
    checkBookmark(bookmarkCode);
}

function checkBookmark(bookmarkCode) {
    if (isBookmarked(bookmarkCode)) $('#bookmark-status').src = '/static/images/bookmark/filled.svg';
    else $('#bookmark-status').src = '/static/images/bookmark/empty.svg';
}

$.ready(() => {
    checkBookmark(window.bookmarkCode);
});
