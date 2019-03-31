const express = require('express');
const router = new express.Router();
const { getTimings } = require('../timings/tram-timings');
const { getTramStop } = require('../../utils/tram-stop');

router.get('/:cleanSuburb/:cleanTramStopName', (req, res) => {
    getTramStop(req.params, res.db, tramStop => {
        if (!tramStop) {
            res.end(':(');
            return;
        }

        getTimings(tramStop.tramStopCodes, res.db, timings => {
            res.render('tram/timings', { timings, tramStop });
        });
    });
});

module.exports = router;
