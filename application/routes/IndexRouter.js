const express = require('express');
const router = new express.Router();
const safeRegex = require('safe-regex');
const { getServiceData } = require('../../utils/bus-service');
const { updateBusStopsAsNeeded, getBusStop } = require('../../utils/bus-stop');
const { getTimings } = require('../timings/bus-timings');

router.get('/', (req, res) => {
    res.render('index');
});

module.exports = router;
