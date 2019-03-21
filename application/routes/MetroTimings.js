const express = require('express');
const router = new express.Router();
const { getTimings } = require('../timings/metro-timings');
const { getTrainStation } = require('../../utils/train-station');

router.get('/:stationName', (req, res) => {
    let {stationName} = req.params;
    let fullStationName = stationName.split('-').map(word =>
        word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ') + ' Railway Station';

    getTrainStation(fullStationName, res.db, trainStation => {
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
