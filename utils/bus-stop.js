const crypto = require('crypto');
const ptvAPI = require('./ptv-api');

function hashBusStop(busStop) {
    let hash = crypto.createHash('sha1');
    hash.update('busstop-' + busStop.busStopName + busStop.suburb);

    return hash.digest('hex').slice(0, 6);
}

function populateBusStopData(busStop, callback) {
    ptvAPI.makeRequest(`/v3/stops/${busStop.gtfsBusStopCodes[0]}/route_type/2?gtfs=true` + (busStop.suburb == '-TELEBUS' ? '&stop_location=true' : ''), (err, data) => {
        let stopData = data.stop;
        busStop.busStopCodes.push(stopData.stop_id);

        if (busStop.busStopName === 'Monash University/Wellington Rd') {
            if (!busStop.busStopCodes.includes(33430))
                busStop.busStopCodes.push(33430);
        }

        if (busStop.suburb == '-TELEBUS') {
            busStop.busStopName = stopData.stop_name.trim();
            busStop.cleanBusStopName = busStop.busStopName.replace(/[^\w]/g, '-').replace(/-+/g, '-').toLowerCase();
            busStop.suburb = stopData.stop_location.suburb;
            busStop.cleanSuburb = busStop.suburb.toLowerCase();

            busStop.bookmarkCode = hashBusStop(busStop);
        }

        callback(busStop);
    });
}

function getBusStop(properties, db, callback) {
    db.getCollection('bus stops').findDocument(properties, (err, busStop) => {
        if (!busStop) {
            callback(null);
            return;
        }

        updateBusStopIfNeeded(busStop, db, callback);
    });
}

function updateBusStopIfNeeded(busStop, db, callback) {
    if (!busStop.busStopCodes.length) {
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
    updateBusStopsAsNeeded,
    hashBusStop
};
