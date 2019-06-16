const ptvAPI = require('../../../utils/ptv-api');
const express = require('express');
const router = new express.Router();
const TimedCache = require('timed-cache');

const {getStopFromPTVStopID} = require('../../../utils/bus-stop');
const {queryServiceData} = require('../../../utils/bus-service');

let cachedRuns = new TimedCache({ defaultTtl: 1000 * 60 * 1 });
let cachedRunInfo = new TimedCache({ defaultTtl: 100 * 60 * 10 });

function getRunService(runID, db, callback) {
    if (cachedRunInfo.get(runID)) {
        callback(cachedRunInfo.get(runID));
        return;
    }

    ptvAPI.makeRequest(`/v3/runs/${runID}/route_type/2`, (err, data) => {
        let runService = data.run.route_id,
            runDirection = data.run.direction_id,
            dest = data.run.final_stop_id,
            destName = data.run.destination_name.match(/^([^/]+)/)[1];

        queryServiceData({ ptvRouteID: runService, directionID: runDirection}, db, service => {
            cachedRunInfo.put(runID, {service: service[0], dest, destName});
            callback({service: service[0], dest, destName});
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
                destStop = data.dest,
                {destName} = data;
            let secondLastStop = busService.stops[busService.stops.indexOf(busService.stops.filter(s => s.busStopCode == destStop)[0]) - 1].busStopCode;
            let departureURL = `/v3/departures/route_type/2/stop/${busStop.busStopCodes[0]}/route/${busService.ptvRouteID}?direction_id=${busService.directionID}&max_results=30`;
            ptvAPI.makeRequest(departureURL, (err, data) => {
                let departure = data.departures.filter(d => d.run_id == runID)[0];
                let timeOffset = 0;
                ptvAPI.makeRequest(`/v3/pattern/run/${runID}/route_type/2?stop_id=${secondLastStop}`, (err, data) => {
                    if (departure) {
                        let patternDeparture = data.departures.filter(d => d.stop_id == busStop.busStopCodes[0])[0];
                        if (patternDeparture.estimated_departure_utc && departure.estimated_departure_utc) {
                            timeOffset = +new Date(new Date(patternDeparture.estimated_departure_utc) - new Date(departure.estimated_departure_utc));
                        }
                    }
                    let finalData = {
                        departures: data.departures.map(departure => {
                            let arrivalTime = +new Date(departure.estimated_departure_utc || departure.scheduled_departure_utc);
                            arrivalTime = new Date(arrivalTime - timeOffset);

                            let transformed = {
                                stopID: departure.stop_id,
                                arrivalTime,
                                headwayDeviance: !!departure.estimated_departure_utc ?
                                    (new Date(departure.scheduled_departure_utc) - arrivalTime) / 1000 : null
                            };

                            return transformed;
                        }),
                        service: busService,
                        busStop,
                        destName
                    };

                    cachedRuns.put(runID, finalData);
                    callback(finalData);
                });
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
                    getStopFromPTVStopID(dep.stopID, res.db, busStop => {
                        busStops[dep.stopID] = busStop;
                        resolve();
                    });
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
