const DatabaseConnection = require('../application/database/DatabaseConnection');
const config = require('../config.json');
const levenshtein = require('fast-levenshtein');
const ptvStopIDs = require('../stops.json').stops.filter(stop => stop.primaryChronosMode == 2);

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let busStops = null;

function updateStopData(position, ptvStopID, stopName, callback) {
    busStops.findDocuments({
        location: {
            $nearSphere: {
                $geometry: {
                    type: 'Point',
                    coordinates: [position.lon, position.lat]
                },
                $maxDistance: 10
            }
        }
    }).toArray((err, foundBusStops) => {
        foundBusStops = foundBusStops.map(busStop => {
            busStop.levDistance = levenshtein.get(busStop.busStopName, stopName);
            return busStop;
        });

        let busStop = foundBusStops.sort((a, b) => a.levDistance - b.levDistance)[0];

        if (!busStop) {
            callback();
            return;
        }

        if (busStop.busStopCodes.includes(ptvStopID)) {
            callback();
            return;
        }

        busStops.updateDocument({ _id: busStop._id }, {
            $set: {
                busStopCodes: busStop.busStopCodes.concat([ptvStopID]),
                skeleton: (busStop.busStopCodes.length < busStop.gtfsBusStopCodes.length)
            }
        }, () => callback());
    });
}

database.connect({
    poolSize: 100
}, (err) => {
    busStops = database.getCollection('bus stops');

    let promises = [];

    ptvStopIDs.forEach(stop => {
        promises.push(new Promise(resolve => {
            updateStopData(stop.location, stop.id, stop.title.trim(), resolve);
        }));
    });

    Promise.all(promises).then(() => {
        console.log('Synced PTV stop ids for ' + promises.length + ' bus stops');
        process.exit();
    });
});
