const express = require('express');
const router = new express.Router();
const safeRegex = require('safe-regex');
const { getServiceData } = require('../../utils/bus-service');
const { updateBusStopsAsNeeded, getBusStop } = require('../../utils/bus-stop');
const { getTimings } = require('../timings/bus-timings');

router.get('/', (req, res) => {
    res.render('search');
});

router.post('/', (req, res) => {
    let {query} = req.body;

    if (!safeRegex(query)) {
        res.end(':(');
        return;
    }


    let busStopsQueries = [{ gtfsBusStopCodes: query }];
    if (query.length > 5) {
        busStopsQueries.push({ busStopName: new RegExp(query, 'i') });
    }

    res.db.getCollection('bus stops').findDocuments({
        $or: busStopsQueries
    }).toArray((err, busStops) => {
        updateBusStopsAsNeeded(busStops, res.db, updatedBusStops => {

            getServiceData(query, res.db, busServices => {
                res.render('search/results', {busServices, busStops: updatedBusStops});
            });

        });
    });
});

module.exports = router;
