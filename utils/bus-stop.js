const ptvAPI = require('./ptv-api');

function populateBusStopData(busStop, callback) {
    ptvAPI.makeRequest(`/v3/stops/${busStop.gtfsBusStopCodes[0]}/route_type/2?gtfs=true`, (err, data) => {
        let stopData = data.stop;
        busStop.busStopCode = stopData.stop_id;
        callback(busStop);
    });
}

function getBusStop(busStopCode, db, callback) {
    db.getCollection('bus stops').findDocument({ busStopCode }, (err, busStop) => {
        if (!busStop) {
            callback(null);
            return;
        }

        updateBusStopIfNeeded(busStop, db, callback);
    });
}

function updateBusStopIfNeeded(busStop, db, callback) {
    if (!busStop.busStopCode) {
        populateBusStopData(busStop, updatedBusStop => {
            db.getCollection('bus stops').updateDocument({_id: busStop._id}, { $set: updatedBusStop }, () => {
                callback(updatedBusStop);
            });
        });
    } else {
        callback(busStop);
    }
}

function updateBusStopsAsNeeded(busStops, db, callback) {
    let promises = [];
    let finalBusStops = [];

    busStops.forEach(busStop => {
        promises.push(new Promise(resolve => {
            updateBusStopIfNeeded(busStop, db, updatedBusStop => {
                finalBusStops.push(updatedBusStop);
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => callback(finalBusStops));
}

module.exports = {
    getBusStop,
    updateBusStopsAsNeeded
};
