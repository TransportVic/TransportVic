const express = require('express');
const router = new express.Router();
const { getTimings } = require('../timings/bus-timings');
const { getBusStop } = require('../../utils/bus-stop');

router.get('/:gftsBusStopCode', (req, res) => {
    let {gftsBusStopCode} = req.params;

    getBusStop(gftsBusStopCode, res.db, busStop => {
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
