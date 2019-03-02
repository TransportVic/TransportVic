const DatabaseConnection = require('../application/database/DatabaseConnection');
const config = require('../config.json');
const request = require('request');
const tramTrackerIDData = require('./data/tramtracker-ids.json');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let tramStops = null;

let promises = [];

database.connect({
    poolSize: 100
}, (err) => {
    tramStops = database.getCollection('tram stops');

    tramTrackerIDData.stops.forEach(stop => {
        promises.push(new Promise(resolve => {
            tramStops.countDocuments({ tramStopNumber: stop.stopNumber, tramStopName: new RegExp(stop.stopName + '/') }, (err, present) => {
                if (present == 1)
                    tramStops.updateDocument({ tramStopNumber: stop.stopNumber, tramStopName: new RegExp(stop.stopName + '/') }, {
                        $set: { tramTrackerID: stop.tramTrackerID }
                    }, resolve);
                else
                    tramStops.updateDocument({
                        tramStopNumber: stop.stopNumber,
                        suburb: stop.suburb,
                        routes: tramTrackerIDData.serviceByStops[stop.tramTrackerID].sort((a,b)=>a*1-b*1),
                        tramTrackerID: 0
                    }, {
                        $set: { tramTrackerID: stop.tramTrackerID }
                    }, resolve);
            });
        }));
    });

    Promise.all(promises).then(() => {
        console.log('Updated tramtracker IDs for ' + promises.length + ' stops');
        process.exit();
    });
});
