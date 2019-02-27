const DatabaseConnection = require('../application/database/DatabaseConnection');
const metroTramStops = require('./metro-tram-stops.json').features;
const config = require('../config.json');
const crypto = require('crypto');
const freeTramZonePolygon = require('./free-tram-zone');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let tramStops = null;

let promises = [];

function hashTramStop(tramStop) {
    let hash = crypto.createHash('sha1');
    hash.update(tramStop.tramStopName + tramStop.suburb);

    return hash.digest('hex').slice(0, 6);
}

function transformTramStop(inputTramStop) {
    if (inputTramStop.properties.STOP_ID === '46517') inputTramStop.properties.STOP_NAME = '48A-Dandenong Rd/Dandenong Rd (Caulfield North)';

    let stopNameData = inputTramStop.properties.STOP_NAME.match(/(\d+\w?)-([^\(]+) \((.+)+\)/);
    if (!stopNameData) stopNameData = [0, inputTramStop.properties.STOP_NAME, ''];
    return {
        tramStopCodes: [inputTramStop.properties.STOP_ID],
        tramStopNumber: stopNameData[1],
        tramStopName: stopNameData[2],
        suburb: stopNameData[3],
        mykiZones: inputTramStop.properties.TICKETZONE.split(','),
        routes: inputTramStop.properties.ROUTEUSSP.split(','),

        location: {
            type: "MultiPoint",
            coordinates: [
                [inputTramStop.properties.LONGITUDE,
                inputTramStop.properties.LATITUDE]
            ]
        },
        tramTrackerID: 0
    }
}

function mergeTramStops(allTramStops) {
    let final = {};

    allTramStops.forEach(tramStop => {
        if (Object.keys(final).includes(tramStop.properties.STOP_ID)) {
            final[tramStop.properties.STOP_ID].properties.ROUTEUSSP += ',' + tramStop.properties.ROUTEUSSP;
            final[tramStop.properties.STOP_ID].properties.STOP_NAME =
                [final[tramStop.properties.STOP_ID].properties.STOP_NAME, tramStop.properties.STOP_NAME]
                .sort((a, b) => b.length - a.length)[0];

            final[tramStop.properties.STOP_ID];
        } else {
            final[tramStop.properties.STOP_ID] = tramStop;
        }
    });

    return Object.values(final);
}

let transformedStops = Object.values(mergeTramStops(metroTramStops).map(transformTramStop).reduce((acc, tramStop) => {
    if (acc[tramStop.tramStopName + tramStop.tramStopNumber]) {
        let svc = acc[tramStop.tramStopName + tramStop.tramStopNumber];

        svc.tramStopCodes.push(tramStop.tramStopCodes[0]);
        svc.routes = svc.routes.concat(tramStop.routes).filter((e, i, a) => a.indexOf(e) == i).sort((a, b) => a*1 - b*1);
        svc.location.coordinates = svc.location.coordinates.concat(tramStop.location.coordinates);

        acc[tramStop.tramStopName + tramStop.tramStopNumber] = svc;
    } else
        acc[tramStop.tramStopName + tramStop.tramStopNumber] = tramStop;

    return acc;
}, {}));

database.connect({
    poolSize: 100
}, (err) => {
    tramStops = database.getCollection('tram stops');
    tramStops.createIndex({ location: "2dsphere", tramStopName: 1, tramStopCodes: 1, tramTrackerID: 1 });

    transformedStops.forEach(stop => {
        promises.push(new Promise(resolve => {
            stop.bookmarkCode = hashTramStop(stop);

            tramStops.countDocuments({ tramStopName: stop.tramStopName, suburb: stop.suburb }, (err, present) => {
                if (present) {
                    tramStops.updateDocument({ tramStopName: stop.tramStopName, suburb: stop.suburb }, {
                        $set: stop
                    }, resolve);
                } else {
                    tramStops.createDocument(stop, resolve);
                }
            });
        }));
    });

    Promise.all(promises).then(() => {
        tramStops.findDocuments({
            location: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: freeTramZonePolygon
                    }
                }
            }
        }).toArray((err, stops)=>console.log(err, stops));
        tramStops.updateDocuments({
            location: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: freeTramZonePolygon
                    }
                }
            }
        }, { $set: { mykiZones: ['Free Tram Zone', '1'] } }, () => {
            console.log('Loaded ' + promises.length + ' tram stops');
            process.exit();
        });
    });
});
