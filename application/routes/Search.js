const express = require('express');
const router = new express.Router();
const safeRegex = require('safe-regex');
const { getServiceData } = require('../../utils/bus-service');
const { updateBusStopsAsNeeded } = require('../../utils/bus-stop');
const { updateTrainStationsAsNeeded } = require('../../utils/train-station');
const { getTimings } = require('../timings/bus-timings');

router.get('/', (req, res) => {
    res.render('search');
});

function getBusStops(query, db, callback) {
    let busStopsQueries = [{ gtfsBusStopCodes: query }];
    if (query.length > 4) {
        busStopsQueries.push({ busStopName: new RegExp(query, 'i') });
    }

    db.getCollection('bus stops').findDocuments({
        $or: busStopsQueries
    }).toArray((err, busStops) => {
        busStops = busStops.slice(0, 10);
        updateBusStopsAsNeeded(busStops, db, updatedBusStops => {
            callback(updatedBusStops);
        });
    });
}

function getTrainStations(query, db, callback) {
    if (query.length > 4)
        db.getCollection('train stations').findDocuments({
            stationName: new RegExp(query, 'i')
        }).toArray((err, stations) => {
            stations = stations.slice(0, 5);
            updateTrainStationsAsNeeded(stations, db, updatedStations => {
                callback(updatedStations);
            });
        });
    else {
        callback([]);
    }
}

function getTramStops(query, db, callback) {
    let tramStopQueries = [{ tramTrackerID: query }];
    if (query.length > 4) {
        tramStopQueries.push({ tramStopName: new RegExp(query, 'i') });
    }

    db.getCollection('tram stops').findDocuments({
        $or: tramStopQueries
    }).toArray((err, tramStops) => {
        tramStops = tramStops.slice(0, 10);
        callback(tramStops); // need to update
    });
}

router.post('/', (req, res) => {
    let {query} = req.body;

    if (!safeRegex(query)) {
        res.end(':(');
        return;
    }

    let promises = [];
    let searchResults = {};
    let fields = {
        busServices: getServiceData,
        busStops: getBusStops,
        trainStations: getTrainStations,
        tramStops: getTramStops
    };

    Object.keys(fields).forEach(fieldName => {
        promises.push(new Promise(resolve => {
            fields[fieldName](query, res.db, data => {
                searchResults[fieldName] = data;
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        res.render('search/results', searchResults);
    });
});

module.exports = router;
