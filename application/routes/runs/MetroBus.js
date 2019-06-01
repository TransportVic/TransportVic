const ptvAPI = require('../../../utils/ptv-api');
const express = require('express');
const router = new express.Router();
const TimedCache = require('timed-cache');

const {updateBusStopFromPTVStopID} = require('../../../utils/bus-stop');
const {getServiceInfo} = require('../../timings/bus-timings');

let cachedRuns = new TimedCache({ defaultTtl: 1000 * 60 * 1 });
let cachedRunInfo = new TimedCache({ defaultTtl: 100 * 60 * 1 });

function getRunService(runID, db, callback) {
    if (cachedRunInfo.get(runID)) {
        callback(cachedRunInfo.get(runID));
        return;
    }

    ptvAPI.makeRequest(`/v3/runs/${runID}/route_type/2`, (err, data) => {
        let runService = data.run.route_id,
            runDirection = data.run.direction_id,
            dest = data.run.final_stop_id;

        getServiceInfo(runService, runDirection, db, service => {
            cachedRunInfo.put(runID, {service, dest});
            callback({service, dest});
        });
    });
}

function getRunData(data, db, callback) {
    let { runID, cleanSuburb, cleanBusStopName } = data;
    db.getCollection('bus stops').findDocument({
        cleanSuburb, cleanBusStopName
    }, (err, busStop) => {
        if (cachedRuns.get(runID)) {
            callback(cachedRuns.get(runID));
            return;
        }

        getRunService(runID, db, data => {
            let busService = data.service,
                destStop = data.dest;
            let fromStop = busService.stops[busService.stops.indexOf(busService.stops.filter(s => s.busStopCode == destStop)[0]) - 1].busStopCode;
            ptvAPI.makeRequest(`/v3/pattern/run/${runID}/route_type/2?stop_id=${fromStop}`, (err, data) => {
                let finalData = {
                    departures: data.departures.map(departure => {
                        let transformed = {
                            stopID: departure.stop_id,
                            arrivalTime: new Date(departure.estimated_departure_utc || departure.scheduled_departure_utc),
                            headwayDeviance: !!departure.estimated_departure_utc ?
                                (new Date(departure.scheduled_departure_utc) - new Date(departure.estimated_departure_utc)) / 1000 : null
                        };

                        return transformed;
                    }),
                    service: busService,
                    busStop
                };

                cachedRuns.put(runID, finalData);
                callback(finalData);
            });
        });
    });
}

router.get('/:runID/:cleanSuburb/:cleanBusStopName', (req, res) => {
    getRunData(req.params, res.db, runData => {
        let promises = [];
        let busStops = {};
        runData.departures.forEach(dep => {
            promises.push(new Promise(resolve => {
                res.db.getCollection('bus stops').findDocument({
                    busStopCodes: dep.stopID
                }, (err, busStop) => {
                    if (busStop) {
                        busStops[dep.stopID] = busStop;
                        resolve();
                    } else {
                        updateBusStopFromPTVStopID(dep.stopID, res.db, busStop => {
                            busStops[dep.stopID] = busStop;
                            resolve();
                        })
                    }
                });
            }));
        });

        Promise.all(promises).then(() => {
            runData.stops = busStops;
            // res.json(runData)
            res.render('bus/run', runData);
        });
    });
});

module.exports = router;
