const express = require('express');
const router = new express.Router();
const { getTimings } = require('../timings/bus-timings');
const { getBusStop } = require('../../utils/bus-stop');

router.get('/:suburb/:busStopName', (req, res) => {
    getBusStop({
        cleanSuburb: req.params.suburb.toLowerCase(),
        cleanBusStopName: req.params.busStopName.toLowerCase()
    }, res.db, busStop => {
        if (!busStop) {
            res.end(':(');
            return;
        }

        getTimings(busStop.busStopCodes, res.db, timings => {
            res.render('bus/timings', { timings, busStop });
        });
    });
});

module.exports = router;
