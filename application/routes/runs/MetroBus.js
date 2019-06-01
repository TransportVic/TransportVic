const ptvAPI = require('../../../utils/ptv-api');
const express = require('express');
const router = new express.Router();
const TimedCache = require('timed-cache');

const {getServiceInfo} = require('../../timings/bus-timings');

let cachedRuns = new TimedCache({ defaultTtl: 1000 * 60 * 1 });

function getRunData(data, db, callback) {
    let { runID, cleanSuburb, cleanBusStopName } = data;
    db.getCollection('bus stops').findDocument({
        cleanSuburb, cleanBusStopName
    }, (err, busStop) => {
        if (cachedRuns.get(runID)) {
            callback(cachedRuns.get(runID));
            return;
        }

        ptvAPI.makeRequest(`/v3/pattern/run/${runID}/route_type/2?stop_id=${busStop.busStopCodes[0]}`, (err, data) => {
            let serviceID = data.departures[0].route_id,
                directionID = data.departures[0].direction_id;
            getServiceInfo(serviceID, directionID, db, busService => {
                let finalData = {
                    departures: data.departures,
                    service: busService
                };

                cachedRuns.put(runID, finalData);
                callback(finalData);
            });
        });
    });
}

router.get('/:runID/:cleanSuburb/:cleanBusStopName', (req, res) => {
    getRunData(req.params, res.db, runData => {
        res.json(runData)
    });
});

module.exports = router;
