const express = require('express');
const router = new express.Router();
const { getBusStop } = require('../../utils/bus-stop');

router.get('/', (req, res) => {
    res.render('bookmarks/index');
});

function getBookmarks(db, collection, bookmarkCodes, callback) {
    db.getCollection(collection).findDocuments({
        $or: bookmarkCodes.map(bookmarkCode => {
            return { bookmarkCode };
        })
    }).toArray((err, stops) => {
        callback(stops)
    });;
}

router.post('/', (req, res) => {
    let bookmarkCodes = req.body.codes;
    if (!bookmarkCodes || !bookmarkCodes.length) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<div id="no-bookmarks"><span>Nothing appears to be bookmarked!</span></div>`);
        return;
    }

    let bookmarkTypes = {
        busServices: '',
        busStops: 'bus stops',
        trainStations: 'train stations',
        tramStops: 'tram stops'
    };
    let allBookmarks = {};
    let promises = [];

    Object.keys(bookmarkTypes).forEach(bookmarkKey => {
        if (!bookmarkTypes[bookmarkKey].length) {
            allBookmarks[bookmarkKey] = [];
            return;
        }

        promises.push(new Promise(resolve => {
            getBookmarks(res.db, bookmarkTypes[bookmarkKey], bookmarkCodes, bookmarks => {
                allBookmarks[bookmarkKey] = bookmarks;
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        res.render('search/results', allBookmarks);
    });

});

module.exports = router;
