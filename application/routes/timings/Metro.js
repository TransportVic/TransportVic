const express = require('express');
const router = new express.Router();
const { getTimings } = require('../../timings/metro-timings');
const { getTrainStation } = require('../../../utils/train-station');

router.get('/:cleanStationName', (req, res) => {
    let {cleanStationName} = req.params;
    getTrainStation(cleanStationName, res.db, trainStation => {
        if (!trainStation) {
            res.end(':(');
            return;
        }

        getTimings(trainStation.ptvTrainStationID, res.db, (timings, lineCount) => {
            res.render('metro/timings', { timings, trainStation, lineCount });
        });
    });
});

module.exports = router;
