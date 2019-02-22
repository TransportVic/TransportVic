const express = require('express');
const router = new express.Router();
const safeRegex = require('safe-regex');
const { getServiceData } = require('../../utils/bus-service');

router.get('/', (req, res) => {
    res.render('index');
});

router.get('/search', (req, res) => {
    let query = req.url.query.q;

    if (!safeRegex(query)) {
        res.end(':(');
        return;
    }


    res.db.getCollection('bus stops').findDocuments({
        $or: [
            { busStopName: new RegExp(query, 'i') },
            { busStopCodes: query }
        ]
    }).toArray((err, busStops) => {
        busStops = busStops.slice(0, 20);
        getServiceData(query, res.db, services => {
            res.end(JSON.stringify(busStops.concat(services), null, 2));
        });
    });
});

module.exports = router;
