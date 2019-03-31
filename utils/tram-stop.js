const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');

let tramStopLocks = {};

function populateTramStopData(tramStop, callback) {
    let promises = [];

    let id = tramStop.bookmarkCode;

    if (tramStopLocks[id]) {
        tramStopLocks[id].on('loaded', updatedTramStop => {
            callback(updatedTramStop);
        });
        return;
    }

    tramStopLocks[id] = new EventEmitter();
    tramStopLocks[id].setMaxListeners(30);

    tramStop.gtfsTramStopCodes.forEach(gtfsTramStopCodes => {
        promises.push(new Promise(resolve => {
            ptvAPI.makeRequest(`/v3/stops/${gtfsTramStopCodes}/route_type/1?gtfs=true`, (err, data) => {
                let stopData = data.stop;
                if (!tramStop.tramStopCodes.includes(stopData.stop_id))
                    tramStop.tramStopCodes.push(stopData.stop_id);

                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {

        tramStopLocks[id].emit('loaded', tramStop);
        delete tramStopLocks[id];

        callback(tramStop);
    })
}

function getTramStop(properties, db, callback) {
    db.getCollection('tram stops').findDocument(properties, (err, tramStop) => {
        if (!tramStop) {
            callback(null);
            return;
        }

        updateTramStopIfNeeded(tramStop, db, callback);
    });
}

function updateTramStopIfNeeded(tramStop, db, callback) {
    if (!tramStop.tramStopCodes.length) {
        populateTramStopData(tramStop, updatedTramStop => {
            db.getCollection('tram stops').updateDocument({_id: tramStop._id}, { $set: updatedTramStop }, () => {
                callback(updatedTramStop);
            });
        });
    } else {
        callback(tramStop);
    }
}

function updateTramStopsAsNeeded(tramStops, db, callback) {
    let promises = [];
    let finalTramStops = [];

    tramStops.forEach(tramStop => {
        promises.push(new Promise(resolve => {
            updateTramStopIfNeeded(tramStop, db, updatedTramStop => {
                finalTramStops.push(updatedTramStop);
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => callback(finalTramStops));
}

module.exports = {
    getTramStop,
    updateTramStopsAsNeeded
};
