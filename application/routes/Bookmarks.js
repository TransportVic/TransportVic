const express = require('express');
const router = new express.Router();
const { getBusStop } = require('../../utils/bus-stop');

router.get('/', (req, res) => {
    res.render('bookmarks/index');
});

router.post('/', (req, res) => {
    let bookmarkCodes = req.body.codes;
    if (!bookmarkCodes || !bookmarkCodes.length) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<div id="no-bookmarks"><span>Nothing appears to be bookmarked!</span></div>`);
        return;
    }

    res.db.getCollection('bus stops').findDocuments({
        $or: bookmarkCodes.map(bookmarkCode => {
            return { bookmarkCode };
        })
    }).toArray((err, busStops) => {
        res.render('search/results', {busStops, busServices: []});
    });;

});

module.exports = router;
