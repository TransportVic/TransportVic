let express = require('express');
let router = new express.Router();
let safeRegex = require('safe-regex');

router.get('/', (req, res) => {
    res.render('index');
});

router.get('/search', (req, res) => {
    let query = req.url.query.q;

    if (!safeRegex(query) || query.length < 4) {
        res.end(':(');
        return;
    }

    res.db.getCollection('bus stops').findDocuments({
        $or: [
            { busStopName: new RegExp(query, 'i') },
            { busStopCodes: query }
        ]
    }).toArray((err, busStops) => {
        res.end(JSON.stringify(busStops, null, 2));
    });
});

module.exports = router;
