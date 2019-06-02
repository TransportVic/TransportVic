const express = require('express');
const router = new express.Router();
const { getTimings } = require('../../timings/bus-timings');
const { getBusStop } = require('../../../utils/bus-stop');

router.get('/:suburb/:busStopName', (req, res, next) => {
    getBusStop({
        cleanSuburb: req.params.suburb.toLowerCase(),
        cleanBusStopName: req.params.busStopName.toLowerCase()
    }, res.db, busStop => {
        if (!busStop) {
            return next();
        }

        getTimings(busStop.busStopCodes, res.db, timings => {
            res.render('bus/timings', { timings, busStop });
        });
    });
});

module.exports = router;
