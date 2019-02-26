window.setBookmarked = function(bookmarkCode, state) {
    localStorage.setItem(bookmarkCode, state);
    if (state == false)
        localStorage.removeItem(bookmarkCode);
}

window.isBookmarked = function(bookmarkCode) {
    return localStorage.getItem(bookmarkCode) === 'true';
}

window.getAllBookmarks = function() {
    return Object.keys(localStorage).filter(bookmarkCode => localStorage[bookmarkCode] === 'true');
}
