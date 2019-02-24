const express = require('express');
const router = new express.Router();
const safeRegex = require('safe-regex');
const { getServiceData } = require('../../utils/bus-service');
const { updateBusStopsAsNeeded, getBusStop } = require('../../utils/bus-stop');
const { getTimings } = require('../timings/bus-timings');

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
            { gtfsBusStopCodes: query }
        ]
    }).toArray((err, busStops) => {
        busStops = busStops.slice(0, 20);
        updateBusStopsAsNeeded(busStops, res.db, updatedBusStops => {
            getServiceData(query, res.db, services => {
                res.end(JSON.stringify(updatedBusStops.concat(services), null, 2));
            });
        });
    });
});

router.get('/timings', (req, res) => {
    let gftsBusStopCode = req.url.query.q;
    getBusStop(gftsBusStopCode, res.db, busStop => {
        if (!busStop) {
            res.end(':(');
            return;
        }

        getTimings(busStop.busStopCodes, res.db, timings => {
            res.render('bus/timings', { timings, busStop });
        });
    });
})

module.exports = router;
